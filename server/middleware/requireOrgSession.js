/**
 * Gate for anything that publishes content.
 *
 * The app is read-only for the people it serves — only organisations on the
 * Care Beyond allowlist can post. This replaces the old Bearer-token system
 * (see design/VERIFIED-POSTER-AUTH.md): access now comes from a session
 * created by the email-code login, and revoking an org is deleting one
 * allowlist row.
 *
 * Accepts the session token from either:
 *   - the httpOnly `org_session` cookie (web client), or
 *   - `Authorization: Bearer <token>` (iOS app, token kept in Keychain).
 *
 * Sets req.organization, req.sessionEmail, req.sessionId, req.role.
 */

const crypto = require('crypto');
const db = require('../database');

const COOKIE_NAME = 'org_session';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

// Minimal cookie parse — we only ever need this one cookie.
const readCookie = (req, name) => {
  const header = req.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
};

const requireOrgSession = async (req, res, next) => {
  const bearer = (req.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  const token = (bearer && bearer[1].trim()) || readCookie(req, COOKIE_NAME);

  if (!token) {
    res.status(401).json({ error: 'Sign in as a verified organisation to post.' });
    return;
  }

  // Writes are awaited before replying: on Vercel the function can be frozen
  // as soon as the response is sent, so a fire-and-forget query may never run.
  try {
    const { rows: [session] } = await db.query('SELECT * FROM sessions WHERE token_hash = ?', [sha256(token)]);

    // Same message for unknown and expired — nothing to learn from the difference.
    if (!session || new Date(session.expires_at).getTime() < Date.now()) {
      if (session) await db.query('DELETE FROM sessions WHERE id = ?', [session.id]);
      res.status(401).json({ error: 'Session expired. Sign in again.' });
      return;
    }

    // The allowlist is checked on every request, not just at login: removing
    // an org must cut off their existing sessions immediately.
    const { rows: [org] } = await db.query('SELECT * FROM allowlist WHERE email = ?', [session.email]);
    if (!org) {
      await db.query('DELETE FROM sessions WHERE id = ?', [session.id]);
      res.status(401).json({ error: 'Session expired. Sign in again.' });
      return;
    }

    req.organization = org.org_name; // always current, never client-supplied
    req.role = org.role || 'publisher'; // read per request, so a demotion is immediate
    req.sessionEmail = session.email;
    req.sessionId = session.id;

    // Best-effort audit trail; failure here shouldn't block the request.
    await db.query('UPDATE sessions SET last_used_at = utc_now_text() WHERE id = ?', [session.id]).catch(() => {});
  } catch (err) {
    res.status(500).json({ error: err.message });
    return;
  }

  next();
};

module.exports = requireOrgSession;
