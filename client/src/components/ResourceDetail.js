import React, { useEffect } from 'react';
import Icon from '../icons';
import { categoryOf, googleMapsUrl } from '../lib';
import { OpenBadge, VerifiedWarning } from './ResourceList';

/**
 * Detail sheet for a resource — mirrors the iOS info screen:
 * header, maps handoff, SERVICES chips, ABOUT, DETAILS rows, source footer.
 */
const ResourceDetail = ({ resource, onClose }) => {
  const cat = categoryOf(resource.type);
  const maps = googleMapsUrl(resource);
  const services = (resource.services || '').split(';').map((s) => s.trim()).filter(Boolean);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-top">
          <button className="sheet-done" onClick={onClose}>Done</button>
        </div>

        <div className="sheet-header">
          <span className="resource-icon resource-icon-lg" style={{ background: cat.color }}>
            <Icon name={cat.key} size={22} />
          </span>
          <div>
            <h2>{resource.name}</h2>
            {resource.organization && <div className="organization">{resource.organization}</div>}
          </div>
        </div>

        <div className="sheet-badges">
          <OpenBadge hours={resource.hours} />
          <VerifiedWarning verified={resource.verified} />
          {resource.distanceMiles != null && (
            <span className="sheet-distance">
              {resource.distanceMiles < 0.1 ? 'Less than 0.1' : resource.distanceMiles.toFixed(1)} mi away
            </span>
          )}
        </div>

        {maps && (
          <a className="sheet-maps-button" href={maps} target="_blank" rel="noopener noreferrer">
            <Icon name="directions" size={16} /> Google Maps
          </a>
        )}

        {services.length > 0 && (
          <section>
            <h4 className="sheet-section-title">Services</h4>
            <div className="service-chips">
              {services.map((s) => <span key={s} className="service-chip">{s}</span>)}
            </div>
          </section>
        )}

        {resource.description && (
          <section>
            <h4 className="sheet-section-title">About</h4>
            <p className="sheet-about">{resource.description}</p>
          </section>
        )}

        <section>
          <h4 className="sheet-section-title">Details</h4>
          <div className="detail-rows">
            {resource.address && (
              <div className="detail-row">
                <Icon name="pin" size={15} />
                <div>
                  <div className="detail-label">Address</div>
                  <div>
                    {resource.address}
                    {resource.city ? `, ${resource.city}` : ''}
                    {resource.state ? `, ${resource.state}` : ''}
                    {resource.zip_code ? `, ${resource.zip_code}` : ''}
                  </div>
                </div>
              </div>
            )}
            {resource.hours && (
              <div className="detail-row">
                <Icon name="clock" size={15} />
                <div>
                  <div className="detail-label">Hours</div>
                  <div>{resource.hours}</div>
                </div>
              </div>
            )}
            {resource.phone && (
              <div className="detail-row">
                <Icon name="phone" size={15} />
                <div>
                  <div className="detail-label">Phone</div>
                  <div><a href={`tel:${resource.phone}`}>{resource.phone}</a></div>
                </div>
              </div>
            )}
            {resource.eligibility && (
              <div className="detail-row">
                <Icon name="info" size={15} />
                <div>
                  <div className="detail-label">Who it's for</div>
                  <div>{resource.eligibility}</div>
                </div>
              </div>
            )}
          </div>
        </section>

        {!(resource.verified === true || resource.verified === 1 || resource.verified === 'TRUE') &&
          resource.verified !== undefined && resource.verified !== null && (
          <div className="sheet-warn">
            <Icon name="alert" size={15} />
            <div>
              <strong>Call before you travel.</strong> We haven't been able to confirm this
              listing's hours or address directly with the provider.
            </div>
          </div>
        )}

        <footer className="sheet-footer">
          {resource.source && <div>Source: {resource.source}</div>}
          <div>Hours and availability change often. Calling ahead saves a trip.</div>
        </footer>
      </div>
    </div>
  );
};

export default ResourceDetail;
