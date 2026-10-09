// Vercel serverless function for every /api/* request (see the rewrite in
// vercel.json). Express is a valid Node request handler, so the app is the
// export; its routes still match on the original /api/... path.
module.exports = require('../server/app');
