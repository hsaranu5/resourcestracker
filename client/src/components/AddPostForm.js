import React, { useState, useEffect } from 'react';
import axios from 'axios';
import OrgAuth from './OrgAuth';
import { CATEGORIES } from '../lib';

const API_URL = process.env.REACT_APP_API_URL || '/api';

// Two types, both about whether a trip is worth making.
//
// 'Need' is gone: an organisation asking for volunteers and donations is
// talking to donors, not to someone looking for a shower, and it does not
// belong in a feed the latter reads. 'Update' is gone too — a catch-all that
// absorbs everything eventually absorbs the closures, which are the one thing
// here no street sheet or website can give someone: what changed today.
const POST_TYPES = [
  { value: 'closure', label: 'Closure', hint: 'A service or location people rely on is closed or suspended. Saves someone the trip.' },
  { value: 'alert',   label: 'Alert',   hint: 'Urgent and time-sensitive — weather, safety, big changes. Shown prominently.' }
];

const EMPTY_POST = { title: '', content: '', category: 'closure' };
const EMPTY_EVENT = {
  title: '', description: '', category: 'food', locationName: '',
  address: '', startsAt: '', endsAt: '', contactPhone: ''
};

/**
 * Community publisher, gated to verified organisations. Signed-in orgs can
 * share either a post (update/alert/closure/need) or an event (a cookout,
 * pop-up pantry, clinic bus...). Attribution always comes from the server's
 * allowlist, never from the form.
 */
const AddPostForm = ({ onPostAdded, onEventAdded }) => {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState('post'); // 'post' | 'event'
  const [post, setPost] = useState(EMPTY_POST);
  const [event, setEvent] = useState(EMPTY_EVENT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`${API_URL}/auth/me`)
      .then((res) => setSession(res.data))
      .catch(() => setSession(null))
      .finally(() => setChecking(false));
  }, []);

  const signOut = async () => {
    try { await axios.post(`${API_URL}/auth/logout`); } catch (e) { /* already gone */ }
    setSession(null);
    setShowForm(false);
  };

  const handleAuthError = (err) => {
    if (err.response?.status === 401) {
      setSession(null);
      setError('Your session expired. Sign in again to post.');
    } else {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    }
  };

  const submitPost = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await axios.post(`${API_URL}/community/posts`, post);
      setPost(EMPTY_POST);
      setShowForm(false);
      if (onPostAdded) onPostAdded();
    } catch (err) {
      handleAuthError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const submitEvent = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await axios.post(`${API_URL}/community/events`, {
        ...event,
        startsAt: new Date(event.startsAt).toISOString(),
        endsAt: event.endsAt ? new Date(event.endsAt).toISOString() : undefined
      });
      setEvent(EMPTY_EVENT);
      setShowForm(false);
      if (onEventAdded) onEventAdded();
    } catch (err) {
      handleAuthError(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) return null;

  if (!session) {
    if (showAuth) {
      return (
        <OrgAuth
          onSignedIn={(s) => { setSession(s); setShowAuth(false); setShowForm(true); }}
          onCancel={() => setShowAuth(false)}
        />
      );
    }
    return (
      <div className="form-container">
        {error && <p style={{ color: '#e57373', fontSize: '13px' }}>{error}</p>}
        <button className="form-button" onClick={() => setShowAuth(true)} style={{ background: '#3BA55C' }}>
          Post as an organization
        </button>
        <p style={{ fontSize: '11px', color: '#8a9099', marginTop: '6px' }}>
          For outreach organizations verified by Care Beyond
        </p>
      </div>
    );
  }

  if (!showForm) {
    return (
      <div className="form-container">
        <button className="form-button" onClick={() => setShowForm(true)} style={{ background: '#3BA55C' }}>
          + Share a post or event
        </button>
        <p style={{ fontSize: '12px', color: '#9aa0a6', marginTop: '6px' }}>
          Signed in as <strong>{session.organization}</strong>
          {' · '}
          <button
            onClick={signOut}
            style={{ background: 'none', border: 'none', color: '#4a80e8', cursor: 'pointer', padding: 0, fontSize: '12px' }}
          >
            Sign out
          </button>
        </p>
      </div>
    );
  }

  const selectedType = POST_TYPES.find((t) => t.value === post.category);

  return (
    <div className="form-container">
      <p style={{ fontSize: '12px', color: '#9aa0a6', margin: '0 0 10px' }}>
        Publishing as <strong>{session.organization}</strong>
      </p>

      <div className="segmented" style={{ margin: '0 0 14px' }}>
        <button type="button" className={kind === 'post' ? 'active' : ''} onClick={() => setKind('post')}>
          Post
        </button>
        <button type="button" className={kind === 'event' ? 'active' : ''} onClick={() => setKind('event')}>
          Event
        </button>
      </div>

      {kind === 'post' ? (
        <form onSubmit={submitPost}>
          <div className="form-group">
            <label>Type</label>
            <select
              value={post.category}
              onChange={(e) => setPost({ ...post, category: e.target.value })}
            >
              {POST_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            {selectedType && (
              <p style={{ fontSize: '12px', color: '#9aa0a6', margin: '5px 0 0' }}>{selectedType.hint}</p>
            )}
          </div>
          <div className="form-group">
            <label>Title *</label>
            <input
              type="text"
              value={post.title}
              onChange={(e) => setPost({ ...post, title: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Content *</label>
            <textarea
              value={post.content}
              onChange={(e) => setPost({ ...post, content: e.target.value })}
              required
              rows="4"
            />
          </div>
          <p style={{ fontSize: '11px', color: '#8a9099', margin: '0 0 10px' }}>
            Posts stay up for one week, then archive automatically.
          </p>
          {error && <p style={{ color: '#e57373', fontSize: '13px' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="submit" className="form-button" disabled={submitting}>
              {submitting ? 'Posting...' : 'Post'}
            </button>
            <button type="button" className="form-button" onClick={() => setShowForm(false)} style={{ background: '#666' }}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={submitEvent}>
          <div className="form-group">
            <label>Event title *</label>
            <input
              type="text"
              value={event.title}
              placeholder="Community cookout, pop-up pantry..."
              onChange={(e) => setEvent({ ...event, title: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Category</label>
            <select
              value={event.category}
              onChange={(e) => setEvent({ ...event, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Starts *</label>
            <input
              type="datetime-local"
              value={event.startsAt}
              onChange={(e) => setEvent({ ...event, startsAt: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Ends</label>
            <input
              type="datetime-local"
              value={event.endsAt}
              min={event.startsAt || undefined}
              onChange={(e) => setEvent({ ...event, endsAt: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Location name</label>
            <input
              type="text"
              value={event.locationName}
              placeholder="Gillham Park, St. Paul's Church..."
              onChange={(e) => setEvent({ ...event, locationName: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Address</label>
            <input
              type="text"
              value={event.address}
              placeholder="Street address (for the Directions button)"
              onChange={(e) => setEvent({ ...event, address: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Contact phone</label>
            <input
              type="tel"
              value={event.contactPhone}
              onChange={(e) => setEvent({ ...event, contactPhone: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={event.description}
              placeholder="What should people know? Who is it for?"
              onChange={(e) => setEvent({ ...event, description: e.target.value })}
              rows="3"
            />
          </div>
          <p style={{ fontSize: '11px', color: '#8a9099', margin: '0 0 10px' }}>
            Events archive automatically one week after they end.
          </p>
          {error && <p style={{ color: '#e57373', fontSize: '13px' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="submit" className="form-button" disabled={submitting}>
              {submitting ? 'Publishing...' : 'Publish event'}
            </button>
            <button type="button" className="form-button" onClick={() => setShowForm(false)} style={{ background: '#666' }}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default AddPostForm;
