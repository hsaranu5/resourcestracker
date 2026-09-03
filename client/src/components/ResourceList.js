import React, { useEffect, useRef } from 'react';
import Icon from '../icons';
import { categoryOf, openStatus, googleMapsUrl } from '../lib';

export const OpenBadge = ({ hours }) => {
  const status = openStatus(hours);
  if (status === 'always') return <span className="badge badge-open">Open 24/7</span>;
  if (status === 'open') return <span className="badge badge-open">Open now</span>;
  if (status === 'closing') return <span className="badge badge-closing">Closing soon</span>;
  if (status === 'closed') return <span className="badge badge-closed">Closed now</span>;
  if (status === 'check') return <span className="badge badge-check">Check hours</span>;
  return null;
};

// Shown on entries we haven't been able to confirm directly with the provider.
// Same intent as the iOS "Call first" flag: don't let an unverified listing look
// as trustworthy as a confirmed one.
export const VerifiedWarning = ({ verified }) => {
  if (verified === undefined || verified === null) return null;
  const isVerified = verified === true || verified === 1 || verified === 'TRUE';
  if (isVerified) return null;
  return (
    <span className="badge badge-warn" title="Not confirmed with the provider — call before going">
      <Icon name="alert" size={11} /> Call first
    </span>
  );
};

/** No street address: a phone or text line, useful from anywhere. */
export const isPhoneOnly = (r) => r.latitude == null || r.longitude == null;

const ResourceList = ({
  resources,
  onSelectResource,
  selectedResource,
  onShowDetail,
  showDistance = true,
  selectedForPrint,
  onTogglePrint
}) => {
  const itemRefs = useRef({});

  // Tapping a pin on the map brings its card into view here — the mirror of
  // a list click flying the map to the pin.
  useEffect(() => {
    if (selectedResource?.id != null) {
      itemRefs.current[selectedResource.id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedResource]);

  if (resources.length === 0) {
    return (
      <div className="empty-state">
        <p>No resources match</p>
        <p style={{ fontSize: '12px' }}>Try a wider radius or another category.</p>
      </div>
    );
  }

  // Phone and text lines have no distance, so a distance-sorted list dumps
  // them at the bottom looking like the least relevant results. They are not —
  // they work from anywhere. Give them their own labelled block instead.
  const placed = resources.filter((r) => !isPhoneOnly(r));
  const phoneOnly = resources.filter(isPhoneOnly);

  const card = (resource) => {
    const cat = categoryOf(resource.type);
    const maps = googleMapsUrl(resource);
    const tel = resource.phone ? resource.phone.replace(/[^\d+]/g, '') : null;
    return (
      <div
        key={resource.id}
        ref={(el) => { itemRefs.current[resource.id] = el; }}
        className={`resource-item ${selectedResource?.id === resource.id ? 'selected' : ''}`}
        onClick={() => onSelectResource(resource)}
      >
        <div className="resource-top">
          {onTogglePrint && (
            <input
              type="checkbox"
              className="print-check"
              checked={!!selectedForPrint?.has(resource.id)}
              onClick={(e) => e.stopPropagation()}
              onChange={() => onTogglePrint(resource.id)}
              aria-label={`Add ${resource.name} to the printed list`}
            />
          )}
          <span className="resource-icon" style={{ background: cat.color }}>
            <Icon name={cat.key} size={17} />
          </span>
          <div className="resource-titles">
            <h3>{resource.name}</h3>
            {resource.organization && <div className="organization">{resource.organization}</div>}
          </div>
          {showDistance && resource.distanceMiles != null && (
            <span className="distance">
              {resource.distanceMiles < 0.1 ? '< 0.1' : resource.distanceMiles.toFixed(1)} mi
            </span>
          )}
        </div>

        <div className="badge-row">
          <OpenBadge hours={resource.hours} />
          <VerifiedWarning verified={resource.verified} />
          {isPhoneOnly(resource) && <span className="badge badge-phone">Phone only</span>}
        </div>

        {resource.address && (
          <div className="address">
            <Icon name="pin" size={12} /> {resource.address}
            {resource.city ? `, ${resource.city}` : ''}
            {resource.state ? `, ${resource.state}` : ''}
            {resource.zip_code ? `, ${resource.zip_code}` : ''}
          </div>
        )}
        {resource.hours && (
          <div className="hours"><Icon name="clock" size={12} /> {resource.hours}</div>
        )}

        {/* Three peers, not one filled button and two afterthoughts. Whether a
            place is open and who it serves matters more than routing to it,
            and a full-width Directions on every card ranked nothing. */}
        <div className="card-actions">
          {tel && (
            <a className="action" href={`tel:${tel}`} onClick={(e) => e.stopPropagation()}>
              <Icon name="phone" size={13} /> {resource.phone}
            </a>
          )}
          {maps && (
            <a
              className="action"
              href={maps}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <Icon name="directions" size={13} /> Directions
            </a>
          )}
          <button
            className="action"
            onClick={(e) => { e.stopPropagation(); onShowDetail(resource); }}
          >
            <Icon name="info" size={13} /> Details
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="resource-list">
      {placed.map(card)}

      {phoneOnly.length > 0 && (
        <>
          <h2 className="list-group-head">
            Call or text — no walk-in location ({phoneOnly.length})
          </h2>
          {phoneOnly.map(card)}
        </>
      )}
    </div>
  );
};

export default ResourceList;
