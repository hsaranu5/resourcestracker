/**
 * Weekly maintenance: prune transient rows, archive past events, compact the DB.
 *
 *   node server/maintenance.js
 *
 * This is the part a process restart CANNOT do. Expired sessions, used login
 * codes, and stale posts live in the SQLite file and survive a reboot — a fresh
 * process just re-opens the same file. And SQLite never shrinks its file on
 * DELETE on its own; VACUUM is what actually reclaims the space.
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
 *
 * Idempotent and safe to run anytime; nothing here depends on it being midnight.
 */

const db = require('./database');

const ARCHIVE_AFTER_DAYS = 7;

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.getDb().run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this ? this.changes : 0);
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.getDb().get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

async function maintain() {
  await db.init();
  // Let the schema/migrations settle before we touch the tables.
  await new Promise((r) => setTimeout(r, 300));

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
  await run(`
    CREATE TABLE IF NOT EXISTS events_archive (
      id INTEGER, slug TEXT, title TEXT, description TEXT, organization TEXT,
      category TEXT, location_name TEXT, address TEXT, city TEXT, state TEXT,
      zip_code TEXT, latitude REAL, longitude REAL, starts_at TEXT, ends_at TEXT,
      status TEXT, cancellation_note TEXT, contact_phone TEXT, resource_slug TEXT,
      posted_by TEXT, created_at DATETIME, updated_at DATETIME,
      archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const pastClause = 'COALESCE(ends_at, starts_at) < ?';
  const toArchive = await get(`SELECT COUNT(*) AS n FROM events WHERE ${pastClause}`, [archiveCutoff]);
  summary.eventsArchived = toArchive ? toArchive.n : 0;

  if (summary.eventsArchived > 0) {
    await run(`
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
    await run(`DELETE FROM events WHERE ${pastClause}`, [archiveCutoff]);
  }

  // 5. Compact the file. This is the actual disk reclaim — without it the file
  //    stays as large as its historical high-water mark. VACUUM can't run inside
  //    a transaction, so it goes last and alone.
  await run('VACUUM');

  console.log(`[maintenance] ${new Date().toISOString()}`);
  console.log(`  sessions pruned:   ${summary.sessions}`);
  console.log(`  auth codes pruned: ${summary.authCodes}`);
  console.log(`  posts pruned:      ${summary.posts}`);
  console.log(`  events archived:   ${summary.eventsArchived}`);
  console.log('  database compacted (VACUUM)');

  db.close();
}

maintain().catch((err) => {
  console.error('[maintenance] failed:', err.message);
  process.exit(1);
});
