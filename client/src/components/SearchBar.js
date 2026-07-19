import React, { useState } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

const SearchBar = ({ onSearch }) => {
  const [zipCode, setZipCode] = useState('');
  const [address, setAddress] = useState('');
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const params = new URLSearchParams();
      if (zipCode) params.append('zip_code', zipCode);
      if (address) params.append('address', address);
      if (type) params.append('type', type);
      params.append('radius', '10');

      const response = await axios.get(`${API_URL}/search?${params.toString()}`);
      onSearch(response.data.results || [], response.data.searchLocation);
    } catch (error) {
      console.error('Search error:', error);
      alert('Error searching resources. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setZipCode('');
    setAddress('');
    setType('');
    onSearch([], null);
  };

  return (
    <div className="search-container">
      <form className="search-form" onSubmit={handleSearch}>
        <div className="search-input-group">
          <input
            type="text"
            placeholder="Zip Code"
            value={zipCode}
            onChange={(e) => setZipCode(e.target.value)}
          />
        </div>
        <div className="search-input-group">
          <input
            type="text"
            placeholder="Street Address (e.g., 123 Main St, Kansas City, MO)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>
        <div className="search-input-group">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            style={{ padding: '12px', border: '2px solid #e0e0e0', borderRadius: '8px', fontSize: '14px' }}
          >
            <option value="">All Types</option>
            <option value="food">Food</option>
            <option value="clothing">Clothing</option>
            <option value="shelter">Shelter</option>
            <option value="medical">Medical</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="search-input-group">
          <button type="submit" className="search-button" disabled={loading}>
            {loading ? 'Searching...' : 'Search Resources'}
          </button>
          <button type="button" className="search-button" onClick={handleClear} style={{ background: '#666' }}>
            Clear
          </button>
        </div>
      </form>
    </div>
  );
};

export default SearchBar;

