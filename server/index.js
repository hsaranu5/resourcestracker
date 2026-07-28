const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const db = require('./database');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 5001;

// Behind Tailscale Funnel (or any local reverse proxy), the raw socket peer is
// always localhost. Trust loopback so req.ip reads X-Forwarded-For and the
// per-IP rate limits apply to real visitors instead of lumping everyone
// together as 127.0.0.1.
app.set('trust proxy', 'loopback');

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
app.use('/api', routes);

// Initialize database
db.init()
  .then(() => {
    // Housekeeping: archive events >1 week past and expired posts to
    // data/archive.json, at boot and every 6 hours thereafter.
    const { archiveExpired } = require('./communityExport');
    setTimeout(archiveExpired, 1500); // let table creation settle
    setInterval(archiveExpired, 6 * 60 * 60 * 1000);
  })
  .catch(err => {
    console.error('Database initialization error:', err);
  });

// Serve static files from React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

