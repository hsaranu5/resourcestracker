/**
 * Shared helpers for the map-first UI, mirroring the iOS app's behavior:
 * category colors/icons, distance math, and "Open now" / "Open 24/7" badges.
 */

export const KC_CENTER = { latitude: 39.0997, longitude: -94.5786 };

export const CATEGORIES = [
  { key: 'food',     label: 'Food',     color: '#E8842C' },
  { key: 'shelter',  label: 'Shelter',  color: '#4A80E8' },
  { key: 'health',   label: 'Health',   color: '#3BA55C' },
  { key: 'hygiene',  label: 'Hygiene',  color: '#2FA8B8' },
  { key: 'crisis',   label: 'Crisis',   color: '#D64545' },
  { key: 'youth',    label: 'Youth',    color: '#8E5FBF' },
  { key: 'veterans', label: 'Veterans', color: '#5B6B8C' },
  { key: 'support',  label: 'Support',  color: '#7B8794' }
];

export const categoryOf = (key) =>
  CATEGORIES.find((c) => c.key === key) || { key: 'pin', label: key, color: '#7B8794' };

/**
 * Google Maps handoff. Coordinates when we have them, address search otherwise.
 */
export const googleMapsUrl = (r) => {
  if (r.latitude != null && r.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${r.latitude},${r.longitude}`;
  }
  const q = [r.address, r.city, r.state, r.zip_code || r.zipCode].filter(Boolean).join(', ');
  return q ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}` : null;
};

export const POST_CATEGORIES = {
  update:  { label: 'Update',  icon: 'megaphone', color: '#4A80E8' },
  alert:   { label: 'Alert',   icon: 'alert',     color: '#E8842C' },
  closure: { label: 'Closure', icon: 'closure',   color: '#D64545' },
  need:    { label: 'Need',    icon: 'need',      color: '#8E5FBF' }
};

// ---------------------------------------------------------------------------
// Offline standby cache.
//
// Every successful fetch saves a copy to localStorage so a wifi outage (or a
// venue with no signal) still has data on standby. The saved copy is capped
// to OFFLINE_RADIUS_MI around the user — a shop in California is useless to
// someone in Kansas. Entries without coordinates (hotlines, text lines)
// always stay: they work from anywhere.
// ---------------------------------------------------------------------------

export const OFFLINE_RADIUS_MI = 15;

export const capToRadius = (items, location, radiusMi = OFFLINE_RADIUS_MI) =>
  items.filter((item) => {
    if (item.latitude == null || item.longitude == null) return true;
    return haversineMiles(location.latitude, location.longitude, item.latitude, item.longitude) <= radiusMi;
  });

export const saveOffline = (key, items, location) => {
  try {
    localStorage.setItem(
      `offline:${key}`,
      JSON.stringify({ savedAt: new Date().toISOString(), items: capToRadius(items, location) })
    );
  } catch (e) {
    // Storage full or blocked (private browsing) — the live app still works.
  }
};

export const loadOffline = (key) => {
  try {
    const raw = localStorage.getItem(`offline:${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

/** "4 days ago" style relative time for post metadata. */
export const relativeTime = (dateString) => {
  const then = new Date(dateString).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  return 'last month';
};

export const haversineMiles = (lat1, lon1, lat2, lon2) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

// ---------------------------------------------------------------------------
// Open-now detection from free-text hours like:
//   "Mon 10:00am-4:00pm; Tue-Thu 9:00am-4:00pm"
//   "Showers Tue & Thu 7:00am-10:30am"
//   "24/7"  ·  "Daily 8am-5pm"
// Best effort: anything we can't parse simply gets no badge.
// ---------------------------------------------------------------------------

const DAY_INDEX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const DAY_TOKEN = /\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/gi;
const DAY_RANGE = /\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\s*(?:-|–|to)\s*(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i;
const TIME_RANGE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;

const toMinutes = (hourStr, minStr, meridiem, fallbackMeridiem) => {
  let h = parseInt(hourStr, 10);
  const m = minStr ? parseInt(minStr, 10) : 0;
  const mer = (meridiem || fallbackMeridiem || '').toLowerCase();
  if (mer === 'pm' && h !== 12) h += 12;
  if (mer === 'am' && h === 12) h = 0;
  return h * 60 + m;
};

const daysInSegment = (segment) => {
  if (/\b(daily|every\s*day|7\s*days)\b/i.test(segment)) return new Set([0, 1, 2, 3, 4, 5, 6]);

  const days = new Set();
  const range = segment.match(DAY_RANGE);
  if (range) {
    let d = DAY_INDEX[range[1].slice(0, 3).toLowerCase()];
    const end = DAY_INDEX[range[2].slice(0, 3).toLowerCase()];
    days.add(d);
    while (d !== end) { d = (d + 1) % 7; days.add(d); }
    // Strip the range so lone tokens on either side ("Sat" in "Mon-Fri, Sat") still count below.
    segment = segment.replace(DAY_RANGE, '');
  }
  for (const token of segment.match(DAY_TOKEN) || []) {
    days.add(DAY_INDEX[token.slice(0, 3).toLowerCase()]);
  }
  return days;
};

// Week-of-month and every-other-week markers. When any of these appears, the
// weekday-only parser below is not enough to know if a place is open — "2nd &
// 4th Tue" read naively looks like *every* Tuesday, which would badge a clinic
// "Open now" on a 1st Tuesday when it's shut. We deliberately return 'check'
// instead of guessing, matching the iOS OpeningHours behavior. A wasted trip
// here can mean miles on foot.
const CONDITIONAL = /\b(1st|2nd|3rd|4th|first|second|third|fourth|every other|bi-?weekly|of (?:each|the) month|monthly)\b/i;

// How close to closing time we start warning, in minutes.
const CLOSING_SOON_MIN = 60;

/**
 * Returns 'always' | 'open' | 'closing' | 'closed' | 'check' | 'unknown'.
 *
 *   always  — 24/7
 *   open    — open right now
 *   closing — open now, but within CLOSING_SOON_MIN of closing
 *   closed  — parseable hours, but not open right now
 *   check   — hours depend on week-of-month, or couldn't be parsed
 *   unknown — no hours string at all
 */
export const openStatus = (hours, now = new Date()) => {
  if (!hours || !hours.trim()) return 'unknown';
  if (/24\s*\/\s*7|24\s*hours/i.test(hours)) return 'always';
  if (CONDITIONAL.test(hours)) return 'check';

  const today = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let parsedAnything = false;

  for (const segment of hours.split(/;|\n/)) {
    const time = segment.match(TIME_RANGE);
    if (!time) continue;
    const days = daysInSegment(segment);
    if (days.size === 0) continue;
    parsedAnything = true;
    if (!days.has(today)) continue;

    // "10:00-4:00pm" style: infer a missing first meridiem from the second.
    const start = toMinutes(time[1], time[2], time[3], time[6]);
    const end = toMinutes(time[4], time[5], time[6]);
    if (nowMin >= start && nowMin < end) {
      return end - nowMin <= CLOSING_SOON_MIN ? 'closing' : 'open';
    }
  }

  // Hours were written down but we couldn't line any up with a real time range —
  // safer to say "check" than to assert "closed" and turn someone away.
  return parsedAnything ? 'closed' : 'check';
};
