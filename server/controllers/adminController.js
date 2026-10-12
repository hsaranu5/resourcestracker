/**
 * The admin area's own endpoints: the team (allowlist) and address lookup.
 * Resource writes live in resourcesController; both sit behind
 * requireOrgSession + requireRole in routes/index.js.
 *
 * The allowlist is the whole account system (see authController), so managing
 * it here is managing who can sign in at all. Removing a row also deletes that
 * address's sessions: requireOrgSession would refuse them on the next request
 * anyway, but there is no reason to leave the tokens lying around.
 */

const db = require('../database');
const { ROLES } = require('../middleware/requireRole');
const { KC_BOUNDS } = require('./resourcesController');

const cleanEmail = (value) => String(value || '').trim().toLowerCase();
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;

/** GET /api/admin/team */
const listTeam = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT a.id, a.email, a.org_name, a.role, a.added_by, a.added_at,
             (SELECT max(coalesce(s.last_used_at, s.created_at)) FROM sessions s WHERE s.email = a.email) AS last_seen
      FROM allowlist a
      ORDER BY a.org_name, a.email
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not load the team.' });
  }
};

/** POST /api/admin/team   body: { email, org_name, role } */
const addMember = async (req, res) => {
  const email = cleanEmail(req.body.email);
  const orgName = String(req.body.org_name || '').trim();
  const role = req.body.role || 'publisher';

  if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!orgName || orgName.length > 200) return res.status(400).json({ error: 'Enter the organization name.' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Pick a role.' });

  try {
    const { rows: [row] } = await db.query(
      'INSERT INTO allowlist (email, org_name, role, added_by) VALUES (?, ?, ?, ?) RETURNING *',
      [email, orgName, role, req.sessionEmail]
    );
    res.status(201).json(row);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That email is already on the list.' });
    res.status(500).json({ error: 'Could not add them. Try again.' });
  }
};

// An admin can't lock themselves out, and the last admin can't be demoted or
// removed by anyone: there would be no one left to add people back.
const guardAdmins = async (target, nextRole) => {
  if (target.role !== 'admin' || nextRole === 'admin') return null;
  const { rows: [{ n }] } = await db.query("SELECT count(*) AS n FROM allowlist WHERE role = 'admin'");
  if (n <= 1) return 'There must be at least one admin.';
  return null;
};

const findMember = async (id) => {
  if (!db.isRowId(id)) return null;
  const { rows: [row] } = await db.query('SELECT * FROM allowlist WHERE id = ?', [id]);
  return row || null;
};

/** PATCH /api/admin/team/:id   body: { role?, org_name? } */
const updateMember = async (req, res) => {
  try {
    const target = await findMember(req.params.id);
    if (!target) return res.status(404).json({ error: 'Not found.' });

    const role = req.body.role === undefined ? target.role : req.body.role;
    const orgName = req.body.org_name === undefined ? target.org_name : String(req.body.org_name).trim();
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Pick a role.' });
    if (!orgName || orgName.length > 200) return res.status(400).json({ error: 'Enter the organization name.' });
    if (target.email === req.sessionEmail && role !== target.role) {
      return res.status(400).json({ error: "You can't change your own role. Ask another admin." });
    }
    const blocked = await guardAdmins(target, role);
    if (blocked) return res.status(400).json({ error: blocked });

    const { rows: [row] } = await db.query(
      'UPDATE allowlist SET role = ?, org_name = ? WHERE id = ? RETURNING *',
      [role, orgName, target.id]
    );
    // Sessions carry the org name for attribution; keep them in step.
    await db.query('UPDATE sessions SET org_name = ? WHERE email = ?', [orgName, target.email]);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Could not save. Try again.' });
  }
};

/** DELETE /api/admin/team/:id */
const removeMember = async (req, res) => {
  try {
    const target = await findMember(req.params.id);
    if (!target) return res.status(404).json({ error: 'Not found.' });
    if (target.email === req.sessionEmail) {
      return res.status(400).json({ error: "You can't remove yourself. Ask another admin." });
    }
    const blocked = await guardAdmins(target, null);
    if (blocked) return res.status(400).json({ error: blocked });

    await db.transaction(async (tx) => {
      await tx.query('DELETE FROM allowlist WHERE id = ?', [target.id]);
      await tx.query('DELETE FROM sessions WHERE email = ?', [target.email]);
      await tx.query('DELETE FROM auth_codes WHERE email = ?', [target.email]);
    });
    res.json({ message: 'Removed.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not remove them. Try again.' });
  }
};

// Mirrors geocodable() in data/build_dataset.py, plus the one shape that broke
// it here: "Dr. Martin Luther King, Jr. Blvd" resolves only once the honorific
// and the comma before "Jr" are gone. Building-level accuracy is all we need.
const UNIT_SUFFIX = /,?\s*(?:#\s*\S+|\b(?:suite|ste\.?|apt\.?|apartment|unit|floor|fl\.?|(?:first|second|third|fourth|fifth|ground)\s+floor)\b.*)$/i;

const geocodable = (address) =>
  address.trim()
    .replace(UNIT_SUFFIX, '')
    .replace(/\bDr\.?\s+(?=Martin Luther King)/i, '')
    .replace(/,\s*Jr\.?/i, ' Jr')
    .replace(/&/g, 'and')
    .replace(/[\s,]+$/, '');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const inKc = (lat, lon) =>
  lat >= KC_BOUNDS.lat[0] && lat <= KC_BOUNDS.lat[1] && lon >= KC_BOUNDS.lon[0] && lon <= KC_BOUNDS.lon[1];

const nominatim = async (q) => {
  const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
    q, format: 'json', limit: '1', countrycodes: 'us'
  });
  const response = await fetch(url, {
    headers: { 'User-Agent': 'CheckpointKC/1.0 (https://checkpointkc.com)' },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`Nominatim ${response.status}`);
  const [hit] = await response.json();
  if (!hit) return null;
  const lat = Number(hit.lat);
  const lon = Number(hit.lon);
  return inKc(lat, lon) ? { latitude: Number(lat.toFixed(6)), longitude: Number(lon.toFixed(6)), label: hit.display_name } : null;
};

/**
 * GET /api/admin/geocode?address=&city=&state=&zip=
 *
 * OpenStreetMap's Nominatim, the same service data/build_dataset.py uses. Its
 * policy is at most one request a second with an identifying User-Agent; the
 * limiter is shared across serverless instances through Postgres, so the
 * whole team together stays under it. A ZIP that OSM files differently can
 * sink an otherwise good match, so a miss is retried once without it.
 */
const geocode = async (req, res) => {
  const [address, city, state, zip] = ['address', 'city', 'state', 'zip'].map((k) => String(req.query[k] || '').trim());
  const street = address && geocodable(address);
  if (!street || !(city || zip)) return res.status(400).json({ error: 'Enter the street address and city or ZIP first.' });

  const attempts = [[street, city, state, zip], [street, city, state]]
    .map((parts) => parts.filter(Boolean).join(', '))
    .filter((q, i, all) => all.indexOf(q) === i);

  try {
    const { rows: [{ limited }] } = await db.query('SELECT rate_limit_hit(?, ?, ?) AS limited', ['geocode', 1, 1100]);
    if (limited) return res.status(429).json({ error: 'Busy. Try again in a second.' });

    for (let i = 0; i < attempts.length; i += 1) {
      if (i > 0) await sleep(1100);
      const hit = await nominatim(attempts[i]);
      if (hit) return res.json(hit);
    }
    res.status(404).json({ error: "Couldn't find that address in the Kansas City area. Check it, or set the pin manually." });
  } catch (err) {
    console.error('Geocode failed:', err.message);
    res.status(502).json({ error: 'The address lookup is not responding. Try again, or set the pin manually.' });
  }
};

module.exports = { listTeam, addMember, updateMember, removeMember, geocode };
