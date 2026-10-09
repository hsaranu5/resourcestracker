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

const create = (req, res) => {
  const {
    name,
    organization,
    type,
    description,
    address,
    city,
    state,
    zip_code,
    latitude,
    longitude,
    phone,
    website,
    hours,
    source
  } = req.body;

  const query = `
    INSERT INTO resources (
      name, organization, type, description, address, city, state,
      zip_code, latitude, longitude, phone, website, hours, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `;

  db.getDb().run(
    query,
    [name, organization, type, description, address, city, state,
     zip_code, latitude, longitude, phone, website, hours, source],
    (err, result) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.status(201).json({ id: result.rows[0].id, ...req.body });
    }
  );
};

const update = (req, res) => {
  const { id } = req.params;
  const {
    name,
    organization,
    type,
    description,
    address,
    city,
    state,
    zip_code,
    latitude,
    longitude,
    phone,
    website,
    hours
  } = req.body;

  const query = `
    UPDATE resources SET
      name = ?, organization = ?, type = ?, description = ?,
      address = ?, city = ?, state = ?, zip_code = ?,
      latitude = ?, longitude = ?, phone = ?, website = ?, hours = ?,
      updated_at = utc_now_text()
    WHERE id = ?
  `;

  if (!db.isRowId(id)) {
    res.status(404).json({ error: 'Resource not found' });
    return;
  }

  db.getDb().run(
    query,
    [name, organization, type, description, address, city, state,
     zip_code, latitude, longitude, phone, website, hours, id],
    (err, result) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Resource not found' });
        return;
      }
      res.json({ id, ...req.body });
    }
  );
};

const deleteResource = (req, res) => {
  const { id } = req.params;
  if (!db.isRowId(id)) {
    res.status(404).json({ error: 'Resource not found' });
    return;
  }
  db.getDb().run('DELETE FROM resources WHERE id = ?', [id], (err, result) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Resource not found' });
      return;
    }
    res.json({ message: 'Resource deleted successfully' });
  });
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  delete: deleteResource
};

