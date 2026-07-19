import React, { useState } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

const AddResourceForm = ({ onResourceAdded }) => {
  const [formData, setFormData] = useState({
    name: '',
    organization: '',
    type: 'food',
    description: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    phone: '',
    website: '',
    hours: '',
    source: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const geocodeAddress = async (address) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
        {
          headers: {
            'User-Agent': 'ResourcesTracker/1.0'
          }
        }
      );
      const data = await response.json();
      if (data && data.length > 0) {
        return {
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon)
        };
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Geocode the address
      const fullAddress = `${formData.address}, ${formData.city}, ${formData.state} ${formData.zip_code}`;
      const coords = await geocodeAddress(fullAddress);

      const resourceData = {
        ...formData,
        latitude: coords?.latitude || null,
        longitude: coords?.longitude || null
      };

      await axios.post(`${API_URL}/resources`, resourceData);
      alert('Resource added successfully!');
      setFormData({
        name: '',
        organization: '',
        type: 'food',
        description: '',
        address: '',
        city: '',
        state: '',
        zip_code: '',
        phone: '',
        website: '',
        hours: '',
        source: ''
      });
      setShowForm(false);
      if (onResourceAdded) onResourceAdded();
    } catch (error) {
      console.error('Error adding resource:', error);
      alert('Error adding resource. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!showForm) {
    return (
      <div className="form-container">
        <button
          className="form-button"
          onClick={() => setShowForm(true)}
          style={{ background: '#4CAF50' }}
        >
          + Add Resource
        </button>
      </div>
    );
  }

  return (
    <div className="form-container">
      <h3>Add New Resource</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Resource Name *</label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-group">
          <label>Organization</label>
          <input
            type="text"
            name="organization"
            value={formData.organization}
            onChange={handleChange}
          />
        </div>
        <div className="form-group">
          <label>Type *</label>
          <select name="type" value={formData.type} onChange={handleChange} required>
            <option value="food">Food</option>
            <option value="clothing">Clothing</option>
            <option value="shelter">Shelter</option>
            <option value="medical">Medical</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
          />
        </div>
        <div className="form-group">
          <label>Address *</label>
          <input
            type="text"
            name="address"
            value={formData.address}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-group">
          <label>City</label>
          <input
            type="text"
            name="city"
            value={formData.city}
            onChange={handleChange}
          />
        </div>
        <div className="form-group">
          <label>State</label>
          <input
            type="text"
            name="state"
            value={formData.state}
            onChange={handleChange}
            placeholder="MO"
          />
        </div>
        <div className="form-group">
          <label>Zip Code</label>
          <input
            type="text"
            name="zip_code"
            value={formData.zip_code}
            onChange={handleChange}
          />
        </div>
        <div className="form-group">
          <label>Phone</label>
          <input
            type="text"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
          />
        </div>
        <div className="form-group">
          <label>Website</label>
          <input
            type="url"
            name="website"
            value={formData.website}
            onChange={handleChange}
          />
        </div>
        <div className="form-group">
          <label>Hours</label>
          <input
            type="text"
            name="hours"
            value={formData.hours}
            onChange={handleChange}
            placeholder="Mon-Fri 9am-5pm"
          />
        </div>
        <div className="form-group">
          <label>Source</label>
          <input
            type="text"
            name="source"
            value={formData.source}
            onChange={handleChange}
            placeholder="Uplift KC, Church, etc."
          />
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="submit" className="form-button" disabled={submitting}>
            {submitting ? 'Adding...' : 'Add Resource'}
          </button>
          <button
            type="button"
            className="form-button"
            onClick={() => setShowForm(false)}
            style={{ background: '#666' }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddResourceForm;

