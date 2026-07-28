import React, { useState, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react';
import axios from 'axios';
import Icon from '../icons';
import { CATEGORIES, categoryOf, googleMapsUrl, haversineMiles, saveOffline, loadOffline } from '../lib';

const API_URL = process.env.REACT_APP_API_URL || '/api';

const dayLabel = (iso) => {
  const date = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const that = new Date(date);
  that.setHours(0, 0, 0, 0);
  const diffDays = Math.round((that - today) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays > 1 && diffDays < 7) return date.toLocaleDateString([], { weekday: 'long' });
  return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
};

const timeRange = (startsAt, endsAt) => {
  const fmt = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return endsAt ? `${fmt(startsAt)} – ${fmt(endsAt)}` : fmt(startsAt);
};

/**
 * Community events from verified orgs, grouped by day — pop-up pantries,
 * clinic buses, resource fairs. Reads /community/events (which the server
 * keeps mirrored in data/events.json and archives a week after they end).
 */
const EventsList = forwardRef(({ userLocation }, ref) => {
  const [events, setEvents] = useState([]);
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);

  const fetchEvents = () => {
    const to = new Date(Date.now() + 21 * 86400000).toISOString();
    axios.get(`${API_URL}/community/events`, { params: { to } })
      .then((res) => {
        const fetched = res.data.events || [];
        setEvents(fetched);
        if (userLocation) saveOffline('events', fetched, userLocation);
      })
      .catch(() => {
        // Offline: standby copy, capped to 15 mi when it was saved.
        const cached = loadOffline('events');
        if (cached) setEvents(cached.items.filter((e) => !e.endsAt || new Date(e.endsAt) > new Date()));
      })
      .finally(() => setLoading(false));
  };

  useEffect(fetchEvents, []);
  useImperativeHandle(ref, () => ({ refresh: fetchEvents }));

  const groups = useMemo(() => {
    const filtered = events.filter((e) => category === 'all' || e.category === category);
    const byDay = new Map();
    for (const event of filtered) {
      const label = dayLabel(event.startsAt);
      if (!byDay.has(label)) byDay.set(label, []);
      byDay.get(label).push(event);
    }
    return [...byDay.entries()];
  }, [events, category]);

  if (loading) {
    return <div className="empty-state"><p>Loading events...</p></div>;
  }

  return (
    <div className="events-wrap">
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

      {groups.length === 0 && (
        <div className="empty-state">
          <p>No upcoming events</p>
          <p style={{ fontSize: '12px' }}>Verified organizations post pop-up events here.</p>
        </div>
      )}

      {groups.map(([label, dayEvents]) => (
        <div key={label} className="event-day">
          <h4 className="event-day-label">{label}</h4>
          {dayEvents.map((event) => {
            const cat = categoryOf(event.category);
            const cancelled = event.status === 'cancelled';
            const maps = googleMapsUrl(event);
            const distance =
              event.latitude != null && userLocation
                ? haversineMiles(userLocation.latitude, userLocation.longitude, event.latitude, event.longitude)
                : null;
            return (
              <div key={event.id} className={`event-card ${cancelled ? 'event-cancelled' : ''}`}>
                <div className="resource-top">
                  <span className="resource-icon" style={{ background: cat.color }}>
                    <Icon name={cat.key} size={17} />
                  </span>
                  <div className="resource-titles">
                    <h3>{event.title}</h3>
                    <div className="organization">{event.organization}</div>
                  </div>
                  {distance != null && <span className="distance">{distance.toFixed(1)} mi</span>}
                </div>

                {cancelled && (
                  <div className="cancel-banner">
                    <Icon name="alert" size={13} /> Cancelled
                    {event.cancellationNote ? ` — ${event.cancellationNote}` : ''}
                  </div>
                )}

                <div className="address"><Icon name="clock" size={12} /> {timeRange(event.startsAt, event.endsAt)}</div>
                {(event.locationName || event.address) && (
                  <div className="address"><Icon name="pin" size={12} /> {event.locationName || event.address}</div>
                )}
                {event.description && <p className="event-desc">{event.description}</p>}

                <div className="card-actions">
                  {maps && !cancelled && (
                    <a className="action-primary action-green" href={maps} target="_blank" rel="noopener noreferrer">
                      <Icon name="directions" size={14} /> Directions
                    </a>
                  )}
                  {event.contactPhone && (
                    <a className="action-primary action-neutral" href={`tel:${event.contactPhone}`}>
                      <Icon name="phone" size={14} /> Call
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
});

export default EventsList;
