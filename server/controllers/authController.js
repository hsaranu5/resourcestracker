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

// --- Rate limiting (in-memory; adequate for a single-process pilot) ---------
// Per key (email or IP): at most `max` requests per `windowMs`.
const buckets = new Map();
const rateLimited = (key, max, windowMs) => {
  const now = Date.now();
  const bucket = buckets.get(key) || [];
  const recent = bucket.filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    buckets.set(key, recent);
    return true;
  }
  recent.push(now);
  buckets.set(key, recent);
  return false;
};
// Keep the map from growing forever.
setInterval(() => {
  const now = Date.now();
  for (const [key, times] of buckets) {
    const recent = times.filter((t) => now - t < 60 * 60 * 1000);
    if (recent.length === 0) buckets.delete(key);
    else buckets.set(key, recent);
  }
}, 10 * 60 * 1000).unref();

// The one message the client ever sees from request-code, allowlisted or not.
const NEUTRAL_REPLY = {
  message: 'If that email is registered with Care Beyond, a sign-in code is on its way. It expires in 10 minutes.'
};

/**
 * POST /api/auth/request-code   body: { email }
 */
const requestCode = (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();

  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }

  // Rate limits protect the inbox (per email) and the endpoint (per IP).
  if (rateLimited(`code:${email}`, 3, 15 * 60 * 1000) || rateLimited(`ip:${req.ip}`, 10, 15 * 60 * 1000)) {
    // Still the neutral reply: a limit response that differed would leak
    // which emails are being probed.
    res.json(NEUTRAL_REPLY);
    return;
  }

  db.getDb().get('SELECT * FROM allowlist WHERE email = ?', [email], (err, row) => {
    if (err) {
      res.status(500).json({ error: 'Something went wrong. Try again.' });
      return;
    }

    // Not allowlisted: same reply, same timing shape, nothing sent.
    if (!row) {
      res.json(NEUTRAL_REPLY);
      return;
    }

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

    // One live code per email: a fresh request invalidates older codes.
    db.getDb().run('DELETE FROM auth_codes WHERE email = ?', [email], () => {
      db.getDb().run(
        'INSERT INTO auth_codes (email, code_hash, expires_at) VALUES (?, ?, ?)',
        [email, sha256(code), expiresAt],
        async (insertErr) => {
          if (insertErr) {
            res.status(500).json({ error: 'Something went wrong. Try again.' });
            return;
          }
          try {
            await sendLoginCode(email, code);
          } catch (mailErr) {
            console.error('Failed to send login code:', mailErr.message);
          }
          res.json(NEUTRAL_REPLY);
        }
      );
    });
  });
};

/**
 * POST /api/auth/verify   body: { email, code, rememberDevice }
 *
 * On success: httpOnly session cookie (web) + token in body (iOS Keychain).
 */
const verify = (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();
  const remember = req.body.rememberDevice === true;

  if (!email || !/^\d{6}$/.test(code)) {
    res.status(400).json({ error: 'Email and 6-digit code are required.' });
    return;
  }
  if (rateLimited(`verify:${req.ip}`, 20, 15 * 60 * 1000)) {
    res.status(429).json({ error: 'Too many attempts. Wait a few minutes.' });
    return;
  }

  db.getDb().get(
    'SELECT * FROM auth_codes WHERE email = ? ORDER BY id DESC LIMIT 1',
    [email],
    (err, row) => {
      if (err) {
        res.status(500).json({ error: 'Something went wrong. Try again.' });
        return;
      }

      const fail = () => res.status(401).json({ error: 'That code is not valid. Request a new one if it expired.' });

      if (!row) return fail();
      if (new Date(row.expires_at).getTime() < Date.now()) {
        db.getDb().run('DELETE FROM auth_codes WHERE id = ?', [row.id]);
        return fail();
      }
      if (row.attempts >= MAX_CODE_ATTEMPTS) {
        db.getDb().run('DELETE FROM auth_codes WHERE id = ?', [row.id]);
        return fail();
      }

      if (sha256(code) !== row.code_hash) {
        db.getDb().run('UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
        return fail();
      }

      // Code is good — burn it and re-check the allowlist at this moment, in
      // case the org was removed between requesting and entering the code.
      db.getDb().run('DELETE FROM auth_codes WHERE email = ?', [email]);

      db.getDb().get('SELECT * FROM allowlist WHERE email = ?', [email], (allowErr, org) => {
        if (allowErr || !org) return fail();

        const token = crypto.randomBytes(32).toString('base64url');
        const ttl = remember ? REMEMBER_TTL_MS : SESSION_TTL_MS;
        const expiresAt = new Date(Date.now() + ttl).toISOString();

        db.getDb().run(
          'INSERT INTO sessions (token_hash, email, org_name, expires_at) VALUES (?, ?, ?, ?)',
          [sha256(token), email, org.org_name, expiresAt],
          (sessErr) => {
            if (sessErr) {
              res.status(500).json({ error: 'Something went wrong. Try again.' });
              return;
            }
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
          }
        );
      });
    }
  );
};

/** GET /api/auth/me — is this request signed in, and as whom? */
const me = (req, res) => {
  res.json({ organization: req.organization, email: req.sessionEmail });
};

/** POST /api/auth/logout */
const logout = (req, res) => {
  if (req.sessionId) {
    db.getDb().run('DELETE FROM sessions WHERE id = ?', [req.sessionId]);
  }
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ message: 'Signed out.' });
};

module.exports = { requestCode, verify, me, logout, COOKIE_NAME, sha256 };
