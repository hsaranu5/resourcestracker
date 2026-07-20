/**
 * Loads data/events.json (from data/generate_events.py) into the events table.
 *
 *   python3 data/generate_events.py --days 21
 *   node server/seedEvents.js
 *
 * Unlike seedSampleEvents.js, these are real KC services expanded from the
 * Summer 2026 Street Sheet — attributed to the actual organisation running them.
 *
 * Idempotent: the slug is derived from organisation + title + start time, so
 * re-running replaces rather than duplicates. Regenerate and reseed as the
 * window rolls forward.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./database');

const JSON_PATH = path.join(__dirname, '../data/events.json');

const slugFor = (event) =>
  crypto
    .createHash('sha1')
    .update(`${event.organization}|${event.title}|${event.startsAt}`)
    .digest('hex')
    .slice(0, 16);

const run = async () => {
  if (!fs.existsSync(JSON_PATH)) {
    console.error('Missing data/events.json. Run: python3 data/generate_events.py');
    process.exit(1);
  }

  await db.init();
  await new Promise((resolve) => setTimeout(resolve, 400));
  const conn = db.getDb();

  const payload = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const { events } = payload;

  if (process.argv.includes('--clear')) {
    conn.run("DELETE FROM events WHERE posted_by = 'street-sheet'", function () {
      console.log(`Removed ${this.changes} Street Sheet events.`);
      db.close();
    });
    return;
  }

  // Clear only our own generated rows, leaving anything an organisation posted
  // through the API untouched.
  await new Promise((resolve) =>
    conn.run("DELETE FROM events WHERE posted_by = 'street-sheet'", resolve)
  );

  let inserted = 0;
  for (const event of events) {
    const slug = slugFor(event);
    // Unconfirmed cadences get the caveat in the description, so it surfaces in
    // the app rather than living only in the generator's source notes.
    const description = event.confirmed
      ? event.description
      : `${event.description}\n\nThis schedule could not be confirmed from the source — call before travelling.`;

    await new Promise((resolve, reject) => {
      conn.run(
        `INSERT INTO events (slug, title, description, organization, category,
           location_name, address, city, state, zip_code, latitude, longitude,
           starts_at, ends_at, status, contact_phone, posted_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          slug, event.title, description, event.organization, event.category,
          event.locationName, event.address, event.city, event.state, event.zipCode,
          event.latitude ?? null, event.longitude ?? null,
          new Date(event.startsAt).toISOString(),
          new Date(event.endsAt).toISOString(),
          'scheduled', event.contactPhone, 'street-sheet'
        ],
        (err) => {
          if (err) reject(err);
          else { inserted += 1; resolve(); }
        }
      );
    });
  }

  const unconfirmed = events.filter((e) => !e.confirmed).length;
  console.log(`\nSeeded ${inserted} events from the Street Sheet.`);
  console.log(`Window: ${payload.window.start}, ${payload.window.days} days.`);
  if (unconfirmed) {
    console.log(`${unconfirmed} carry an unconfirmed-schedule note.`);
  }
  console.log('\nNote: these have no coordinates yet, so they show without a distance.');
  console.log('The addresses all exist in resources.csv — see README for linking them.');

  db.close();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
