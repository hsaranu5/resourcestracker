import React from 'react';

const ResourceList = ({ resources, onSelectResource, selectedResource }) => {
  if (resources.length === 0) {
    return (
      <div className="resource-list">
        <div className="empty-state">
          <p>No resources found</p>
          <p style={{ fontSize: '12px' }}>Try searching by zip code or address</p>
        </div>
      </div>
    );
  }

  return (
    <div className="resource-list">
      <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>
        Found {resources.length} resource{resources.length !== 1 ? 's' : ''}
      </h3>
      {resources.map((resource) => (
        <div
          key={resource.id}
          className={`resource-item ${selectedResource?.id === resource.id ? 'selected' : ''}`}
          onClick={() => onSelectResource(resource)}
        >
          <h3>{resource.name}</h3>
          {resource.organization && (
            <div className="organization">{resource.organization}</div>
          )}
          <span className="type">{resource.type}</span>
          <div className="address">{resource.address}</div>
          {resource.phone && (
            <div className="address">📞 {resource.phone}</div>
          )}
          {resource.hours && (
            <div className="address">🕐 {resource.hours}</div>
          )}
          {resource.distance !== undefined && (
            <div className="distance">{resource.distance.toFixed(1)} miles away</div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ResourceList;

