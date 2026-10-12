/**
 * Loads data/resources.json into Postgres (DATABASE_URL).
 *
 * Idempotent: rows are matched on `slug`, so running this repeatedly updates
 * existing rows rather than duplicating them. That makes it safe to re-run
 * every time the Street Sheet is refreshed and build_dataset.py regenerates
 * the JSON.
 *
 *   node server/seedFromJson.js [--force]
 *
 * Once anyone has edited resources in the admin (/admin), the database is the
 * catalogue of record and this file is a snapshot that may be behind it:
 * seeding would put the old hours and phone numbers back. So the script
 * refuses when resource_changes holds admin edits, unless --force is given.
 */

const fs = require('fs');
const path = require('path');
const db = require('./database');

const JSON_PATH = path.join(__dirname, '../data/resources.json');

const upsert = (resource) =>
  new Promise((resolve, reject) => {
    const row = {
      slug: resource.id,
      name: resource.name,
      organization: resource.organization || '',
      type: resource.category,
      description: resource.description || '',
      address: resource.address || '',
      city: resource.city || '',
      state: resource.state || '',
      zip_code: resource.zipCode || '',
      latitude: resource.latitude ?? null,
      longitude: resource.longitude ?? null,
      phone: resource.phone || '',
      website: resource.website || '',
      hours: resource.hours || '',
      services: (resource.services || []).join(';'),
      eligibility: resource.eligibility || '',
      verified: resource.verified ? 1 : 0,
      source: resource.source || ''
    };

    const columns = Object.keys(row);
    const placeholders = columns.map(() => '?').join(', ');
    // Everything except the slug gets overwritten on conflict.
    const updates = columns
      .filter((c) => c !== 'slug')
      .map((c) => `${c} = excluded.${c}`)
      .join(', ');

    const sql = `
      INSERT INTO resources (${columns.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT(slug) DO UPDATE SET ${updates}, updated_at = utc_now_text()
    `;

    db.getDb().run(sql, Object.values(row), (err, result) => {
      if (err) reject(err);
      else resolve(result.rowCount);
    });
  });

const run = async () => {
  if (!fs.existsSync(JSON_PATH)) {
    console.error(`Missing ${JSON_PATH}. Run: python3 data/build_dataset.py`);
    process.exit(1);
  }

  const { rows: [{ edits }] } = await db.query('SELECT count(*) AS edits FROM resource_changes');
  if (edits > 0 && !process.argv.includes('--force')) {
    console.error(
      `Refusing to seed: ${edits} change(s) have been made in the admin since the last import, and ` +
      'seeding would overwrite them with data/resources.json. Edit resources at /admin instead, or ' +
      're-run with --force if you really mean to replace them.'
    );
    await db.close();
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  console.log(`Seeding ${payload.resources.length} resources from ${payload.generated}...`);

  let ok = 0;
  let failed = 0;
  for (const resource of payload.resources) {
    try {
      await upsert(resource);
      ok += 1;
    } catch (err) {
      console.error(`  ! ${resource.name}: ${err.message}`);
      failed += 1;
    }
  }

  const withCoords = payload.resources.filter((r) => r.latitude != null).length;
  console.log(`\nSeeded ${ok} resources (${failed} failed).`);
  console.log(`${withCoords} have coordinates; the app geocodes the rest on first launch.`);

  await db.close();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
