/**
 * Weekly maintenance: prune transient rows and archive past events.
 *
 *   node server/maintenance.js          (by hand, against DATABASE_URL)
 *   GET /api/cron/maintenance           (Vercel Cron, weekly — see vercel.json)
 *
 * This is the part a process restart CANNOT do. Expired sessions, used login
 * codes, and stale posts live in the database and survive any restart.
 *
 * There is no VACUUM step any more. It existed to shrink the SQLite file;
 * Postgres reclaims dead rows itself with autovacuum.
 *
 * What it PRESERVES ("lifetime" data — never touched here):
 *   - allowlist   (org accounts)
 *   - resources   (the directory itself)
 *   - events       are archived, not deleted
 *   - posts/sessions that are still live
 *
 * What it CLEARS (transient only, and only once expired):
 *   - sessions past their expiry
 *   - auth_codes past their expiry
 *   - community_posts past their expiry
 *   - events that ended more than ARCHIVE_AFTER_DAYS ago -> moved to events_archive
 *   - login rate-limit counters older than an hour (the old in-memory limiter
 *     dropped them on the same horizon)
 *
 * Idempotent and safe to run anytime; nothing here depends on it being midnight.
 */

const db = require('./database');

const ARCHIVE_AFTER_DAYS = 7;

const run = async (sql, params = []) => (await db.query(sql, params)).rowCount;

const get = async (sql, params = []) => (await db.query(sql, params)).rows[0];

const pruneRateLimits = () => run("DELETE FROM rate_limit_hits WHERE hit_at < now() - interval '1 hour'");

async function maintain() {
  const now = new Date().toISOString();
  const archiveCutoff = new Date(Date.now() - ARCHIVE_AFTER_DAYS * 86400000).toISOString();
  const summary = {};

  // 1. Expired login sessions. Signed-out-by-time-passing; nothing references them.
  summary.sessions = await run('DELETE FROM sessions WHERE expires_at < ?', [now]);

  // 2. Expired one-time login codes. (Verified codes are deleted at use; this
  //    catches codes that were requested and never entered.)
  summary.authCodes = await run('DELETE FROM auth_codes WHERE expires_at < ?', [now]);

  // 3. Expired community posts. The API already hides these; this deletes them.
  summary.posts = await run('DELETE FROM community_posts WHERE expires_at IS NOT NULL AND expires_at < ?', [now]);

  // 4. Archive events that finished more than a week ago. Moved, not dropped,
  //    so the history survives (a coordinator may want to see what ran).
  //    events_archive is created by server/schema.sql. Copy and delete share
  //    one transaction so a failure can't leave an event in both places.
  const pastClause = 'COALESCE(ends_at, starts_at) < ?';
  const toArchive = await get(`SELECT COUNT(*) AS n FROM events WHERE ${pastClause}`, [archiveCutoff]);
  summary.eventsArchived = toArchive ? toArchive.n : 0;

  if (summary.eventsArchived > 0) {
    await db.transaction(async (tx) => {
      await tx.query(`
        INSERT INTO events_archive (
          id, slug, title, description, organization, category, location_name,
          address, city, state, zip_code, latitude, longitude, starts_at, ends_at,
          status, cancellation_note, contact_phone, resource_slug, posted_by,
          created_at, updated_at
        )
        SELECT id, slug, title, description, organization, category, location_name,
          address, city, state, zip_code, latitude, longitude, starts_at, ends_at,
          status, cancellation_note, contact_phone, resource_slug, posted_by,
          created_at, updated_at
        FROM events WHERE ${pastClause}
      `, [archiveCutoff]);
      await tx.query(`DELETE FROM events WHERE ${pastClause}`, [archiveCutoff]);
    });
  }

  // 5. Rate-limit counters nobody has touched in an hour.
  summary.rateLimitHits = await pruneRateLimits();

  console.log(`[maintenance] ${new Date().toISOString()}`);
  console.log(`  sessions pruned:   ${summary.sessions}`);
  console.log(`  auth codes pruned: ${summary.authCodes}`);
  console.log(`  posts pruned:      ${summary.posts}`);
  console.log(`  events archived:   ${summary.eventsArchived}`);
  console.log(`  rate-limit hits pruned: ${summary.rateLimitHits}`);

  return summary;
}

module.exports = { maintain, pruneRateLimits };

if (require.main === module) {
  maintain()
    .then(() => db.close())
    .catch(async (err) => {
      console.error('[maintenance] failed:', err.message);
      await db.close();
      process.exit(1);
    });
}
