import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const MapView = ({ resources, searchLocation, selectedResource, onResourceSelect }) => {
  const defaultCenter = [39.0997, -94.5786]; // Kansas City, MO
  const defaultZoom = 11;

  const getCenter = () => {
    if (searchLocation) {
      return [searchLocation.latitude, searchLocation.longitude];
    }
    if (resources.length > 0 && resources[0].latitude && resources[0].longitude) {
      return [resources[0].latitude, resources[0].longitude];
    }
    return defaultCenter;
  };

  const getIcon = (resource) => {
    const colors = {
      food: '#4CAF50',
      clothing: '#FF9800',
      shelter: '#2196F3',
      medical: '#F44336',
      other: '#9E9E9E'
    };

    return L.divIcon({
      className: 'custom-marker',
      html: `<div style="
        background-color: ${colors[resource.type] || colors.other};
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      "></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
  };

  return (
    <MapContainer
      center={getCenter()}
      zoom={defaultZoom}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {searchLocation && (
        <Circle
          center={[searchLocation.latitude, searchLocation.longitude]}
          radius={16093.4} // 10 miles in meters
          pathOptions={{ color: '#2196F3', fillColor: '#2196F3', fillOpacity: 0.1 }}
        />
      )}

      {resources.map((resource) => {
        if (!resource.latitude || !resource.longitude) return null;
        
        return (
          <Marker
            key={resource.id}
            position={[resource.latitude, resource.longitude]}
            icon={getIcon(resource)}
            eventHandlers={{
              click: () => onResourceSelect(resource)
            }}
          >
            <Popup>
              <div style={{ minWidth: '200px' }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>{resource.name}</h3>
                {resource.organization && (
                  <p style={{ margin: '0 0 5px 0', color: '#666', fontSize: '13px' }}>
                    {resource.organization}
                  </p>
                )}
                <span style={{
                  display: 'inline-block',
                  background: '#667eea',
                  color: 'white',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontSize: '11px',
                  marginBottom: '8px'
                }}>
                  {resource.type}
                </span>
                <p style={{ margin: '5px 0', fontSize: '13px' }}>{resource.address}</p>
                {resource.phone && (
                  <p style={{ margin: '5px 0', fontSize: '13px' }}>📞 {resource.phone}</p>
                )}
                {resource.hours && (
                  <p style={{ margin: '5px 0', fontSize: '13px' }}>🕐 {resource.hours}</p>
                )}
                {resource.distance && (
                  <p style={{ margin: '5px 0', color: '#2196F3', fontSize: '12px', fontWeight: '500' }}>
                    {resource.distance.toFixed(1)} miles away
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
};

export default MapView;

