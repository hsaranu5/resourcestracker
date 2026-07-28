import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import axios from 'axios';
import Icon from '../icons';
import { POST_CATEGORIES, relativeTime, saveOffline, loadOffline, KC_CENTER } from '../lib';

const API_URL = process.env.REACT_APP_API_URL || '/api';

/**
 * Verified community feed (/community/posts): org-authored, pinned-first,
 * expired posts filtered server-side (and archived to /data a week out).
 */
const CommunityPosts = forwardRef((props, ref) => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchPosts = async () => {
    try {
      const response = await axios.get(`${API_URL}/community/posts`);
      const fetched = response.data.posts || [];
      setPosts(fetched);
      // Posts have no coordinates, so the standby copy is the whole feed.
      saveOffline('posts', fetched, KC_CENTER);
    } catch (error) {
      const cached = loadOffline('posts');
      if (cached) {
        setPosts(cached.items.filter((p) => !p.expiresAt || new Date(p.expiresAt) > new Date()));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  useImperativeHandle(ref, () => ({ refresh: fetchPosts }));

  if (loading) {
    return (
      <div className="posts-container">
        <div className="empty-state"><p>Loading posts...</p></div>
      </div>
    );
  }

  return (
    <div className="posts-container">
      {posts.length === 0 ? (
        <div className="empty-state">
          <p>No posts yet</p>
          <p style={{ fontSize: '12px' }}>Updates from verified organizations will appear here.</p>
        </div>
      ) : (
        posts.map((post) => {
          const cat = POST_CATEGORIES[post.category] || POST_CATEGORIES.update;
          return (
            <div key={post.id} className="post-item">
              <div className="post-head">
                {post.pinned && (
                  <span className="post-pin" title="Pinned"><Icon name="pinned" size={13} /></span>
                )}
                <span
                  className="post-cat"
                  style={{ color: cat.color, background: `${cat.color}22` }}
                >
                  <Icon name={cat.icon} size={12} /> {cat.label}
                </span>
                <span className="post-time">{relativeTime(post.createdAt)}</span>
              </div>
              <h4>{post.title}</h4>
              <div className="content">{post.content}</div>
              <div className="meta">Posted by {post.organization}</div>
            </div>
          );
        })
      )}
    </div>
  );
});

export default CommunityPosts;
