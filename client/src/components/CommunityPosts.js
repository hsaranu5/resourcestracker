import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

const CommunityPosts = () => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const response = await axios.get(`${API_URL}/posts`);
      setPosts(response.data);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="posts-container">
        <div className="empty-state">
          <p>Loading posts...</p>
        </div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="posts-container">
        <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>Community Posts</h3>
        <div className="empty-state">
          <p>No posts yet</p>
          <p style={{ fontSize: '12px' }}>Be the first to share information!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="posts-container">
      <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>Community Posts</h3>
      {posts.map((post) => (
        <div key={post.id} className="post-item">
          <h4>{post.title}</h4>
          <div className="content">{post.content}</div>
          <div className="meta">
            <span>By {post.author || 'Anonymous'}</span>
            <span>{formatDate(post.created_at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CommunityPosts;

