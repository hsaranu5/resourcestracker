const db = require('../database');

/**
 * Gate for anything that publishes content.
 *
 * The app is read-only for the people it serves — only verified outreach
 * organisations hold a token and can post. This is a deliberate product
 * decision, not just a security one: an open feed read by people in crisis is a
 * target for scams, and a false "free meals at 6pm" costs somebody a walk across
 * town.
 *
 * Send it as:  Authorization: Bearer <token>
 *
 * This is intentionally simple. It is NOT a full auth system: tokens are opaque
 * strings checked against a table, with no rotation, expiry or rate limiting.
 * That's adequate for a pilot with a handful of trusted partners. Before this
 * goes anywhere real, add at minimum rate limiting and token rotation, and store
 * hashes rather than raw tokens.
 */
const requireOrgToken = (req, res, next) => {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    res.status(401).json({
      error: 'Missing token. Send Authorization: Bearer <token>.'
    });
    return;
  }

  const token = match[1].trim();

  db.getDb().get(
    'SELECT * FROM org_api_tokens WHERE token = ? AND active = 1',
    [token],
    (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (!row) {
        // Same message for unknown and deactivated tokens — don't help anyone
        // work out which of the two they're holding.
        res.status(403).json({ error: 'Token is not valid.' });
        return;
      }

      req.organization = row.organization;
      req.tokenId = row.id;

      // Best-effort audit trail; failure here shouldn't block the request.
      db.getDb().run(
        'UPDATE org_api_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?',
        [row.id]
      );

      next();
    }
  );
};

module.exports = requireOrgToken;
