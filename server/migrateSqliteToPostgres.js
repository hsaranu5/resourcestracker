/**
 * One-time copy of the old SQLite database into Postgres (Supabase).
 *
 *   npm run db:schema                                   # create the tables first
 *   node server/migrateSqliteToPostgres.js [path/to/resources.db] [--archive data/archive.json] [--replace]
 *
 * Source defaults to server/resources.db and is opened read-only. Every table
 * is copied with its original ids, so session tokens, post ids and resource
 * ids the iOS app has cached keep working. Each identity sequence is then
 * moved past the highest id SQLite ever handed out (sqlite_sequence), so ids
 * of deleted rows are not reused — the AUTOINCREMENT guarantee.
 *
 * --archive  also loads the old data/archive.json into community_archive.
 * --replace  empties the target tables first. Without it the script refuses
 *            to write into tables that already hold rows.
 *
 * Everything happens in one transaction: it either all lands or none of it
 * does. Ends by comparing row counts table by table and exits non-zero on
 * any mismatch.
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const db = require('./database');

// Parents before children isn't needed (no enforced foreign keys), but keep
// a stable, readable order.
const TABLES = [
  'resources', 'organizations', 'allowlist', 'auth_codes', 'sessions',
  'community_posts', 'events', 'events_archive'
];
// events_archive has no identity column (it keeps the original event ids).
const IDENTITY_TABLES = TABLES.filter((t) => t !== 'events_archive');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const archivePath = option('--archive');
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--archive');
const sourcePath = path.resolve(positional[0] || path.join(__dirname, 'resources.db'));

const openSqlite = (file) =>
  new Promise((resolve, reject) => {
    const conn = new sqlite3.Database(file, sqlite3.OPEN_READONLY, (err) => (err ? reject(err) : resolve(conn)));
  });

const sqliteAll = (conn, sql) =>
  new Promise((resolve, reject) => conn.all(sql, [], (err, rows) => (err ? reject(err) : resolve(rows))));

const run = async () => {
  if (!fs.existsSync(sourcePath)) throw new Error(`No SQLite file at ${sourcePath}`);
  const source = await openSqlite(sourcePath);

  const present = new Set(
    (await sqliteAll(source, "SELECT name FROM sqlite_master WHERE type = 'table'")).map((r) => r.name)
  );
  const sequences = present.has('sqlite_sequence')
    ? Object.fromEntries((await sqliteAll(source, 'SELECT name, seq FROM sqlite_sequence')).map((r) => [r.name, r.seq]))
    : {};

  const { rows: targetColumns } = await db.query(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'"
  );
  const columnsOf = (table) => new Set(targetColumns.filter((c) => c.table_name === table).map((c) => c.column_name));

  const expected = {};

  await db.transaction(async (tx) => {
    const tablesToCheck = archivePath ? [...TABLES, 'community_archive'] : TABLES;
    if (flag('--replace')) {
      await tx.query(`TRUNCATE ${tablesToCheck.join(', ')}`);
    } else {
      for (const table of tablesToCheck) {
        const { rows: [{ n }] } = await tx.query(`SELECT COUNT(*) AS n FROM ${table}`);
        if (n > 0) throw new Error(`${table} already has ${n} row(s) in Postgres. Re-run with --replace to overwrite.`);
      }
    }

    for (const table of TABLES) {
      if (!present.has(table)) {
        expected[table] = 0;
        continue;
      }
      const rows = await sqliteAll(source, `SELECT * FROM ${table} ORDER BY rowid`);
      expected[table] = rows.length;
      if (!rows.length) continue;

      // Older SQLite files may predate some columns; copy what both sides have.
      const target = columnsOf(table);
      const missing = Object.keys(rows[0]).filter((c) => !target.has(c));
      if (missing.length) throw new Error(`${table}: target has no column(s) ${missing.join(', ')}`);
      const columns = Object.keys(rows[0]);
      const placeholders = columns.map(() => '?').join(', ');
      const overriding = IDENTITY_TABLES.includes(table) ? ' OVERRIDING SYSTEM VALUE' : '';
      const sql = `INSERT INTO ${table} (${columns.join(', ')})${overriding} VALUES (${placeholders})`;
      for (const row of rows) {
        await tx.query(sql, columns.map((c) => row[c]));
      }
    }

    // Next id = max(highest id SQLite ever issued, highest id present) + 1.
    for (const table of IDENTITY_TABLES) {
      const { rows: [{ max }] } = await tx.query(`SELECT COALESCE(MAX(id), 0) AS max FROM ${table}`);
      const next = Math.max(Number(max), Number(sequences[table] || 0));
      if (next > 0) {
        await tx.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), ?)`, [next]);
      }
    }

    if (archivePath) {
      const archive = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
      expected.community_archive = 0;
      for (const kind of ['events', 'posts']) {
        for (const item of archive[kind] || []) {
          await tx.query(
            'INSERT INTO community_archive (kind, item, archived_at) VALUES (?, ?, ?)',
            [kind, JSON.stringify(item), item.archivedAt || new Date().toISOString()]
          );
          expected.community_archive += 1;
        }
      }
    }
  });

  source.close();

  // Verify outside the transaction, against what actually committed.
  let mismatches = 0;
  console.log(`\nSource: ${sourcePath}\n`);
  console.log('table               sqlite  postgres');
  for (const [table, count] of Object.entries(expected)) {
    const { rows: [{ n }] } = await db.query(`SELECT COUNT(*) AS n FROM ${table}`);
    const ok = n === count;
    if (!ok) mismatches += 1;
    console.log(`${table.padEnd(18)} ${String(count).padStart(7)} ${String(n).padStart(9)}  ${ok ? 'ok' : 'MISMATCH'}`);
  }
  console.log('\nnext ids:');
  for (const table of IDENTITY_TABLES) {
    const { rows: [{ last }] } = await db.query(
      `SELECT last_value AS last FROM ${table}_id_seq`
    );
    console.log(`  ${table.padEnd(16)} sqlite_sequence=${sequences[table] ?? '-'}  postgres last_value=${last}`);
  }

  await db.close();
  if (mismatches) {
    console.error(`\n${mismatches} table(s) do not match.`);
    process.exit(1);
  }
  console.log('\nAll row counts match.');
};

run().catch(async (err) => {
  console.error(`Migration failed: ${err.message}`);
  await db.close();
  process.exit(1);
});
