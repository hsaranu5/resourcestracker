import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import Header from './components/Header';
import MapView from './components/MapView';
import ResourceList from './components/ResourceList';
import CommunityPosts from './components/CommunityPosts';
import SearchBar from './components/SearchBar';
import AddResourceForm from './components/AddResourceForm';
import AddPostForm from './components/AddPostForm';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

function App() {
  const [activeTab, setActiveTab] = useState('map');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLocation, setSearchLocation] = useState(null);
  const [selectedResource, setSelectedResource] = useState(null);

  // Load all resources on initial page load
  useEffect(() => {
    const loadAllResources = async () => {
      try {
        const response = await axios.get(`${API_URL}/resources`);
        setSearchResults(response.data || []);
      } catch (error) {
        console.error('Error loading resources:', error);
      }
    };
    loadAllResources();
  }, []);

  return (
    <div className="App">
      <Header />
      <div className="main-container">
        <div className="sidebar">
          <div className="tabs">
            <button
              className={activeTab === 'map' ? 'active' : ''}
              onClick={() => setActiveTab('map')}
            >
              Map View
            </button>
            <button
              className={activeTab === 'community' ? 'active' : ''}
              onClick={() => setActiveTab('community')}
            >
              Community
            </button>
          </div>

          <SearchBar
            onSearch={(results, location) => {
              setSearchResults(results);
              setSearchLocation(location);
            }}
          />

          {activeTab === 'map' && (
            <>
              <ResourceList
                resources={searchResults}
                onSelectResource={setSelectedResource}
                selectedResource={selectedResource}
              />
              <AddResourceForm onResourceAdded={async () => {
                try {
                  const response = await axios.get(`${API_URL}/resources`);
                  setSearchResults(response.data || []);
                } catch (error) {
                  console.error('Error reloading resources:', error);
                }
              }} />
            </>
          )}

          {activeTab === 'community' && (
            <>
              <CommunityPosts />
              <AddPostForm />
            </>
          )}
        </div>

        <div className="map-container">
          <MapView
            resources={searchResults}
            searchLocation={searchLocation}
            selectedResource={selectedResource}
            onResourceSelect={setSelectedResource}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
