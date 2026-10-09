/**
 * Creates or updates the Postgres schema from server/schema.sql.
 *
 *   npm run db:schema
 *
 * Safe to re-run: every statement in the file is idempotent.
 */

const fs = require('fs');
const path = require('path');
const db = require('./database');

const run = async () => {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.query(sql);
  console.log('Schema applied.');
  await db.close();
};

run().catch(async (err) => {
  console.error('Schema failed:', err.message);
  await db.close();
  process.exit(1);
});
