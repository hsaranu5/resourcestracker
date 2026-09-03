/**
 * The app's icon set — inline SVG, no emoji. One source of truth used two ways:
 *   <Icon name="food" />        React component (chips, cards, buttons)
 *   iconSvgString('food', ...)  raw string (Leaflet divIcon markers)
 *
 * Primitives per icon: "M…" path data, or "@cx,cy,r" for circles.
 */

import React from 'react';

const PRIMS = {
  // Categories
  food: [
    'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2',
    'M7 2v20',
    'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7'
  ],
  shelter: ['m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 22V12h6v10'],
  health: [
    'M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2',
    'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    'M12 10v6',
    'M9 13h6'
  ],
  hygiene: [
    'm4 4 2.5 2.5',
    'M13.5 6.5a4.95 4.95 0 0 0-7 7',
    'M15 5 5 15',
    'M14 17v.01', 'M10 16v.01', 'M13 13v.01', 'M16 10v.01',
    'M11 20v.01', 'M17 14v.01', 'M20 11v.01'
  ],
  crisis: [
    'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z'
  ],
  youth: [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    '@9,7,4',
    'M22 21v-2a4 4 0 0 0-3-3.87',
    'M16 3.13a4 4 0 0 1 0 7.75'
  ],
  veterans: [
    'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'
  ],
  support: [
    'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'
  ],

  // UI
  grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
  search: ['@11,11,8', 'm21 21-4.3-4.3'],
  sun: [
    '@12,12,4',
    'M12 2v2', 'M12 20v2', 'm4.93 4.93 1.41 1.41', 'm17.66 17.66 1.41 1.41',
    'M2 12h2', 'M20 12h2', 'm6.34 17.66-1.41 1.41', 'm19.07 4.93-1.41 1.41'
  ],
  moon: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'],
  clock: ['@12,12,10', 'M12 6v6l4 2'],
  pin: ['M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z', '@12,10,3'],
  phone: [
    'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z'
  ],
  directions: ['m15 14 5-5-5-5', 'M4 20v-7a4 4 0 0 1 4-4h12'],
  info: ['@12,12,10', 'M12 16v-4', 'M12 8h.01'],
  close: ['M18 6 6 18', 'm6 6 12 12'],
  refresh: ['M3 12a9 9 0 0 1 15-6.7L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-15 6.7L3 16', 'M3 21v-5h5'],
  print: ['M6 9V2h12v7', 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2', 'M6 14h12v8H6z'],
  expand: ['M15 3h6v6', 'M9 21H3v-6', 'M21 3l-7 7', 'M3 21l7-7'],
  collapse: ['M4 14h6v6', 'M20 10h-6V4', 'M14 10l7-7', 'M3 21l7-7'],
  calendar: ['M8 2v4', 'M16 2v4', 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M3 10h18'],
  pinned: ['M12 17v5', 'M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z'],
  megaphone: ['m3 11 18-5v12L3 14v-3z', 'M11.6 16.8a3 3 0 1 1-5.8-1.6'],
  alert: ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z', 'M12 9v4', 'M12 17h.01'],
  closure: ['@12,12,10', 'm15 9-6 6', 'm9 9 6 6'],
  need: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'],
  externalMap: ['M18 6 6 18', 'm15 14 5-5-5-5']
};

const renderPrims = (name) =>
  (PRIMS[name] || PRIMS.pin).map((p, i) => {
    if (p.startsWith('@')) {
      const [cx, cy, r] = p.slice(1).split(',');
      return <circle key={i} cx={cx} cy={cy} r={r} />;
    }
    return <path key={i} d={p} />;
  });

export const Icon = ({ name, size = 16, strokeWidth = 2, style, className }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
    className={className}
    aria-hidden="true"
  >
    {renderPrims(name)}
  </svg>
);

/** Raw SVG string for Leaflet divIcon markers. */
export const iconSvgString = (name, { size = 15, stroke = '#fff', strokeWidth = 2.2 } = {}) => {
  const body = (PRIMS[name] || PRIMS.pin)
    .map((p) => {
      if (p.startsWith('@')) {
        const [cx, cy, r] = p.slice(1).split(',');
        return `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
      }
      return `<path d="${p}"/>`;
    })
    .join('');
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
};

export default Icon;
