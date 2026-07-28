/**
 * Keeps /data in sync with the community tables, both directions of the
 * app's life cycle:
 *
 *  - exportCommunity(): dumps current events and posts to data/events.json and
 *    data/posts.json. Called after every verified-org publish, so the /data
 *    folder (which feeds the iOS build pipeline) always reflects what's live.
 *
 *  - archiveExpired(): events more than 7 days past their end (and posts past
 *    their expiry) are appended to data/archive.json and removed from the
 *    database. Run at boot and on an interval from server/index.js. Nothing is
 *    ever silently lost — the archive keeps the full record.
 */

const fs = require('fs');
const path = require('path');
const db = require('./database');
const { toEvent, toPost } = require('./controllers/communityController');

const DATA_DIR = path.join(__dirname, '../data');
const EVENTS_PATH = path.join(DATA_DIR, 'events.json');
const POSTS_PATH = path.join(DATA_DIR, 'posts.json');
const ARCHIVE_PATH = path.join(DATA_DIR, 'archive.json');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const writeJson = (file, payload) => {
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
};

const exportCommunity = () => {
  const conn = db.getDb();

  conn.all('SELECT * FROM events ORDER BY starts_at ASC', [], (err, eventRows) => {
    if (err) {
      console.error('Export failed (events):', err.message);
      return;
    }
    conn.all('SELECT * FROM community_posts ORDER BY pinned DESC, created_at DESC', [], (postErr, postRows) => {
      if (postErr) {
        console.error('Export failed (posts):', postErr.message);
        return;
      }
      try {
        const generated = new Date().toISOString();
        writeJson(EVENTS_PATH, { generated, count: eventRows.length, events: eventRows.map(toEvent) });
        writeJson(POSTS_PATH, { generated, count: postRows.length, posts: postRows.map(toPost) });
      } catch (writeErr) {
        console.error('Export failed (write):', writeErr.message);
      }
    });
  });
};

const appendToArchive = (kind, items) => {
  if (!items.length) return;
  let archive = { events: [], posts: [] };
  try {
    if (fs.existsSync(ARCHIVE_PATH)) archive = JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8'));
  } catch (e) {
    console.error('Could not read archive, starting fresh:', e.message);
  }
  archive[kind] = (archive[kind] || []).concat(
    items.map((item) => ({ ...item, archivedAt: new Date().toISOString() }))
  );
  writeJson(ARCHIVE_PATH, archive);
};

const archiveExpired = () => {
  const conn = db.getDb();
  const now = Date.now();
  const eventCutoff = new Date(now - WEEK_MS).toISOString();
  const nowIso = new Date(now).toISOString();

  // Events: gone a week after they finished (falls back to start time for
  // events with no end). Cancelled events age out on the same clock — the
  // cancellation stays visible for the week people might still show up.
  conn.all(
    'SELECT * FROM events WHERE COALESCE(ends_at, starts_at) < ?',
    [eventCutoff],
    (err, rows) => {
      if (err) return console.error('Archive scan failed (events):', err.message);
      if (rows.length) {
        appendToArchive('events', rows.map(toEvent));
        conn.run('DELETE FROM events WHERE COALESCE(ends_at, starts_at) < ?', [eventCutoff], (delErr) => {
          if (delErr) return console.error('Archive delete failed (events):', delErr.message);
          console.log(`Archived ${rows.length} past event(s).`);
          exportCommunity();
        });
      }
    }
  );

  // Posts: honoured at their expiry date (createPost defaults this to 7 days).
  conn.all(
    'SELECT * FROM community_posts WHERE expires_at IS NOT NULL AND expires_at < ?',
    [nowIso],
    (err, rows) => {
      if (err) return console.error('Archive scan failed (posts):', err.message);
      if (rows.length) {
        appendToArchive('posts', rows.map(toPost));
        conn.run('DELETE FROM community_posts WHERE expires_at IS NOT NULL AND expires_at < ?', [nowIso], (delErr) => {
          if (delErr) return console.error('Archive delete failed (posts):', delErr.message);
          console.log(`Archived ${rows.length} expired post(s).`);
          exportCommunity();
        });
      }
    }
  );
};

module.exports = { exportCommunity, archiveExpired };
