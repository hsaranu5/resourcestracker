import React, { useState } from 'react';
import { openStatus, PRIORITY_LINES, TRANSIT_NOTICE } from '../lib';

// Roughly five entries fit a Letter page once name, phone, address, hours,
// eligibility and the gap between them are counted, and the crisis footer
// takes most of a page on its own. Deliberately pessimistic: the estimate
// exists to stop someone feeding coins into a library printer, so it should
// never come in under what actually prints.
const ENTRIES_PER_PAGE = 5;
export const estimatePages = (n) => Math.ceil(n / ENTRIES_PER_PAGE) + 1;

// Below this, an unticked list is already narrow enough to print as it is.
// Above it, printing everything is almost certainly not what was meant.
export const PRINT_WITHOUT_TICKS_MAX = 12;

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

const TakeawayView = ({ resources, crisisLines, origin, onBack, ticked }) => {
  const [confirmed, setConfirmed] = useState(false);
  const printedOn = new Date().toLocaleDateString([], {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

  // Nothing ticked and a long list: almost certainly not what was meant, and
  // it is the visitor's coins in the printer. Say the page count out loud and
  // make them ask for it a second time.
  if (!ticked && !confirmed && resources.length > PRINT_WITHOUT_TICKS_MAX) {
    return (
      <div className="takeaway">
        <div className="takeaway-bar">
          <button className="location-secondary" onClick={onBack}>← Back to the list</button>
        </div>
        <div className="takeaway-page">
          <h1>That would print everything</h1>
          <p className="takeaway-warnbox">
            You haven't ticked anything, so this would print all{' '}
            <strong>{resources.length} places</strong> — roughly{' '}
            <strong>{estimatePages(resources.length)} pages</strong>.
          </p>
          <p>To get a shorter list:</p>
          <ul className="takeaway-tips">
            <li>Tick the checkbox on the places you actually want, then come back here.</li>
            <li>Or pick a category — Food, Shelter, Hygiene — to narrow what's shown.</li>
            <li>Or set the distance to 1, 3 or 5 miles instead of 10 or 25.</li>
          </ul>
          <p className="takeaway-note">
            Crisis lines print on every copy, however short the list.
          </p>
          <div className="takeaway-confirm">
            <button className="location-primary" onClick={onBack}>Go back and narrow it</button>
            <button className="location-secondary" onClick={() => setConfirmed(true)}>
              Print all {resources.length} anyway
            </button>
          </div>
        </div>
      </div>
    );
  }

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
          <h1>CheckpointKC</h1>
          <p>
            KC Resources ·{' '}
            {resources.length} {resources.length === 1 ? 'place' : 'places'} · {printedOn}
            {origin.kind === 'zip' && ` · near ${origin.zip}`}
            <span className="takeaway-pages">
              {' '}· about {estimatePages(resources.length)}{' '}
              {estimatePages(resources.length) === 1 ? 'page' : 'pages'}
            </span>
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
