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
  `;

  db.getDb().run(query, [name, website, social_media, description], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint')) {
        res.status(409).json({ error: 'Organization already exists' });
        return;
      }
      res.status(500).json({ error: err.message });
      return;
    }
    res.status(201).json({ id: this.lastID, ...req.body });
  });
};

module.exports = {
  getAll,
  create
};

