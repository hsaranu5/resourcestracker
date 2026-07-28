import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import './App.css';
import Header from './components/Header';
import MapView from './components/MapView';
import ResourceList from './components/ResourceList';
import ResourceDetail from './components/ResourceDetail';
import EventsList from './components/EventsList';
import CommunityPosts from './components/CommunityPosts';
import AddPostForm from './components/AddPostForm';
import Icon from './icons';
import {
  CATEGORIES, KC_CENTER, OFFLINE_RADIUS_MI,
  haversineMiles, saveOffline, loadOffline, relativeTime
} from './lib';

const API_URL = process.env.REACT_APP_API_URL || '/api';
const RADII = [1, 3, 5, 10, 25];

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [activeTab, setActiveTab] = useState('map');
  const [communityView, setCommunityView] = useState('events');
  const [resources, setResources] = useState([]);
  const [category, setCategory] = useState('all');
  const [radius, setRadius] = useState(10);
  const [query, setQuery] = useState('');
  const [userLocation, setUserLocation] = useState(KC_CENTER);
  const [selectedResource, setSelectedResource] = useState(null);
  const [detailResource, setDetailResource] = useState(null);
  const [offlineSince, setOfflineSince] = useState(null); // savedAt of the standby copy in use
  const postsRef = useRef(null);
  const eventsRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    axios.get(`${API_URL}/resources`)
      .then((res) => {
        setResources(res.data || []);
        setOfflineSince(null);
      })
      .catch(() => {
        // Server unreachable: fall back to the standby copy (saved within
        // 15 mi of wherever the user last was).
        const cached = loadOffline('resources');
        if (cached) {
          setResources(cached.items);
          setOfflineSince(cached.savedAt);
        }
      });

    // Center on the visitor if they allow it; Kansas City otherwise.
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => {},
        { timeout: 5000 }
      );
    }
  }, []);

  // Keep the offline standby copy fresh: every time we have live data and a
  // location fix, re-save the subset within OFFLINE_RADIUS_MI.
  useEffect(() => {
    if (resources.length > 0 && !offlineSince) {
      saveOffline('resources', resources, userLocation);
    }
  }, [resources, userLocation, offlineSince]);

  const withDistance = useMemo(
    () =>
      resources.map((r) => ({
        ...r,
        distanceMiles:
          r.latitude != null && r.longitude != null
            ? haversineMiles(userLocation.latitude, userLocation.longitude, r.latitude, r.longitude)
            : null
      })),
    [resources, userLocation]
  );

  // Out-of-range locations are hidden until the radius is widened — what's
  // walkable/drivable comes first. Phone/text lines (no location) always stay.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return withDistance
      .filter((r) => {
        if (category !== 'all' && r.type !== category) return false;
        if (r.distanceMiles != null && r.distanceMiles > radius) return false;
        if (q) {
          const haystack = [r.name, r.organization, r.services, r.description, r.zip_code, r.address]
            .filter(Boolean).join(' ').toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.distanceMiles == null) return 1;
        if (b.distanceMiles == null) return -1;
        return a.distanceMiles - b.distanceMiles;
      });
  }, [withDistance, category, radius, query]);

  return (
    <div className="App">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      />

      <div className="main-container">
        <div className="sidebar">
          {offlineSince && (
            <div className="offline-banner">
              <Icon name="alert" size={13} /> Offline — showing saved data within {OFFLINE_RADIUS_MI} mi
              (saved {relativeTime(offlineSince)})
            </div>
          )}
          {activeTab === 'map' && (
            <>
              <div className="chip-row">
                <button
                  className={`chip ${category === 'all' ? 'chip-active' : ''}`}
                  onClick={() => setCategory('all')}
                >
                  <Icon name="grid" size={13} /> All
                </button>
                {CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    className={`chip ${category === c.key ? 'chip-active' : ''}`}
                    style={category === c.key ? { background: c.color, borderColor: c.color, color: '#fff' } : undefined}
                    onClick={() => setCategory(category === c.key ? 'all' : c.key)}
                  >
                    <Icon name={c.key} size={13} /> {c.label}
                  </button>
                ))}
              </div>

              <div className="radius-row">
                <span className="radius-label">Within</span>
                <div className="radius-pills">
                  {RADII.map((mi) => (
                    <button
                      key={mi}
                      className={`radius-pill ${radius === mi ? 'radius-active' : ''}`}
                      onClick={() => setRadius(mi)}
                    >
                      {mi} mi
                    </button>
                  ))}
                </div>
                <span className="found-count">{filtered.length} found</span>
              </div>

              <div className="search-row">
                <Icon name="search" size={14} className="search-glyph" />
                <input
                  className="search-input"
                  type="search"
                  placeholder="Search name, service, or ZIP"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              <ResourceList
                resources={filtered}
                onSelectResource={setSelectedResource}
                selectedResource={selectedResource}
                onShowDetail={setDetailResource}
              />
            </>
          )}

          {activeTab === 'community' && (
            <>
              <div className="segmented">
                <button
                  className={communityView === 'events' ? 'active' : ''}
                  onClick={() => setCommunityView('events')}
                >
                  Events
                </button>
                <button
                  className={communityView === 'posts' ? 'active' : ''}
                  onClick={() => setCommunityView('posts')}
                >
                  Posts
                </button>
              </div>
              <p className="community-note">
                <Icon name="calendar" size={13} /> Schedules published in the Street Sheet.
                Call ahead — times can change.
              </p>

              {communityView === 'events' ? (
                <EventsList ref={eventsRef} userLocation={userLocation} />
              ) : (
                <CommunityPosts ref={postsRef} />
              )}

              <AddPostForm
                onPostAdded={() => { setCommunityView('posts'); postsRef.current?.refresh(); }}
                onEventAdded={() => { setCommunityView('events'); eventsRef.current?.refresh(); }}
              />
            </>
          )}
        </div>

        <div className="map-container">
          <MapView
            resources={filtered}
            userLocation={userLocation}
            radiusMiles={radius}
            selectedResource={selectedResource}
            onResourceSelect={setSelectedResource}
            theme={theme}
          />
        </div>
      </div>

      {detailResource && (
        <ResourceDetail resource={detailResource} onClose={() => setDetailResource(null)} />
      )}
    </div>
  );
}

export default App;
