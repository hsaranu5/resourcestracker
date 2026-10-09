/**
 * Passwordless login for verified organisations.
 * Design: design/VERIFIED-POSTER-AUTH.md
 *
 * Flow: email → (if allowlisted) 6-digit code by email → session token.
 * The allowlist is the whole account system; there is nothing to register.
 *
 * Invariants this file must keep:
 *  - Identical response whether or not an email is allowlisted (no enumeration).
 *  - Codes and session tokens are stored only as SHA-256 hashes.
 *  - Codes: 10 minute expiry, 5 attempts max, newest code replaces older ones.
 *  - Sessions: 4 hours by default; 30 days only with explicit rememberDevice.
 *  - Web gets the token as an httpOnly cookie; the JSON body also carries it
 *    for the iOS app to store in the Keychain.
 */

const crypto = require('crypto');
const db = require('../database');
const { sendLoginCode } = require('../mailer');

const CODE_TTL_MS = 10 * 60 * 1000;          // 10 minutes
const MAX_CODE_ATTEMPTS = 5;
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;   // 4 hours
const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const COOKIE_NAME = 'org_session';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

// --- Rate limiting ---------------------------------------------------------
// Per key (email or IP): at most `max` requests per `windowMs`. The counters
// live in Postgres (rate_limit_hit() in server/schema.sql) because serverless
// instances share no memory; an in-process Map would give every instance its
// own allowance. Stale rows are pruned by the function itself and by the
// cron jobs (controllers/cronController.js).
const rateLimited = async (key, max, windowMs) => {
  const { rows } = await db.query('SELECT rate_limit_hit(?, ?, ?) AS limited', [key, max, windowMs]);
  return rows[0].limited;
};

// The one message the client ever sees from request-code, allowlisted or not.
const NEUTRAL_REPLY = {
  message: 'If that email is registered with Care Beyond, a sign-in code is on its way. It expires in 10 minutes.'
};

/**
 * POST /api/auth/request-code   body: { email }
 */
const requestCode = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();

  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }

  try {
    // Rate limits protect the inbox (per email) and the endpoint (per IP).
    if (await rateLimited(`code:${email}`, 3, 15 * 60 * 1000) || await rateLimited(`ip:${req.ip}`, 10, 15 * 60 * 1000)) {
      // Still the neutral reply: a limit response that differed would leak
      // which emails are being probed.
      res.json(NEUTRAL_REPLY);
      return;
    }

    const { rows: [row] } = await db.query('SELECT * FROM allowlist WHERE email = ?', [email]);

    // Not allowlisted: same reply, same timing shape, nothing sent.
    if (!row) {
      res.json(NEUTRAL_REPLY);
      return;
    }

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

    // One live code per email: a fresh request invalidates older codes.
    await db.query('DELETE FROM auth_codes WHERE email = ?', [email]).catch(() => {});
    await db.query(
      'INSERT INTO auth_codes (email, code_hash, expires_at) VALUES (?, ?, ?)',
      [email, sha256(code), expiresAt]
    );
    try {
      await sendLoginCode(email, code);
    } catch (mailErr) {
      console.error('Failed to send login code:', mailErr.message);
    }
    res.json(NEUTRAL_REPLY);
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
};

/**
 * POST /api/auth/verify   body: { email, code, rememberDevice }
 *
 * On success: httpOnly session cookie (web) + token in body (iOS Keychain).
 *
 * Every write is awaited before the reply: on Vercel the function can be
 * frozen once the response is sent, and a lost attempts++ would weaken the
 * 5-attempt limit.
 */
const verify = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();
  const remember = req.body.rememberDevice === true;

  if (!email || !/^\d{6}$/.test(code)) {
    res.status(400).json({ error: 'Email and 6-digit code are required.' });
    return;
  }

  const fail = () => res.status(401).json({ error: 'That code is not valid. Request a new one if it expired.' });

  try {
    if (await rateLimited(`verify:${req.ip}`, 20, 15 * 60 * 1000)) {
      res.status(429).json({ error: 'Too many attempts. Wait a few minutes.' });
      return;
    }

    const { rows: [row] } = await db.query(
      'SELECT * FROM auth_codes WHERE email = ? ORDER BY id DESC LIMIT 1',
      [email]
    );

    if (!row) return fail();
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await db.query('DELETE FROM auth_codes WHERE id = ?', [row.id]);
      return fail();
    }
    if (row.attempts >= MAX_CODE_ATTEMPTS) {
      await db.query('DELETE FROM auth_codes WHERE id = ?', [row.id]);
      return fail();
    }

    if (sha256(code) !== row.code_hash) {
      await db.query('UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
      return fail();
    }

    // Code is good — burn it and re-check the allowlist at this moment, in
    // case the org was removed between requesting and entering the code.
    await db.query('DELETE FROM auth_codes WHERE email = ?', [email]);

    let org;
    try {
      ({ rows: [org] } = await db.query('SELECT * FROM allowlist WHERE email = ?', [email]));
    } catch (allowErr) {
      return fail();
    }
    if (!org) return fail();

    const token = crypto.randomBytes(32).toString('base64url');
    const ttl = remember ? REMEMBER_TTL_MS : SESSION_TTL_MS;
    const expiresAt = new Date(Date.now() + ttl).toISOString();

    await db.query(
      'INSERT INTO sessions (token_hash, email, org_name, expires_at) VALUES (?, ?, ?, ?)',
      [sha256(token), email, org.org_name, expiresAt]
    );
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: ttl,
      path: '/'
    });
    res.json({
      organization: org.org_name,
      email,
      expiresAt,
      token // for the iOS app; web clients rely on the cookie
    });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
};

/** GET /api/auth/me — is this request signed in, and as whom? */
const me = (req, res) => {
  res.json({ organization: req.organization, email: req.sessionEmail });
};

/** POST /api/auth/logout */
const logout = async (req, res) => {
  if (req.sessionId) {
    await db.query('DELETE FROM sessions WHERE id = ?', [req.sessionId]).catch(() => {});
  }
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ message: 'Signed out.' });
};

module.exports = { requestCode, verify, me, logout, COOKIE_NAME, sha256 };
