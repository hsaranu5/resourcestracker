const db = require('../database');
const fetch = require('node-fetch');

// Simple geocoding using Nominatim (OpenStreetMap) - free and no API key needed
const geocodeAddress = async (address) => {
  try {
    const encodedAddress = encodeURIComponent(address);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`,
      {
        headers: {
          'User-Agent': 'ResourcesTracker/1.0'
        }
      }
    );
    const data = await response.json();
    if (data && data.length > 0) {
      return {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon)
      };
    }
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
};

// Calculate distance between two coordinates (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const search = async (req, res) => {
  const { zip_code, address, radius = 10, type } = req.query;

  try {
    let searchLat = null;
    let searchLon = null;

    // Geocode if address is provided
    if (address) {
      const coords = await geocodeAddress(address);
      if (coords) {
        searchLat = coords.latitude;
        searchLon = coords.longitude;
      }
    }

    // Get all resources
    let query = 'SELECT * FROM resources WHERE 1=1';
    const params = [];

    if (zip_code) {
      query += ' AND zip_code = ?';
      params.push(zip_code);
    }

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    db.getDb().all(query, params, async (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

      // If we have coordinates, filter by radius
      if (searchLat && searchLon) {
        const filteredRows = rows
          .filter(row => row.latitude && row.longitude)
          .map(row => ({
            ...row,
            distance: calculateDistance(searchLat, searchLon, row.latitude, row.longitude)
          }))
          .filter(row => row.distance <= radius)
          .sort((a, b) => a.distance - b.distance);

        res.json({
          results: filteredRows,
          searchLocation: { latitude: searchLat, longitude: searchLon },
          radius: parseFloat(radius)
        });
      } else {
        res.json({
          results: rows,
          searchLocation: null,
          radius: null
        });
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  search
};

