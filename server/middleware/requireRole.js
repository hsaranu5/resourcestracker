/**
 * Gate for the admin area. Runs after requireOrgSession, which has already
 * read the caller's role from the allowlist on this request.
 *
 * Roles are cumulative: an admin can do everything an editor can, and an
 * editor everything a publisher can. See the allowlist comment in schema.sql.
 */

const RANK = { publisher: 1, editor: 2, admin: 3 };

const requireRole = (minimum) => (req, res, next) => {
  if ((RANK[req.role] || 0) < RANK[minimum]) {
    res.status(403).json({ error: 'Your account does not have access to this.' });
    return;
  }
  next();
};

module.exports = requireRole;
module.exports.ROLES = Object.keys(RANK);
