import React, { useState } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

const AddPostForm = () => {
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    author: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await axios.post(`${API_URL}/posts`, formData);
      alert('Post added successfully!');
      setFormData({
        title: '',
        content: '',
        author: ''
      });
      setShowForm(false);
      window.location.reload();
    } catch (error) {
      console.error('Error adding post:', error);
      alert('Error adding post. Please try again.');
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
          + Create Post
        </button>
      </div>
    );
  }

  return (
    <div className="form-container">
      <h3>Create Community Post</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Title *</label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-group">
          <label>Content *</label>
          <textarea
            name="content"
            value={formData.content}
            onChange={handleChange}
            required
            rows="4"
          />
        </div>
        <div className="form-group">
          <label>Your Name (optional)</label>
          <input
            type="text"
            name="author"
            value={formData.author}
            onChange={handleChange}
            placeholder="Leave blank for anonymous"
          />
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="submit" className="form-button" disabled={submitting}>
            {submitting ? 'Posting...' : 'Post'}
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

export default AddPostForm;

