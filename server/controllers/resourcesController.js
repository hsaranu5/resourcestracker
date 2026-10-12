const db = require('../database');

const getAll = (req, res) => {
  const { type, zip_code } = req.query;
  let query = 'SELECT * FROM resources WHERE 1=1';
  const params = [];

  if (type) {
    query += ' AND type = ?';
    params.push(type);
  }

  if (zip_code) {
    query += ' AND zip_code = ?';
    params.push(zip_code);
  }

  // id breaks ties the way SQLite's stable sort did (rows share created_at
  // when seeded together); Postgres leaves tie order undefined.
  query += ' ORDER BY created_at DESC, id';

  db.getDb().all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
};

const getById = (req, res) => {
  const { id } = req.params;
  if (!db.isRowId(id)) {
    res.status(404).json({ error: 'Resource not found' });
    return;
  }
  db.getDb().get('SELECT * FROM resources WHERE id = ?', [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'Resource not found' });
      return;
    }
    res.json(row);
  });
};

// --- Writes: editors and admins only (routes/index.js) ----------------------
//
// Every field is whitelisted and checked here rather than trusted from the
// form: these rows go straight onto a public map, and a bad website value is a
// link someone taps. Each write records a before/after snapshot in
// resource_changes, in the same transaction, so the history can't drift from
// the data.

const CATEGORIES = ['food', 'shelter', 'health', 'hygiene', 'crisis', 'youth', 'veterans', 'support'];

// Same box data/build_dataset.py uses: a pin outside it is almost certainly a
// bad geocode, not a real KC-metro service.
const KC_BOUNDS = { lat: [38.6, 39.5], lon: [-95.1, -94.2] };

const TEXT_LIMITS = {
  name: 200, organization: 200, description: 2000, address: 300, city: 100,
  state: 2, zip_code: 10, phone: 100, website: 500, hours: 500, source: 300,
  services: 500, eligibility: 500
};

class InputError extends Error {}

const text = (body, key, required = false) => {
  const value = body[key] == null ? '' : String(body[key]).trim();
  if (required && !value) throw new InputError(`${key.replace('_', ' ')} is required.`);
  if (value.length > TEXT_LIMITS[key]) throw new InputError(`${key.replace('_', ' ')} is too long.`);
  return value;
};

const coordinate = (value) => {
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new InputError('Coordinates must be numbers.');
  return n;
};

const readResource = (body) => {
  const row = {
    name: text(body, 'name', true),
    organization: text(body, 'organization'),
    type: String(body.type || ''),
    description: text(body, 'description'),
    address: text(body, 'address', true),
    city: text(body, 'city'),
    state: text(body, 'state').toUpperCase(),
    zip_code: text(body, 'zip_code'),
    latitude: coordinate(body.latitude),
    longitude: coordinate(body.longitude),
    phone: text(body, 'phone'),
    website: text(body, 'website'),
    hours: text(body, 'hours'),
    source: text(body, 'source'),
    services: text(body, 'services'),
    eligibility: text(body, 'eligibility'),
    verified: body.verified === true || body.verified === 1 || body.verified === '1' ? 1 : 0
  };

  if (!CATEGORIES.includes(row.type)) throw new InputError('Pick a category.');
  if ((row.latitude == null) !== (row.longitude == null)) {
    throw new InputError('Give both latitude and longitude, or neither.');
  }
  if (row.latitude != null && (
    row.latitude < KC_BOUNDS.lat[0] || row.latitude > KC_BOUNDS.lat[1] ||
    row.longitude < KC_BOUNDS.lon[0] || row.longitude > KC_BOUNDS.lon[1]
  )) {
    throw new InputError('Those coordinates are outside the Kansas City area.');
  }
  if (row.website && !/^https?:\/\/[^\s]+$/i.test(row.website)) {
    throw new InputError('Website must start with http:// or https://');
  }
  if (row.zip_code && !/^\d{5}(-\d{4})?$/.test(row.zip_code)) {
    throw new InputError('ZIP must be 5 digits.');
  }
  return row;
};

const COLUMNS = [
  'name', 'organization', 'type', 'description', 'address', 'city', 'state', 'zip_code',
  'latitude', 'longitude', 'phone', 'website', 'hours', 'source', 'services', 'eligibility', 'verified'
];

// Slugs are the key data/resources.csv and seedFromJson.js match on, so a row
// added here gets one in the same `category-name` shape and never changes it.
const slugify = (value) =>
  value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const uniqueSlug = async (tx, base) => {
  const { rows } = await tx.query('SELECT slug FROM resources WHERE slug = ? OR slug LIKE ?', [base, `${base}-%`]);
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
};

const logChange = (tx, resourceId, action, email, before, after) =>
  tx.query(
    'INSERT INTO resource_changes (resource_id, action, changed_by, before, after) VALUES (?, ?, ?, ?, ?)',
    [resourceId, action, email, before && JSON.stringify(before), after && JSON.stringify(after)]
  );

const fail = (res, err) => {
  if (err instanceof InputError) {
    res.status(400).json({ error: err.message });
    return;
  }
  console.error('Resource write failed:', err.message);
  res.status(500).json({ error: 'Could not save. Try again.' });
};

const create = async (req, res) => {
  try {
    const row = readResource(req.body);
    const saved = await db.transaction(async (tx) => {
      const slug = await uniqueSlug(tx, `${row.type}-${slugify(row.name)}`);
      const values = COLUMNS.map((c) => row[c]);
      const { rows: [created] } = await tx.query(
        `INSERT INTO resources (${COLUMNS.join(', ')}, slug)
         VALUES (${COLUMNS.map(() => '?').join(', ')}, ?) RETURNING *`,
        [...values, slug]
      );
      await logChange(tx, created.id, 'create', req.sessionEmail, null, created);
      return created;
    });
    res.status(201).json(saved);
  } catch (err) {
    fail(res, err);
  }
};

const update = async (req, res) => {
  const { id } = req.params;
  if (!db.isRowId(id)) {
    res.status(404).json({ error: 'Resource not found' });
    return;
  }
  try {
    const row = readResource(req.body);
    const saved = await db.transaction(async (tx) => {
      const { rows: [before] } = await tx.query('SELECT * FROM resources WHERE id = ? FOR UPDATE', [id]);
      if (!before) return null;
      const { rows: [after] } = await tx.query(
        `UPDATE resources SET ${COLUMNS.map((c) => `${c} = ?`).join(', ')}, updated_at = utc_now_text()
         WHERE id = ? RETURNING *`,
        [...COLUMNS.map((c) => row[c]), id]
      );
      await logChange(tx, after.id, 'update', req.sessionEmail, before, after);
      return after;
    });
    if (!saved) {
      res.status(404).json({ error: 'Resource not found' });
      return;
    }
    res.json(saved);
  } catch (err) {
    fail(res, err);
  }
};

const deleteResource = async (req, res) => {
  const { id } = req.params;
  if (!db.isRowId(id)) {
    res.status(404).json({ error: 'Resource not found' });
    return;
  }
  try {
    const removed = await db.transaction(async (tx) => {
      const { rows: [before] } = await tx.query('DELETE FROM resources WHERE id = ? RETURNING *', [id]);
      if (before) await logChange(tx, before.id, 'delete', req.sessionEmail, before, null);
      return before;
    });
    if (!removed) {
      res.status(404).json({ error: 'Resource not found' });
      return;
    }
    res.json({ message: 'Resource deleted successfully' });
  } catch (err) {
    fail(res, err);
  }
};

/** GET /api/admin/resources/:id/history — newest first. */
const history = async (req, res) => {
  const { id } = req.params;
  if (!db.isRowId(id)) {
    res.status(404).json({ error: 'Resource not found' });
    return;
  }
  try {
    const { rows } = await db.query(
      'SELECT id, action, changed_by, changed_at, before, after FROM resource_changes WHERE resource_id = ? ORDER BY id DESC LIMIT 50',
      [id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not load history.' });
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  delete: deleteResource,
  history,
  CATEGORIES,
  KC_BOUNDS
};

