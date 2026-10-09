/**
 * The Express app, without a listener. Shared by:
 *   - api/index.js     the Vercel serverless function behind /api/*
 *   - server/index.js  local development and `npm run prod`
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const routes = require('./routes');

const app = express();

// On Vercel every request arrives through Vercel's edge proxy, never from a
// loopback peer, so the old 'loopback' setting (written for Tailscale Funnel
// on the same machine) would leave req.ip as the proxy's address and lump
// every visitor into one per-IP rate-limit bucket. Vercel overwrites
// X-Forwarded-For with the real client address rather than appending to
// what the client sent, so trusting it outright is safe here.
app.set('trust proxy', true);

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
app.use('/api', routes);

module.exports = app;
