const crypto = require('crypto');
const db = require('../database');
const { haversineMiles } = require('./mobileController');

const VALID_CATEGORIES = ['food', 'shelter', 'health', 'hygiene', 'crisis', 'youth', 'veterans', 'support'];
// Everything that can be READ. 'update' and 'need' are retired but rows
// carrying them still exist, and a reader that rejected them would blank
// posts that are already published.
const VALID_POST_CATEGORIES = ['update', 'alert', 'closure', 'need'];

// Everything that can still be WRITTEN. 'need' is an organisation talking to
// donors — volunteers, supplies — which does not belong in a feed read by
// someone looking for a shower. 'update' was a catch-all that absorbed
// everything else. What remains is the pair that changes whether a trip is
// worth making.
const PUBLISHABLE_POST_CATEGORIES = ['alert', 'closure'];

const slugify = (text) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

const isValidDate = (value) => value && !Number.isNaN(Date.parse(value));

// Lazy require to avoid a circular dependency (communityExport uses toEvent/toPost).
// Keeps /data/*.json in sync whenever a verified org publishes or amends.
const syncDataFolder = () => {
  try {
    require('../communityExport').exportCommunity();
  } catch (e) {
    console.error('Could not sync /data:', e.message);
  }
};

const toEvent = (row) => {
  const event = {
    id: row.slug || String(row.id),
    title: row.title,
    description: row.description || '',
    organization: row.organization,
    category: VALID_CATEGORIES.includes(row.category) ? row.category : 'support',
    locationName: row.location_name || '',
    address: row.address || '',
    city: row.city || '',
    state: row.state || '',
    zipCode: row.zip_code || '',
    startsAt: row.starts_at,
    endsAt: row.ends_at || null,
    status: row.status || 'scheduled',
    cancellationNote: row.cancellation_note || '',
    contactPhone: row.contact_phone || '',
    resourceId: row.resource_slug || null,
    mappable: Boolean(row.address) && row.latitude != null && row.longitude != null
  };
  if (row.latitude != null && row.longitude != null) {
    event.latitude = row.latitude;
    event.longitude = row.longitude;
  }
  return event;
};

const toPost = (row) => ({
  id: String(row.id),
  title: row.title,
  content: row.content,
  organization: row.organization || row.author || 'Unknown',
  category: VALID_POST_CATEGORIES.includes(row.category) ? row.category : 'update',
  pinned: row.pinned === 1,
  createdAt: row.created_at,
  expiresAt: row.expires_at || null,
  resourceId: row.resource_id ? String(row.resource_id) : null
});

/**
 * GET /api/community/events
 *
 * Query: from, to (ISO dates), lat, lng, radius (miles), category, includePast
 *
 * Defaults to the next 14 days. Cancelled events are always included — someone
 * may have planned around one, so they need to see it's off rather than have it
 * quietly disappear.
 */
const listEvents = (req, res) => {
  const { lat, lng, radius, category, includePast } = req.query;

  const from = isValidDate(req.query.from) ? new Date(req.query.from) : new Date();
  const to = isValidDate(req.query.to)
    ? new Date(req.query.to)
    : new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);

  const params = [];
  let sql = 'SELECT * FROM events WHERE 1=1';

  if (includePast !== 'true') {
    sql += ' AND (ends_at IS NULL OR ends_at >= ?) AND starts_at <= ?';
    params.push(from.toISOString(), to.toISOString());
  }
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  sql += ' ORDER BY starts_at ASC';

  db.getDb().all(sql, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    let events = rows.map(toEvent);

    // Optional proximity filter. Events without coordinates are kept regardless —
    // an event with only a described location is still worth knowing about.
    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    const radiusMiles = parseFloat(radius);

    if (Number.isFinite(userLat) && Number.isFinite(userLng) && Number.isFinite(radiusMiles)) {
      events = events
        .map((event) => {
          if (event.latitude == null) return { ...event, distanceMiles: null };
          const distanceMiles = haversineMiles(userLat, userLng, event.latitude, event.longitude);
          return { ...event, distanceMiles: Number(distanceMiles.toFixed(2)) };
        })
        .filter((event) => event.distanceMiles === null || event.distanceMiles <= radiusMiles);
    }

    res.json({
      version: 1,
      generated: new Date().toISOString(),
      window: { from: from.toISOString(), to: to.toISOString() },
      count: events.length,
      events
    });
  });
};

/** POST /api/community/events — requires an org token. */
const createEvent = (req, res) => {
  const {
    title, description, category, locationName, address, city, state,
    zipCode, latitude, longitude, startsAt, endsAt, contactPhone, resourceId
  } = req.body;

  if (!title || !String(title).trim()) {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  if (!isValidDate(startsAt)) {
    res.status(400).json({ error: 'startsAt is required and must be an ISO date' });
    return;
  }
  if (endsAt && !isValidDate(endsAt)) {
    res.status(400).json({ error: 'endsAt must be an ISO date' });
    return;
  }
  if (endsAt && Date.parse(endsAt) < Date.parse(startsAt)) {
    res.status(400).json({ error: 'endsAt cannot be before startsAt' });
    return;
  }
  if (category && !VALID_CATEGORIES.includes(category)) {
    res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    return;
  }

  // Slug is derived from the title plus a short random suffix, so two orgs
  // running "Mobile Pantry" don't collide.
  const slug = `${slugify(title)}-${crypto.randomBytes(3).toString('hex')}`;

  const sql = `
    INSERT INTO events (
      slug, title, description, organization, category, location_name, address,
      city, state, zip_code, latitude, longitude, starts_at, ends_at,
      contact_phone, resource_slug, posted_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.getDb().run(
    sql,
    [
      slug, String(title).trim(), description || '', req.organization,
      category || 'support', locationName || '', address || '', city || '',
      state || '', zipCode || '', latitude ?? null, longitude ?? null,
      new Date(startsAt).toISOString(), endsAt ? new Date(endsAt).toISOString() : null,
      contactPhone || '', resourceId || null, req.organization
    ],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      db.getDb().get('SELECT * FROM events WHERE id = ?', [this.lastID], (e, row) => {
        if (e) {
          res.status(500).json({ error: e.message });
          return;
        }
        res.status(201).json(toEvent(row));
        syncDataFolder();
      });
    }
  );
};

/**
 * PATCH /api/community/events/:slug — requires an org token.
 *
 * Used to cancel or amend. An organisation can only touch its own events.
 */
const updateEvent = (req, res) => {
  const { slug } = req.params;
  const { status, cancellationNote, title, description, startsAt, endsAt, contactPhone } = req.body;

  if (status && !['scheduled', 'cancelled'].includes(status)) {
    res.status(400).json({ error: "status must be 'scheduled' or 'cancelled'" });
    return;
  }

  db.getDb().get('SELECT * FROM events WHERE slug = ?', [slug], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    if (row.organization !== req.organization) {
      res.status(403).json({ error: 'You can only change your own organisation\'s events.' });
      return;
    }

    const updated = {
      title: title ?? row.title,
      description: description ?? row.description,
      starts_at: isValidDate(startsAt) ? new Date(startsAt).toISOString() : row.starts_at,
      ends_at: isValidDate(endsAt) ? new Date(endsAt).toISOString() : row.ends_at,
      status: status ?? row.status,
      cancellation_note: cancellationNote ?? row.cancellation_note,
      contact_phone: contactPhone ?? row.contact_phone
    };

    db.getDb().run(
      `UPDATE events SET title = ?, description = ?, starts_at = ?, ends_at = ?,
         status = ?, cancellation_note = ?, contact_phone = ?, updated_at = CURRENT_TIMESTAMP
       WHERE slug = ?`,
      [...Object.values(updated), slug],
      (updateErr) => {
        if (updateErr) {
          res.status(500).json({ error: updateErr.message });
          return;
        }
        db.getDb().get('SELECT * FROM events WHERE slug = ?', [slug], (e, fresh) => {
          if (e) {
            res.status(500).json({ error: e.message });
            return;
          }
          res.json(toEvent(fresh));
          syncDataFolder();
        });
      }
    );
  });
};

/**
 * GET /api/community/posts
 * Pinned posts first, then newest. Expired posts are filtered out.
 */
const listPosts = (req, res) => {
  const now = new Date().toISOString();
  db.getDb().all(
    `SELECT * FROM community_posts
     WHERE expires_at IS NULL OR expires_at >= ?
     ORDER BY pinned DESC, created_at DESC
     LIMIT 100`,
    [now],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({
        version: 1,
        generated: new Date().toISOString(),
        count: rows.length,
        posts: rows.map(toPost)
      });
    }
  );
};

/** POST /api/community/posts — requires an org token. */
const createPost = (req, res) => {
  const { title, content, category, pinned, expiresAt, resourceId } = req.body;

  if (!title || !String(title).trim()) {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  if (!content || !String(content).trim()) {
    res.status(400).json({ error: 'content is required' });
    return;
  }
  if (category && !PUBLISHABLE_POST_CATEGORIES.includes(category)) {
    res.status(400).json({ error: `category must be one of: ${PUBLISHABLE_POST_CATEGORIES.join(', ')}` });
    return;
  }
  if (expiresAt && !isValidDate(expiresAt)) {
    res.status(400).json({ error: 'expiresAt must be an ISO date' });
    return;
  }

  db.getDb().run(
    `INSERT INTO community_posts (title, content, author, organization, category, pinned, expires_at, resource_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(title).trim(), String(content).trim(), req.organization, req.organization,
      category || 'alert', pinned ? 1 : 0,
      // Posts don't linger: a week by default, unless the org sets its own
      // expiry. Stale information costs someone a walk across town.
      expiresAt
        ? new Date(expiresAt).toISOString()
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      resourceId || null
    ],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      db.getDb().get('SELECT * FROM community_posts WHERE id = ?', [this.lastID], (e, row) => {
        if (e) {
          res.status(500).json({ error: e.message });
          return;
        }
        res.status(201).json(toPost(row));
        syncDataFolder();
      });
    }
  );
};

module.exports = {
  listEvents, createEvent, updateEvent, listPosts, createPost,
  toEvent, toPost, slugify
};
