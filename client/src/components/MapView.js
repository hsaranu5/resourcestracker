import React, { useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Icon, { iconSvgString } from '../icons';
import { categoryOf, googleMapsUrl } from '../lib';

const TILES = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
};

// Category markers in the iOS style: colored circle, white ring, SVG glyph.
// A cluster (more than one resource at the same spot) gets a count badge.
const iconCache = {};
const getIcon = (type, count = 1) => {
  const cat = categoryOf(type);
  const key = count > 1 ? `${cat.key}:${count}` : cat.key;
  if (!iconCache[key]) {
    const badge = count > 1
      ? `<span class="marker-count">${count}</span>`
      : '';
    iconCache[key] = L.divIcon({
      className: 'custom-marker',
      html: `<div class="marker-dot" style="background:${cat.color}">${iconSvgString(cat.key)}${badge}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16]
    });
  }
  return iconCache[key];
};

// Round to ~11 m so genuine same-building entries merge but distinct addresses
// don't. Mirrors the iOS PinCluster precision.
const clusterKey = (r) => `${r.latitude.toFixed(4)},${r.longitude.toFixed(4)}`;

// Collapse co-located resources into one marker each. Roughly a quarter of the
// dataset shares an address (True Light runs four programs from 717 E 31st),
// and rendered individually they stack exactly on top of each other with only
// the top one clickable — so the rest are invisible. Matches the iOS fix.
const buildClusters = (resources) => {
  const buckets = new Map();
  for (const r of resources) {
    if (r.latitude == null || r.longitude == null) continue;
    const key = clusterKey(r);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  }
  return [...buckets.values()].map((members) => ({
    id: members.map((m) => m.id).join('|'),
    lat: members[0].latitude,
    lng: members[0].longitude,
    members
  }));
};

// Picking a resource in the list flies the map to its pin AND opens the
// popup, so its contents show on the map side too. The marker may be a cluster,
// so we look it up by whichever cluster contains the selected resource.
const FlyToSelection = ({ selectedResource, markerRefs, clusterFor }) => {
  const map = useMap();
  useEffect(() => {
    if (selectedResource?.latitude != null && selectedResource?.longitude != null) {
      map.flyTo([selectedResource.latitude, selectedResource.longitude], Math.max(map.getZoom(), 14), {
        duration: 0.6
      });
      const clusterId = clusterFor(selectedResource);
      // Open once the flight lands (timeout fallback covers the "already
      // there" case where moveend never fires).
      const timer = setTimeout(() => markerRefs.current[clusterId]?.openPopup(), 650);
      return () => clearTimeout(timer);
    }
  }, [selectedResource, map, markerRefs, clusterFor]);
  return null;
};

// One resource inside a popup — shared by single pins and cluster stacks.
const PopupResource = ({ resource }) => {
  const cat = categoryOf(resource.type);
  const maps = googleMapsUrl(resource);
  const unverified = !(resource.verified === true || resource.verified === 1 || resource.verified === 'TRUE')
    && resource.verified !== undefined && resource.verified !== null;
  return (
    <div className="popup-body">
      <h3>{resource.name}</h3>
      {resource.organization && <p className="popup-org">{resource.organization}</p>}
      <span className="popup-type" style={{ background: cat.color }}>
        <Icon name={cat.key} size={11} /> {cat.label}
      </span>
      {unverified && (
        <span className="popup-warn"><Icon name="alert" size={11} /> Call first</span>
      )}
      {resource.address && <p>{resource.address}</p>}
      {resource.phone && <p><Icon name="phone" size={11} /> {resource.phone}</p>}
      {resource.hours && <p><Icon name="clock" size={11} /> {resource.hours}</p>}
      {resource.distanceMiles != null && (
        <p className="popup-distance">{resource.distanceMiles.toFixed(1)} mi away</p>
      )}
      {maps && (
        <a className="popup-directions" href={maps} target="_blank" rel="noopener noreferrer">
          <Icon name="directions" size={12} /> Directions
        </a>
      )}
    </div>
  );
};

const MapView = ({ resources, userLocation, radiusMiles, selectedResource, onResourceSelect, theme }) => {
  const center = [userLocation.latitude, userLocation.longitude];
  const markerRefs = useRef({});

  const clusters = useMemo(() => buildClusters(resources), [resources]);

  // Map a resource back to the cluster that holds it, so a list selection can
  // open the right marker.
  const clusterFor = useMemo(() => {
    const index = {};
    for (const cluster of clusters) {
      for (const member of cluster.members) index[member.id] = cluster.id;
    }
    return (resource) => index[resource?.id];
  }, [clusters]);

  return (
    <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        key={theme}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url={TILES[theme] || TILES.dark}
      />

      <FlyToSelection selectedResource={selectedResource} markerRefs={markerRefs} clusterFor={clusterFor} />

      <Circle
        center={center}
        radius={radiusMiles * 1609.34}
        pathOptions={{ color: '#4A80E8', fillColor: '#4A80E8', fillOpacity: 0.05, weight: 1 }}
      />

      {clusters.map((cluster) => {
        const lead = cluster.members[0];
        return (
          <Marker
            key={cluster.id}
            ref={(m) => { markerRefs.current[cluster.id] = m; }}
            position={[cluster.lat, cluster.lng]}
            icon={getIcon(lead.type, cluster.members.length)}
            eventHandlers={{ click: () => onResourceSelect(lead) }}
          >
            <Popup>
              {cluster.members.length > 1 && (
                <div className="popup-cluster-head">
                  {cluster.members.length} services at this location
                </div>
              )}
              <div className={cluster.members.length > 1 ? 'popup-cluster-list' : ''}>
                {cluster.members.map((member) => (
                  <PopupResource key={member.id} resource={member} />
                ))}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
};

export default MapView;
