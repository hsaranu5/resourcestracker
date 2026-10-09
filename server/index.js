/**
 * Local server: `npm run server` (dev) or `npm run prod`.
 *
 * In production this is not used — Vercel serves client/build as static files
 * and runs the app through api/index.js. The archive job that used to run here
 * on a setInterval is a Vercel Cron Job now (vercel.json); run it locally with
 * `node server/communityExport.js --run`.
 */

const express = require('express');
const path = require('path');

const db = require('./database');
const app = require('./app');

const PORT = process.env.PORT || 5001;

db.init().catch((err) => {
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
