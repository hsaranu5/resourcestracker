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
 * Sets req.organization, req.sessionEmail, req.sessionId.
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

const requireOrgSession = (req, res, next) => {
  const bearer = (req.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  const token = (bearer && bearer[1].trim()) || readCookie(req, COOKIE_NAME);

  if (!token) {
    res.status(401).json({ error: 'Sign in as a verified organisation to post.' });
    return;
  }

  db.getDb().get(
    'SELECT * FROM sessions WHERE token_hash = ?',
    [sha256(token)],
    (err, session) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      // Same message for unknown and expired — nothing to learn from the difference.
      if (!session || new Date(session.expires_at).getTime() < Date.now()) {
        if (session) db.getDb().run('DELETE FROM sessions WHERE id = ?', [session.id]);
        res.status(401).json({ error: 'Session expired. Sign in again.' });
        return;
      }

      // The allowlist is checked on every request, not just at login: removing
      // an org must cut off their existing sessions immediately.
      db.getDb().get('SELECT * FROM allowlist WHERE email = ?', [session.email], (allowErr, org) => {
        if (allowErr) {
          res.status(500).json({ error: allowErr.message });
          return;
        }
        if (!org) {
          db.getDb().run('DELETE FROM sessions WHERE id = ?', [session.id]);
          res.status(401).json({ error: 'Session expired. Sign in again.' });
          return;
        }

        req.organization = org.org_name; // always current, never client-supplied
        req.sessionEmail = session.email;
        req.sessionId = session.id;

        // Best-effort audit trail; failure here shouldn't block the request.
        db.getDb().run('UPDATE sessions SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', [session.id]);

        next();
      });
    }
  );
};

module.exports = requireOrgSession;
