const db = require('../database');

const MILES_PER_KM = 0.621371;
const EARTH_RADIUS_KM = 6371;

/**
 * Great-circle distance between two points, in miles.
 *
 * We do this in JS rather than SQL because SQLite has no built-in trig
 * functions in older builds. The dataset is ~100 rows, so filtering in memory
 * is cheaper than the complexity of a spatial extension. If this grows past a
 * few thousand rows, add a bounding-box pre-filter in SQL before this step.
 */
const haversineMiles = (lat1, lon1, lat2, lon2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(a)) * MILES_PER_KM;
};

/** Placeholder addresses that should never get a map pin. */
const NON_ADDRESS = /^(phone only|confidential|mobile\s*-|call for|text )/i;

/** Reshapes a DB row into the payload shape the iOS app decodes. */
const toAppResource = (row) => {
  const address = row.address || '';
  const resource = {
    id: row.slug || String(row.id),
    name: row.name || '',
    organization: row.organization || '',
    category: row.type || 'support',
    services: row.services ? row.services.split(';').map((s) => s.trim()).filter(Boolean) : [],
    description: row.description || '',
    address,
    city: row.city || '',
    state: row.state || '',
    zipCode: row.zip_code || '',
    phone: row.phone || '',
    website: row.website || '',
    hours: row.hours || '',
    eligibility: row.eligibility || '',
    verified: row.verified === 1 || row.verified === true,
    source: row.source || '',
    mappable: Boolean(address) && !NON_ADDRESS.test(address.trim())
  };

  if (row.latitude != null && row.longitude != null) {
    resource.latitude = row.latitude;
    resource.longitude = row.longitude;
  }
  return resource;
};

/**
 * GET /api/resources/export
 * Full dataset in the app's payload shape. The app caches this and falls back
 * to its bundled copy if the request fails, so this can be slow or offline
 * without breaking anyone.
 */
const exportAll = (req, res) => {
  db.getDb().all('SELECT * FROM resources ORDER BY name', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({
      version: 1,
      generated: new Date().toISOString().slice(0, 10),
      region: 'Kansas City metro (MO + KS)',
      resources: rows.map(toAppResource)
    });
  });
};

/**
 * GET /api/resources/nearby?lat=39.09&lng=-94.57&radius=5
 *
 * Returns resources within `radius` miles, nearest first. Entries with no
 * coordinates (hotlines, mobile outreach, confidential shelters) are always
 * appended regardless of radius — someone who needs a crisis line shouldn't
 * have it filtered out by geography.
 */
const nearby = (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radius = parseFloat(req.query.radius) || 5;
  const { category } = req.query;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: 'lat and lng are required and must be numbers' });
    return;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    res.status(400).json({ error: 'lat/lng out of range' });
    return;
  }

  let query = 'SELECT * FROM resources';
  const params = [];
  if (category) {
    query += ' WHERE type = ?';
    params.push(category);
  }

  db.getDb().all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    const withDistance = [];
    const withoutCoordinates = [];

    rows.map(toAppResource).forEach((resource) => {
      if (resource.latitude == null || resource.longitude == null) {
        withoutCoordinates.push({ ...resource, distanceMiles: null });
        return;
      }
      const distanceMiles = haversineMiles(lat, lng, resource.latitude, resource.longitude);
      if (distanceMiles <= radius) {
        withDistance.push({ ...resource, distanceMiles: Number(distanceMiles.toFixed(2)) });
      }
    });

    withDistance.sort((a, b) => a.distanceMiles - b.distanceMiles);

    res.json({
      version: 1,
      generated: new Date().toISOString().slice(0, 10),
      region: 'Kansas City metro (MO + KS)',
      query: { lat, lng, radius, category: category || null },
      count: withDistance.length + withoutCoordinates.length,
      resources: [...withDistance, ...withoutCoordinates]
    });
  });
};

module.exports = { exportAll, nearby, haversineMiles, toAppResource };
