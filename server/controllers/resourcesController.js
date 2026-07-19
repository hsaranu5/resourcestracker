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

  query += ' ORDER BY created_at DESC';

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
  `;

  db.getDb().run(
    query,
    [name, organization, type, description, address, city, state,
     zip_code, latitude, longitude, phone, website, hours, source],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.status(201).json({ id: this.lastID, ...req.body });
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
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  db.getDb().run(
    query,
    [name, organization, type, description, address, city, state,
     zip_code, latitude, longitude, phone, website, hours, id],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: 'Resource not found' });
        return;
      }
      res.json({ id, ...req.body });
    }
  );
};

const deleteResource = (req, res) => {
  const { id } = req.params;
  db.getDb().run('DELETE FROM resources WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
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

