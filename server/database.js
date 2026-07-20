const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'resources.db');

let db = null;

const init = () => {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }
      console.log('Connected to SQLite database');
      createTables();
      resolve();
    });
  });
};

const createTables = () => {
  // Resources table
  db.run(`
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      organization TEXT,
      type TEXT NOT NULL,
      description TEXT,
      address TEXT NOT NULL,
      city TEXT,
      state TEXT,
      zip_code TEXT,
      latitude REAL,
      longitude REAL,
      phone TEXT,
      website TEXT,
      hours TEXT,
      source TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, () => migrateResources());

  // Community posts table
  db.run(`
    CREATE TABLE IF NOT EXISTS community_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author TEXT,
      resource_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (resource_id) REFERENCES resources(id)
    )
  `);

  // Events: one-off and pop-up happenings the static resource hours can't express.
  // A mobile pantry this Saturday, a clinic bus at a specific camp, a resource fair.
  //
  // Note `status`: events are cancelled, never deleted. Someone may have already
  // planned their day around one, so a cancellation has to be visible rather than
  // the event silently vanishing.
  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      organization TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'support',
      location_name TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip_code TEXT,
      latitude REAL,
      longitude REAL,
      starts_at TEXT NOT NULL,
      ends_at TEXT,
      status TEXT NOT NULL DEFAULT 'scheduled',
      cancellation_note TEXT,
      contact_phone TEXT,
      resource_slug TEXT,
      posted_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_events_starts_at ON events(starts_at)');

  // API tokens for verified organisations. Only holders of a token can publish
  // events or posts; end users of the app read only. That keeps an open feed
  // aimed at people in crisis from becoming a channel for scams.
  db.run(`
    CREATE TABLE IF NOT EXISTS org_api_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      organization TEXT NOT NULL,
      contact_email TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used_at DATETIME
    )
  `);

  // Organizations table
  db.run(`
    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      website TEXT,
      social_media TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

/**
 * Adds the columns the mobile app needs to an existing resources table.
 *
 * Runs on every boot. SQLite has no "ADD COLUMN IF NOT EXISTS", so we read the
 * current schema first and only add what's missing — that keeps this safe to
 * run against a database created before these fields existed.
 */
const migrateResources = () => {
  const columns = {
    slug: 'TEXT',            // stable string id shared with the app + CSV
    services: 'TEXT',        // semicolon-separated list
    eligibility: 'TEXT',     // who the service is for
    verified: 'INTEGER DEFAULT 0'
  };

  db.all('PRAGMA table_info(resources)', [], (err, rows) => {
    if (err) {
      console.error('Could not inspect resources table:', err.message);
      return;
    }
    const existing = new Set(rows.map((r) => r.name));

    Object.entries(columns).forEach(([column, type]) => {
      if (existing.has(column)) return;
      db.run(`ALTER TABLE resources ADD COLUMN ${column} ${type}`, (alterErr) => {
        if (alterErr) {
          console.error(`Failed adding column ${column}:`, alterErr.message);
        } else {
          console.log(`Added resources.${column}`);
        }
      });
    });

    // Unique slug lets the seeder upsert instead of duplicating on every run.
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_slug ON resources(slug)');
  });

  migrateCommunityPosts();
};

/**
 * Brings the pre-existing community_posts table up to what the mobile app needs:
 * an owning organisation (posts are org-authored, not anonymous), a category,
 * and a pinned flag for things like cold-weather alerts.
 */
const migrateCommunityPosts = () => {
  const columns = {
    organization: 'TEXT',
    category: "TEXT DEFAULT 'update'",
    pinned: 'INTEGER DEFAULT 0',
    expires_at: 'TEXT'
  };

  db.all('PRAGMA table_info(community_posts)', [], (err, rows) => {
    if (err) return;
    const existing = new Set(rows.map((r) => r.name));
    Object.entries(columns).forEach(([column, type]) => {
      if (existing.has(column)) return;
      db.run(`ALTER TABLE community_posts ADD COLUMN ${column} ${type}`, (e) => {
        if (!e) console.log(`Added community_posts.${column}`);
      });
    });
  });
};

const getDb = () => {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
};

const close = () => {
  if (db) {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('Database connection closed');
      }
    });
  }
};

module.exports = {
  init,
  getDb,
  close
};

