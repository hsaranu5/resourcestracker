import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import './App.css';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import MapView, { tilesNeedDarkFilter } from './components/MapView';
import ResourceList from './components/ResourceList';
import ResourceDetail from './components/ResourceDetail';
import EventsList from './components/EventsList';
import CommunityPosts from './components/CommunityPosts';
import AddPostForm from './components/AddPostForm';
import CrisisStrip from './components/CrisisStrip';
import LocationBar from './components/LocationBar';
import Icon from './icons';
import {
  CATEGORIES, KC_CENTER, OFFLINE_RADIUS_MI,
  haversineMiles, saveOffline, loadOffline, relativeTime, buildZipCentroids
} from './lib';

const API_URL = process.env.REACT_APP_API_URL || '/api';
const RADII = [1, 3, 5, 10, 25];

function App() {
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (e) { /* storage unavailable (private mode) */ }
    return 'light';
  });
  const [activeTab, setActiveTab] = useState('map');
  // 'mini'  — results lead, the map rides above them for orientation
  // 'split' — the old side-by-side, now an explicit choice rather than the default
  const [mapMode, setMapMode] = useState('mini');
  const [sidebarWidth, setSidebarWidth] = useState(420);
  const [communityView, setCommunityView] = useState('events');
  const [resources, setResources] = useState([]);
  const [category, setCategory] = useState('all');
  const [radius, setRadius] = useState(10);
  const [query, setQuery] = useState('');
  const [userLocation, setUserLocation] = useState(KC_CENTER);
  // Where distances are measured from. 'unknown' until the visitor answers —
  // and while it is unknown we show no distances at all rather than quietly
  // measuring from downtown Kansas City and labelling it as theirs.
  const [origin, setOrigin] = useState({ kind: 'unknown' });
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [selectedForPrint, setSelectedForPrint] = useState(() => new Set());
  const [selectedResource, setSelectedResource] = useState(null);
  const [detailResource, setDetailResource] = useState(null);
  const [offlineSince, setOfflineSince] = useState(null); // savedAt of the standby copy in use
  const postsRef = useRef(null);
  const eventsRef = useRef(null);

  // Without a tile key we're on plain OSM, which has no dark style — CSS
  // darkens the tile pane instead. Flagged on the root element rather than the
  // map: react-leaflet only reads MapContainer's className at mount, so a
  // class there would never come or go with the theme.
  useEffect(() => {
    if (tilesNeedDarkFilter) document.documentElement.dataset.plainTiles = '1';
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#000000' : '#eef0f4');
    try {
      localStorage.setItem('theme', theme);
    } catch (e) { /* storage unavailable (private mode) */ }
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
  }, []);

  // Keep the offline standby copy fresh: every time we have live data and a
  // location fix, re-save the subset within OFFLINE_RADIUS_MI.
  useEffect(() => {
    if (resources.length > 0 && !offlineSince) {
      saveOffline('resources', resources, userLocation);
    }
  }, [resources, userLocation, offlineSince]);

  const zipCentroids = useMemo(() => buildZipCentroids(resources), [resources]);

  const useDeviceLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('This browser cannot share a location. Try a ZIP instead.');
      return;
    }
    setLocating(true);
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setOrigin({ kind: 'device' });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setLocationError('Location unavailable. Enter a ZIP, or skip.');
      },
      { timeout: 8000 }
    );
  };

  const useZip = (zip) => {
    const centre = zipCentroids[zip];
    if (!centre) {
      setLocationError(`No resources listed in ${zip} yet. Try a nearby ZIP, or skip.`);
      return;
    }
    setUserLocation(centre);
    setOrigin({ kind: 'zip', zip });
    setLocationError('');
  };

  const showDistance = origin.kind === 'device' || origin.kind === 'zip';

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
        // No origin means no honest radius: show everything rather than trim
        // the list against a point the visitor never chose.
        if (showDistance && r.distanceMiles != null && r.distanceMiles > radius) return false;
        if (q) {
          const haystack = [r.name, r.organization, r.services, r.description, r.zip_code, r.address]
            .filter(Boolean).join(' ').toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (!showDistance) return a.name.localeCompare(b.name);
        if (a.distanceMiles == null) return 1;
        if (b.distanceMiles == null) return -1;
        return a.distanceMiles - b.distanceMiles;
      });
  }, [withDistance, category, radius, query, showDistance]);

  // Shared computers: wipe everything this browser is holding — the standby
  // copy, the theme, the saved org email — and reload clean for the next
  // person. Most library terminals reset themselves, but not all of them do.
  const startOver = () => {
    try { localStorage.clear(); } catch (e) { /* storage unavailable */ }
    window.location.reload();
  };

  // Split mode only: drag the divider to trade list width for map width.
  // A drag needs a working mouse, so the expand/collapse buttons stay the
  // primary control and this is an extra.
  const startDividerDrag = (event) => {
    event.preventDefault();
    const move = (e) => {
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      setSidebarWidth(Math.min(Math.max(x, 320), window.innerWidth - 280));
    };
    const stop = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', stop);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
    window.addEventListener('touchmove', move);
    window.addEventListener('touchend', stop);
  };

  // Search leads: it is the highest-intent control, and it used to sit third,
  // below two rows of filters. The chips wrap rather than scroll — five of the
  // nine categories, Crisis among them, used to be off-screen at every width.
  const findControls = (
    <div className="find-controls">
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

      {/* A radius is meaningless without an origin, so it only appears once
          there is one. */}
      <div className="radius-row">
        {showDistance && (
          <>
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
          </>
        )}
        {/* Settled, this is a short label and rides on the same line as the
            count. Unanswered, it is a question with three buttons and wraps
            onto its own. */}
        <LocationBar
          origin={origin}
          busy={locating}
          error={locationError}
          onUseDevice={useDeviceLocation}
          onUseZip={useZip}
          onSkip={() => { setOrigin({ kind: 'skipped' }); setLocationError(''); }}
          onReset={() => { setOrigin({ kind: 'unknown' }); setLocationError(''); }}
        />

        <span className="found-count">
          {filtered.length} found
          {selectedForPrint.size > 0 && ` · ${selectedForPrint.size} ticked`}
        </span>
      </div>
    </div>
  );

  const togglePrint = (id) => {
    setSelectedForPrint((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const resourceList = (
    <ResourceList
      resources={filtered}
      onSelectResource={setSelectedResource}
      selectedResource={selectedResource}
      onShowDetail={setDetailResource}
      showDistance={showDistance}
      selectedForPrint={selectedForPrint}
      onTogglePrint={togglePrint}
    />
  );

  const renderMap = (compact) => (
    <MapView
      resources={filtered}
      userLocation={userLocation}
      radiusMiles={radius}
      selectedResource={selectedResource}
      onResourceSelect={setSelectedResource}
      theme={theme}
      compact={compact}
    />
  );

  const offlineBanner = offlineSince ? (
    <div className="offline-banner">
      <Icon name="alert" size={13} /> Offline — showing saved data within {OFFLINE_RADIUS_MI} mi
      (saved {relativeTime(offlineSince)})
    </div>
  ) : null;

  return (
    <div className="App">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        onStartOver={startOver}
      />

      {/* Above the tabs and outside every filter: whichever section you are
          in, these numbers are on screen. */}
      <CrisisStrip resources={resources} />

      {activeTab === 'map' && mapMode === 'mini' && (
        <main className="find-column">
          {offlineBanner}
          {/* Controls and map share one sticky head. Stacking the map above
              the controls pushed the first result to 559px on a 768px-tall
              terminal — one card visible. Side by side it costs ~210px total
              and stays on screen while you scroll, which is what an
              orientation map is for. Below 900px this stacks and scrolls. */}
          <div className="find-head">
            {findControls}
            <div className="minimap">
              {renderMap(true)}
              <button className="map-mode-toggle" onClick={() => setMapMode('split')}>
                <Icon name="expand" size={14} /> Expand map
              </button>
            </div>
          </div>
          {resourceList}
        </main>
      )}

      {activeTab === 'map' && mapMode === 'split' && (
        <div className="main-container">
          <div className="sidebar" style={{ width: sidebarWidth }}>
            {offlineBanner}
            {findControls}
            {resourceList}
          </div>
          <div
            className="divider"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the list and map"
            onMouseDown={startDividerDrag}
            onTouchStart={startDividerDrag}
          />
          <div className="map-container">
            {renderMap(false)}
            <button className="map-mode-toggle" onClick={() => setMapMode('mini')}>
              <Icon name="collapse" size={14} /> Back to list
            </button>
          </div>
        </div>
      )}

      {activeTab === 'community' && (
        <main className="find-column">
          {offlineBanner}
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
        </main>
      )}

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      {detailResource && (
        <ResourceDetail resource={detailResource} onClose={() => setDetailResource(null)} />
      )}
    </div>
  );
}

export default App;
