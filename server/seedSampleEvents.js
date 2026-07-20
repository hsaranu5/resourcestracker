/**
 * Seeds a handful of realistic sample events and posts so the Community tab has
 * something to show while you're building.
 *
 *   node server/seedSampleEvents.js
 *
 * These are illustrative, not real listings — every one is attributed to
 * "Sample Data" so it can't be mistaken for a verified service. Clear them with:
 *   node server/seedSampleEvents.js --clear
 */

const crypto = require('crypto');
const db = require('./database');

const hoursFromNow = (h) => new Date(Date.now() + h * 3600 * 1000).toISOString();
const daysFromNow = (d, hour = 9) => {
  const date = new Date();
  date.setDate(date.getDate() + d);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

const events = [
  {
    title: 'Mobile Food Pantry',
    description: 'Fresh produce, shelf-stable groceries and hygiene kits. No ID or paperwork needed.',
    organization: 'Sample Data',
    category: 'food',
    location_name: 'Cherith Brook Catholic Worker',
    address: '3226 E 12th Street', city: 'Kansas City', state: 'MO', zip_code: '64127',
    latitude: 39.0925, longitude: -94.5449,
    starts_at: hoursFromNow(3), ends_at: hoursFromNow(6),
    contact_phone: '(816) 241-8047'
  },
  {
    title: 'Clinic Bus — Camp Outreach',
    description: 'Wound care, blood pressure checks and prescription refills. Walk-up, no appointment.',
    organization: 'Sample Data',
    category: 'health',
    location_name: 'Near 12th & Prospect',
    address: '', city: 'Kansas City', state: 'MO', zip_code: '',
    latitude: null, longitude: null,
    starts_at: daysFromNow(1, 10), ends_at: daysFromNow(1, 14),
    contact_phone: '(913) 291-2273'
  },
  {
    title: 'Winter Coat & Blanket Giveaway',
    description: 'Coats, blankets, gloves and socks while supplies last. Arrive early.',
    organization: 'Sample Data',
    category: 'support',
    location_name: 'Westport Presbyterian Church',
    address: '201 Westport Road', city: 'Kansas City', state: 'MO', zip_code: '64111',
    latitude: 39.0524, longitude: -94.5921,
    starts_at: daysFromNow(2, 9), ends_at: daysFromNow(2, 12),
    contact_phone: ''
  },
  {
    title: 'Saturday Community Breakfast',
    description: 'Hot breakfast open to everyone, no questions asked.',
    organization: 'Sample Data',
    category: 'food',
    location_name: 'True Light Family Resource Center',
    address: '717 E 31st Street', city: 'Kansas City', state: 'MO', zip_code: '64109',
    latitude: 39.0629, longitude: -94.5744,
    starts_at: daysFromNow(4, 7), ends_at: daysFromNow(4, 9),
    contact_phone: '(816) 561-1700'
  },
  {
    // Deliberately cancelled, so you can see how a cancellation renders.
    title: 'Evening Meal in the Park',
    description: 'Hot dinner served from the pavilion.',
    organization: 'Sample Data',
    category: 'food',
    location_name: 'Washington Square Park',
    address: '100 E Pershing Road', city: 'Kansas City', state: 'MO', zip_code: '64108',
    latitude: 39.0847, longitude: -94.5833,
    starts_at: daysFromNow(3, 18), ends_at: daysFromNow(3, 20),
    status: 'cancelled',
    cancellation_note: 'Cancelled this week due to a scheduling conflict at the park. Nearest alternative is the Redemptorist Center lunch, Mon-Fri 10am-1pm.',
    contact_phone: ''
  }
];

const posts = [
  {
    title: 'Bus fares are no longer free',
    content: 'As of June 1 2026, RideKC buses charge fares again. Plan for fare money or ask about passes before you travel. Visit ridekc.org/fares for details.',
    organization: 'Sample Data', category: 'alert', pinned: 1
  },
  {
    title: 'Street Sheet updated for summer',
    content: 'The Kansas City Public Library has published the Summer 2026 Street Sheet. Pick up a paper copy at Central Library, 14 W 10th St, third floor.',
    organization: 'Sample Data', category: 'update', pinned: 0
  },
  {
    title: 'Shower schedule change',
    content: 'Thursday evening showers are now reserved for women, trans and gender non-conforming guests. Sunday mornings remain open to everyone.',
    organization: 'Sample Data', category: 'closure', pinned: 0
  }
];

const run = async () => {
  await db.init();
  await new Promise((resolve) => setTimeout(resolve, 400));
  const conn = db.getDb();

  if (process.argv.includes('--clear')) {
    conn.run("DELETE FROM events WHERE organization = 'Sample Data'", function () {
      console.log(`Removed ${this.changes} sample events.`);
      conn.run("DELETE FROM community_posts WHERE organization = 'Sample Data'", function () {
        console.log(`Removed ${this.changes} sample posts.`);
        db.close();
      });
    });
    return;
  }

  // Clear previous sample rows first so re-running doesn't pile up duplicates.
  conn.run("DELETE FROM events WHERE organization = 'Sample Data'");
  conn.run("DELETE FROM community_posts WHERE organization = 'Sample Data'");

  events.forEach((e) => {
    const slug = `${e.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${crypto.randomBytes(3).toString('hex')}`;
    conn.run(
      `INSERT INTO events (slug, title, description, organization, category, location_name,
         address, city, state, zip_code, latitude, longitude, starts_at, ends_at,
         status, cancellation_note, contact_phone, posted_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [slug, e.title, e.description, e.organization, e.category, e.location_name,
       e.address, e.city, e.state, e.zip_code, e.latitude, e.longitude,
       e.starts_at, e.ends_at, e.status || 'scheduled', e.cancellation_note || '',
       e.contact_phone, e.organization]
    );
  });

  posts.forEach((p) => {
    conn.run(
      `INSERT INTO community_posts (title, content, author, organization, category, pinned)
       VALUES (?,?,?,?,?,?)`,
      [p.title, p.content, p.organization, p.organization, p.category, p.pinned]
    );
  });

  setTimeout(() => {
    console.log(`Seeded ${events.length} sample events (1 cancelled) and ${posts.length} posts.`);
    console.log("All attributed to 'Sample Data'. Remove with --clear.");
    db.close();
  }, 500);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
