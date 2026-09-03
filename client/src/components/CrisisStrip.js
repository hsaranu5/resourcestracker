import React, { useState, useMemo } from 'react';
import Icon from '../icons';
import { PRIORITY_LINES } from '../lib';

/**
 * Crisis lines, always on screen — no filter, no tab, no scroll required.
 *
 * Every one of the 19 crisis records is a hotline with no address, so they can
 * never appear on the map and they sort to the bottom of a distance-ordered
 * list. If someone opens this app at a library terminal in a bad moment, the
 * number should already be in front of them. Three sit inline; the rest are
 * one click away.
 */
const CrisisStrip = ({ resources }) => {
  const [open, setOpen] = useState(false);

  const lines = useMemo(
    () => resources.filter((r) => r.type === 'crisis' && r.phone),
    [resources]
  );

  const featured = useMemo(() => {
    const picked = [];
    for (const want of PRIORITY_LINES) {
      const match = lines.find(
        (r) => r.phone.replace(/\D/g, '') === want || r.name.toLowerCase().includes(want.toLowerCase())
      );
      if (match && !picked.includes(match)) picked.push(match);
    }
    for (const line of lines) {
      if (picked.length >= 3) break;
      if (!picked.includes(line)) picked.push(line);
    }
    return picked;
  }, [lines]);

  if (lines.length === 0) return null;

  const rest = lines.filter((l) => !featured.includes(l));

  return (
    <section className="crisis-strip" aria-label="Crisis lines">
      <div className="crisis-row">
        <span className="crisis-label">
          <Icon name="crisis" size={13} /> Crisis lines
        </span>
        {featured.map((line) => (
          <a
            key={line.id}
            className="crisis-line"
            href={`tel:${line.phone.replace(/[^\d+]/g, '')}`}
            title={line.name}
          >
            <strong>{line.phone}</strong>
            {/* Hidden on phones, where three name-and-number pairs wrapped to
                three rows and pushed the first result off the screen. */}
            <span className="crisis-name">{line.name}</span>
          </a>
        ))}
        {rest.length > 0 && (
          <button className="crisis-more" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? 'Hide' : `${rest.length} more`}
          </button>
        )}
      </div>

      {open && (
        <ul className="crisis-all">
          {rest.map((line) => (
            <li key={line.id}>
              <a href={`tel:${line.phone.replace(/[^\d+]/g, '')}`}>
                <strong>{line.phone}</strong>
              </a>{' '}
              {line.name}
              {line.hours && <span className="crisis-hours"> · {line.hours}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default CrisisStrip;
