/**
 * Postgres (Supabase) access, configured from DATABASE_URL.
 *
 * The schema lives in server/schema.sql and is applied with `npm run db:schema`
 * — not at boot, because on Vercel every cold start would re-run it.
 *
 * Two ways in:
 *   - query(sql, params) → Promise<pg.Result>   (rows, rowCount)
 *   - getDb().all/get/run(sql, params, cb)      the callback shape the
 *     controllers were written against with sqlite3. `run` hands the pg result
 *     to the callback as its second argument; there is no `this.lastID` or
 *     `this.changes` — use `RETURNING id` and `result.rowCount`.
 *
 * SQL keeps sqlite's `?` placeholders; they are rewritten to $1, $2, ... here.
 * That rewrite is a plain character replace, so no query may contain a literal
 * `?` (none do).
 */

require('dotenv').config();
const { Pool, types } = require('pg');

// COUNT(*) and other bigint results arrive as strings by default. SQLite gave
// numbers, and maintenance.js does arithmetic on them.
types.setTypeParser(types.builtins.INT8, (value) => parseInt(value, 10));

let pool = null;

const isLocalUrl = (url) => /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url) || !url.includes('@');

const sslFor = (url) => {
  if (isLocalUrl(url) || process.env.DATABASE_SSL === 'disable') return false;
  // Supabase serves a certificate from its own CA. With DATABASE_CA_CERT set
  // (the PEM from Project Settings → Database) the chain is verified;
  // without it the connection is still encrypted but the server isn't
  // authenticated.
  if (process.env.DATABASE_CA_CERT) {
    return { ca: process.env.DATABASE_CA_CERT.replace(/\\n/g, '\n'), rejectUnauthorized: true };
  }
  return { rejectUnauthorized: false };
};

const getPool = () => {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  pool = new Pool({
    connectionString,
    ssl: sslFor(connectionString),
    // Each serverless instance holds its own pool; keep it small so many
    // instances don't exhaust Supabase's connection limit.
    max: Number(process.env.PG_POOL_MAX) || 5,
    idleTimeoutMillis: 10000
  });
  pool.on('error', (err) => console.error('Postgres pool error:', err.message));
  return pool;
};

const toPg = (sql) => {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
};

const query = (sql, params = []) => getPool().query(toPg(sql), params);

// Callback adapter. `params` may be omitted, as sqlite3 allowed.
const call = (pick) => (sql, params, cb) => {
  if (typeof params === 'function') {
    cb = params;
    params = [];
  }
  query(sql, params || []).then(
    (result) => cb && cb(null, pick(result)),
    (err) => {
      if (cb) cb(err);
      else console.error('Query failed:', err.message);
    }
  );
};

const adapter = {
  all: call((result) => result.rows),
  get: call((result) => result.rows[0]),
  run: call((result) => result)
};

/** Run `fn(client)` inside BEGIN/COMMIT, rolling back if it throws. */
const transaction = async (fn) => {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn({ query: (sql, params = []) => client.query(toPg(sql), params) });
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

/** Opens the pool and checks the database answers. */
const init = async () => {
  await query('SELECT 1');
  console.log('Connected to Postgres');
};

const getDb = () => adapter;

const close = async () => {
  if (!pool) return;
  const closing = pool;
  pool = null;
  await closing.end();
};

/**
 * True when `value` can match an integer id column. SQLite compared
 * `id = 'abc'` as simply false; Postgres rejects the query instead, so
 * callers check first to keep returning 404 rather than 500.
 */
const isRowId = (value) => {
  const s = String(value);
  if (!/^-?\d+$/.test(s)) return false;
  const n = Number(s);
  return n >= -2147483648 && n <= 2147483647;
};

module.exports = {
  init,
  getDb,
  query,
  transaction,
  close,
  isRowId
};
