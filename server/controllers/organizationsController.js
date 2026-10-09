const db = require('../database');

const getAll = (req, res) => {
  db.getDb().all('SELECT * FROM organizations ORDER BY name', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
};

const create = (req, res) => {
  const { name, website, social_media, description } = req.body;

  const query = `
    INSERT INTO organizations (name, website, social_media, description)
    VALUES (?, ?, ?, ?)
    RETURNING id
  `;

  db.getDb().run(query, [name, website, social_media, description], (err, result) => {
    if (err) {
      if (err.code === '23505') { // unique_violation
        res.status(409).json({ error: 'Organization already exists' });
        return;
      }
      res.status(500).json({ error: err.message });
      return;
    }
    res.status(201).json({ id: result.rows[0].id, ...req.body });
  });
};

module.exports = {
  getAll,
  create
};

