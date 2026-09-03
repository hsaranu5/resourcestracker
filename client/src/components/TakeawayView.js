import React from 'react';
import { openStatus, PRIORITY_LINES, TRANSIT_NOTICE } from '../lib';

/**
 * The list someone leaves with.
 *
 * On a library or shelter terminal there is no account and no way to take the
 * screen along, so this is the exit: a plain page you can print, or photograph
 * off the monitor with a phone. Both readings drive the same choices — one
 * column, real type sizes, phone numbers big enough to read at arm's length,
 * no map, no icons carrying meaning, and nothing that only makes sense in
 * colour. Crisis lines and the fare notice go on every copy regardless of what
 * was ticked.
 */

const statusWords = {
  always: 'Open 24/7',
  open: 'Open now',
  closing: 'Closing soon',
  closed: 'Closed right now',
  check: 'Call to check hours',
  unknown: ''
};

const TakeawayView = ({ resources, crisisLines, origin, onBack }) => {
  const printedOn = new Date().toLocaleDateString([], {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

  const featured = [];
  for (const want of PRIORITY_LINES) {
    const match = crisisLines.find(
      (r) => r.phone && (r.phone.replace(/\D/g, '') === want || r.name.toLowerCase().includes(want.toLowerCase()))
    );
    if (match && !featured.includes(match)) featured.push(match);
  }
  for (const line of crisisLines) {
    if (featured.length >= 6) break;
    if (!featured.includes(line)) featured.push(line);
  }

  return (
    <div className="takeaway">
      <div className="takeaway-bar">
        <button className="location-secondary" onClick={onBack}>← Back to the list</button>
        <button className="location-primary" onClick={() => window.print()}>Print this page</button>
        <span className="takeaway-hint">Or take a photo of the screen.</span>
      </div>

      <div className="takeaway-page">
        <header className="takeaway-head">
          <h1>KC Resources</h1>
          <p>
            {resources.length} {resources.length === 1 ? 'place' : 'places'} · {printedOn}
            {origin.kind === 'zip' && ` · near ${origin.zip}`}
          </p>
        </header>

        {resources.length === 0 ? (
          <p className="takeaway-empty">Nothing ticked and nothing in the list to print.</p>
        ) : (
          <ol className="takeaway-list">
            {resources.map((r) => {
              const status = statusWords[openStatus(r.hours)];
              const unverified =
                r.verified !== undefined && r.verified !== null &&
                !(r.verified === true || r.verified === 1 || r.verified === 'TRUE');
              return (
                <li key={r.id}>
                  <h2>{r.name}</h2>
                  {r.organization && <p className="takeaway-org">{r.organization}</p>}
                  {r.phone && <p className="takeaway-phone">{r.phone}</p>}
                  {r.address && (
                    <p>
                      {r.address}
                      {r.city ? `, ${r.city}` : ''}
                      {r.state ? `, ${r.state}` : ''}
                      {r.zip_code ? ` ${r.zip_code}` : ''}
                    </p>
                  )}
                  {!r.address && <p className="takeaway-note">Phone or text only — no walk-in location.</p>}
                  {r.hours && <p>Hours: {r.hours}</p>}
                  {status && <p className="takeaway-note">{status} (as of printing)</p>}
                  {r.eligibility && <p>Who it's for: {r.eligibility}</p>}
                  {unverified && (
                    <p className="takeaway-warn">Not confirmed with the provider — call before going.</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        <section className="takeaway-footer">
          <h2>Crisis lines — 24 hours</h2>
          <ul>
            {featured.map((line) => (
              <li key={line.id}><strong>{line.phone}</strong> {line.name}</li>
            ))}
          </ul>
          <p className="takeaway-note">{TRANSIT_NOTICE}</p>
          <p className="takeaway-note">
            Hours change. Call before you travel.
          </p>
        </section>
      </div>
    </div>
  );
};

export default TakeawayView;
