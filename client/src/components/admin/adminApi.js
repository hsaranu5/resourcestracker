import axios from 'axios';

// Same-origin, so the httpOnly session cookie rides along (see OrgAuth).
const API_URL = process.env.REACT_APP_API_URL || '/api';

export const ROLES = [
  { value: 'publisher', label: 'Publisher', hint: 'Posts events, closures and alerts' },
  { value: 'editor', label: 'Editor', hint: 'Also adds and edits resources' },
  { value: 'admin', label: 'Admin', hint: 'Also manages who has access' }
];

const RANK = { publisher: 1, editor: 2, admin: 3 };
export const can = (session, role) => (RANK[session?.role] || 0) >= RANK[role];

// Listings with no street address use one of these in `address` (see
// data/README.md). They're meant to have no pin, so they aren't counted as
// missing coordinates.
export const ADDRESS_PLACEHOLDERS = ['Phone only', 'Confidential - call hotline', 'Call for location', 'Text 4HELP'];
export const isPlaceholderAddress = (address) =>
  ADDRESS_PLACEHOLDERS.some((p) => p.toLowerCase() === String(address || '').trim().toLowerCase());

export const isVerified = (r) => r.verified === 1 || r.verified === true;
export const needsPin = (r) => (r.latitude == null || r.longitude == null) && !isPlaceholderAddress(r.address);

/** The server's message when it sent one, otherwise a plain fallback. */
export const errorText = (err, fallback = 'Something went wrong. Try again.') =>
  err?.response?.data?.error || fallback;

export const isExpired = (err) => err?.response?.status === 401;

/** Database times are UTC 'YYYY-MM-DD HH:MM:SS'; Date would read them as local. */
export const parseDbTime = (value) => (value ? new Date(String(value).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? '' : 'Z')) : null);

export const formatWhen = (value) => {
  const d = parseDbTime(value);
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const data = (promise) => promise.then((res) => res.data);

export const api = {
  me: () => data(axios.get(`${API_URL}/auth/me`)),
  logout: () => data(axios.post(`${API_URL}/auth/logout`)),

  resources: () => data(axios.get(`${API_URL}/resources`)),
  resource: (id) => data(axios.get(`${API_URL}/resources/${id}`)),
  createResource: (body) => data(axios.post(`${API_URL}/resources`, body)),
  updateResource: (id, body) => data(axios.put(`${API_URL}/resources/${id}`, body)),
  deleteResource: (id) => data(axios.delete(`${API_URL}/resources/${id}`)),
  history: (id) => data(axios.get(`${API_URL}/admin/resources/${id}/history`)),
  geocode: (params) => data(axios.get(`${API_URL}/admin/geocode`, { params })),

  team: () => data(axios.get(`${API_URL}/admin/team`)),
  addMember: (body) => data(axios.post(`${API_URL}/admin/team`, body)),
  updateMember: (id, body) => data(axios.patch(`${API_URL}/admin/team/${id}`, body)),
  removeMember: (id) => data(axios.delete(`${API_URL}/admin/team/${id}`))
};
