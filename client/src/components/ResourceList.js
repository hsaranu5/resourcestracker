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

const ResourceList = ({ resources, onSelectResource, selectedResource, onShowDetail }) => {
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

  return (
    <div className="resource-list">
      {resources.map((resource) => {
        const cat = categoryOf(resource.type);
        const maps = googleMapsUrl(resource);
        return (
          <div
            key={resource.id}
            ref={(el) => { itemRefs.current[resource.id] = el; }}
            className={`resource-item ${selectedResource?.id === resource.id ? 'selected' : ''}`}
            onClick={() => onSelectResource(resource)}
          >
            <div className="resource-top">
              <span className="resource-icon" style={{ background: cat.color }}>
                <Icon name={cat.key} size={17} />
              </span>
              <div className="resource-titles">
                <h3>{resource.name}</h3>
                {resource.organization && <div className="organization">{resource.organization}</div>}
              </div>
              {resource.distanceMiles != null && (
                <span className="distance">
                  {resource.distanceMiles < 0.1 ? '< 0.1' : resource.distanceMiles.toFixed(1)} mi
                </span>
              )}
            </div>

            <div className="badge-row">
              <OpenBadge hours={resource.hours} />
              <VerifiedWarning verified={resource.verified} />
            </div>

            {resource.address && (
              <div className="address">
                <Icon name="pin" size={12} /> {resource.address}
                {resource.city ? `, ${resource.city}` : ''}
                {resource.state ? `, ${resource.state}` : ''}
                {resource.zip_code ? `, ${resource.zip_code}` : ''}
              </div>
            )}
            {resource.phone && (
              <div className="address"><Icon name="phone" size={12} /> {resource.phone}</div>
            )}
            {resource.hours && (
              <div className="hours"><Icon name="clock" size={12} /> {resource.hours}</div>
            )}

            <div className="card-actions">
              {maps && (
                <a
                  className="action-primary"
                  href={maps}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Icon name="directions" size={14} /> Directions
                </a>
              )}
              <button
                className="action-secondary"
                onClick={(e) => { e.stopPropagation(); onShowDetail(resource); }}
                aria-label={`Details for ${resource.name}`}
              >
                <Icon name="info" size={15} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ResourceList;
