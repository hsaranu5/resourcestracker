import React, { useState } from 'react';
import Icon from '../icons';

/**
 * Where distances are measured from — asked once, then always stated.
 *
 * The app used to fall back to downtown Kansas City whenever geolocation was
 * denied, and label the result "0.3 mi" with nothing saying 0.3 miles from
 * where. On a library terminal in Independence that is a false statement about
 * a place twelve miles away. So: ask, let people skip in one click, accept a
 * ZIP instead, and never show a distance without naming its origin.
 */
const LocationBar = ({ origin, onUseDevice, onUseZip, onSkip, onReset, busy, error }) => {
  const [zip, setZip] = useState('');
  const [typing, setTyping] = useState(false);

  // Already settled: state the origin, offer a way to change it.
  if (origin.kind !== 'unknown') {
    return (
      <div className="location-bar location-bar-settled">
        <Icon name="pin" size={13} />
        {origin.kind === 'device' && <span>Distances from you</span>}
        {origin.kind === 'zip' && <span>Distances from {origin.zip}</span>}
        {origin.kind === 'skipped' && <span>No distances</span>}
        <button className="location-link" onClick={onReset}>Change</button>
      </div>
    );
  }

  if (typing) {
    return (
      <form
        className="location-bar"
        onSubmit={(e) => { e.preventDefault(); onUseZip(zip.trim()); }}
      >
        <label htmlFor="zip-input">Your ZIP code</label>
        <input
          id="zip-input"
          className="location-zip"
          inputMode="numeric"
          pattern="\d{5}"
          maxLength={5}
          placeholder="64108"
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/\D/g, ''))}
          autoFocus
        />
        <button className="location-primary" type="submit" disabled={zip.length !== 5}>
          Use this ZIP
        </button>
        <button className="location-link" type="button" onClick={() => setTyping(false)}>
          Back
        </button>
        {error && <span className="location-error">{error}</span>}
      </form>
    );
  }

  return (
    <div className="location-bar">
      <span className="location-ask">Show what's closest to you?</span>
      <button className="location-primary" onClick={onUseDevice} disabled={busy}>
        {busy ? 'Locating…' : 'Use my location'}
      </button>
      <button className="location-secondary" onClick={() => setTyping(true)}>
        Enter a ZIP
      </button>
      <button className="location-link" onClick={onSkip}>Skip</button>
      {error && <span className="location-error">{error}</span>}
    </div>
  );
};

export default LocationBar;
