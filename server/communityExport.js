/**
 * Keeps the community tables tidy and, on a local machine, mirrors them to
 * /data:
 *
 *  - exportCommunity(): dumps current events and posts to data/events.json and
 *    data/posts.json. Called after every verified-org publish, so the /data
 *    folder (which feeds the iOS build pipeline) always reflects what's live.
 *    Skipped on Vercel, whose filesystem is read-only; run
 *    `node server/communityExport.js --export` locally against the same
 *    DATABASE_URL to refresh /data.
 *
 *  - archiveExpired(): events more than 7 days past their end (and posts past
 *    their expiry) are copied to the community_archive table and removed from
 *    the live tables. Run daily by Vercel Cron (GET /api/cron/archive).
 *    Nothing is ever silently lost — the archive keeps the full record.
 *
 *  - readArchive(): the archive in the shape data/archive.json used to have,
 *    `{ events: [...], posts: [...] }`. `node server/communityExport.js
 *    --archive` prints it.
 */

const fs = require('fs');
const path = require('path');
const db = require('./database');
const { toEvent, toPost } = require('./controllers/communityController');

const DATA_DIR = path.join(__dirname, '../data');
const EVENTS_PATH = path.join(DATA_DIR, 'events.json');
const POSTS_PATH = path.join(DATA_DIR, 'posts.json');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const writeJson = (file, payload) => {
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
};

const exportCommunity = async ({ force = false } = {}) => {
  if (process.env.VERCEL && !force) return;
  try {
    const { rows: eventRows } = await db.query('SELECT * FROM events ORDER BY starts_at ASC, id');
    const { rows: postRows } = await db.query('SELECT * FROM community_posts ORDER BY pinned DESC, created_at DESC, id');
    const generated = new Date().toISOString();
    writeJson(EVENTS_PATH, { generated, count: eventRows.length, events: eventRows.map(toEvent) });
    writeJson(POSTS_PATH, { generated, count: postRows.length, posts: postRows.map(toPost) });
  } catch (err) {
    console.error('Export failed:', err.message);
  }
};

/**
 * Deletes the rows matching `where` and archives them as `kind`, in one
 * transaction, so a row is either still live or in the archive — never
 * neither, never both. Returns how many were archived.
 */
const archiveRows = async (table, where, params, kind, toItem) => {
  return db.transaction(async (tx) => {
    const { rows } = await tx.query(`DELETE FROM ${table} WHERE ${where} RETURNING *`, params);
    rows.sort((a, b) => a.id - b.id); // SQLite scanned in rowid order
    const archivedAt = new Date().toISOString();
    for (const row of rows) {
      await tx.query(
        'INSERT INTO community_archive (kind, item, archived_at) VALUES (?, ?, ?)',
        [kind, JSON.stringify({ ...toItem(row), archivedAt }), archivedAt]
      );
    }
    return rows.length;
  });
};

const archiveExpired = async () => {
  const now = Date.now();
  const eventCutoff = new Date(now - WEEK_MS).toISOString();
  const nowIso = new Date(now).toISOString();
  const summary = { events: 0, posts: 0 };

  // Events: gone a week after they finished (falls back to start time for
  // events with no end). Cancelled events age out on the same clock — the
  // cancellation stays visible for the week people might still show up.
  try {
    summary.events = await archiveRows('events', 'COALESCE(ends_at, starts_at) < ?', [eventCutoff], 'events', toEvent);
    if (summary.events) console.log(`Archived ${summary.events} past event(s).`);
  } catch (err) {
    console.error('Archive failed (events):', err.message);
  }

  // Posts: honoured at their expiry date (createPost defaults this to 7 days).
  try {
    summary.posts = await archiveRows(
      'community_posts', 'expires_at IS NOT NULL AND expires_at < ?', [nowIso], 'posts', toPost
    );
    if (summary.posts) console.log(`Archived ${summary.posts} expired post(s).`);
  } catch (err) {
    console.error('Archive failed (posts):', err.message);
  }

  if (summary.events || summary.posts) await exportCommunity();
  return summary;
};

const readArchive = async () => {
  const { rows } = await db.query('SELECT kind, item FROM community_archive ORDER BY id');
  const archive = { events: [], posts: [] };
  rows.forEach((row) => archive[row.kind].push(row.item));
  return archive;
};

module.exports = { exportCommunity, archiveExpired, readArchive };

if (require.main === module) {
  const flag = process.argv[2];
  const job = flag === '--archive'
    ? readArchive().then((archive) => process.stdout.write(JSON.stringify(archive, null, 2) + '\n'))
    : flag === '--export'
      ? exportCommunity({ force: true }).then(() => console.log('Wrote data/events.json and data/posts.json.'))
      : flag === '--run'
        ? archiveExpired().then((summary) => console.log(JSON.stringify(summary)))
        : Promise.resolve(console.log('Usage: node server/communityExport.js --run | --archive | --export'));
  job
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}
