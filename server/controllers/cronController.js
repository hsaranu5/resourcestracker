/**
 * Entry points for Vercel Cron Jobs (schedules in vercel.json).
 *
 * Vercel calls each path with GET and, when the project has a CRON_SECRET
 * environment variable, sends `Authorization: Bearer <CRON_SECRET>`. Without
 * the variable every call is refused, so the jobs can't be triggered by
 * anyone who finds the URL.
 */

const crypto = require('crypto');
const { archiveExpired } = require('../communityExport');
const { maintain, pruneRateLimits } = require('../maintenance');

const requireCronSecret = (req, res, next) => {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(req.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
};

/** Daily: what server/index.js used to run at boot and every 6 hours. */
const archive = async (req, res) => {
  try {
    const archived = await archiveExpired();
    const rateLimitHits = await pruneRateLimits();
    res.json({ ok: true, archived, rateLimitHits });
  } catch (err) {
    console.error('[cron] archive failed:', err.message);
    res.status(500).json({ error: err.message });
  }
};

/** Weekly: server/maintenance.js, which the OS timer used to run. */
const maintenance = async (req, res) => {
  try {
    res.json({ ok: true, ...(await maintain()) });
  } catch (err) {
    console.error('[cron] maintenance failed:', err.message);
    res.status(500).json({ error: err.message });
  }
};

module.exports = { requireCronSecret, archive, maintenance };
