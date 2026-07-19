const db = require('../database');

const getAll = (req, res) => {
  const { resource_id } = req.query;
  let query = 'SELECT * FROM community_posts';
  const params = [];

  if (resource_id) {
    query += ' WHERE resource_id = ?';
    params.push(resource_id);
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
  db.getDb().get('SELECT * FROM community_posts WHERE id = ?', [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    res.json(row);
  });
};

const create = (req, res) => {
  const { title, content, author, resource_id } = req.body;

  const query = `
    INSERT INTO community_posts (title, content, author, resource_id)
    VALUES (?, ?, ?, ?)
  `;

  db.getDb().run(query, [title, content, author || 'Anonymous', resource_id || null], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.status(201).json({ id: this.lastID, ...req.body });
  });
};

const deletePost = (req, res) => {
  const { id } = req.params;
  db.getDb().run('DELETE FROM community_posts WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    res.json({ message: 'Post deleted successfully' });
  });
};

module.exports = {
  getAll,
  getById,
  create,
  delete: deletePost
};

