import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { gql } from '@apollo/client';
import { useQuery, useMutation } from '@apollo/client/react';
import Notification from './Notification';
import 'leaflet/dist/leaflet.css';
import './TimelineView.css';
import L from 'leaflet';

// Fix for default markers in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export const GET_EVENTS = gql`
  query GetEvents($before: String) {
    events(before: $before, limit: 500, offset: 0) {
      id
      occurredAt
      latitude
      longitude
      title
      description
    }
  }
`;

export const CREATE_EVENT = gql`
  mutation CreateEvent($input: CreateEventInput!) {
    createEvent(input: $input) {
      id
    }
  }
`;

export const DELETE_EVENT = gql`
  mutation DeleteEvent($id: ID!) {
    deleteEvent(id: $id)
  }
`;

export const UPDATE_EVENT = gql`
  mutation UpdateEvent($id: ID!, $input: UpdateEventInput!) {
    updateEvent(id: $id, input: $input) {
      id
      occurredAt
      latitude
      longitude
      title
      description
    }
  }
`;

function toDatetimeLocalValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

const TimelineView = ({ userRole, timeCursor, onTimeCursorChange }) => {
  const canWrite = userRole === 'admin' || userRole === 'investigator';
  const [notification, setNotification] = useState(null);

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
  };

  const { data, loading, error, refetch } = useQuery(GET_EVENTS, {
    variables: { before: timeCursor || null },
    fetchPolicy: 'cache-and-network'
  });

  const [createEvent] = useMutation(CREATE_EVENT, {
    onCompleted: () => refetch()
  });
  const [deleteEvent] = useMutation(DELETE_EVENT, {
    onCompleted: () => refetch()
  });

  const [updateEvent] = useMutation(UPDATE_EVENT, {
    onCompleted: () => refetch()
  });

  const events = useMemo(() => {
    return data?.events || [];
  }, [data?.events]);

  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newLat, setNewLat] = useState('');
  const [newLng, setNewLng] = useState('');
  const [newOccurredAt, setNewOccurredAt] = useState(() => toDatetimeLocalValue(new Date()));

  const [selectedEventId, setSelectedEventId] = useState(null);
  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return null;
    return events.find((e) => e.id === selectedEventId) || null;
  }, [events, selectedEventId]);

  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editOccurredAt, setEditOccurredAt] = useState(() => toDatetimeLocalValue(new Date()));
  const [editLat, setEditLat] = useState('');
  const [editLng, setEditLng] = useState('');

  useEffect(() => {
    if (!selectedEvent) return;
    setEditTitle(selectedEvent.title || '');
    setEditDescription(selectedEvent.description || '');
    setEditOccurredAt(selectedEvent.occurredAt ? toDatetimeLocalValue(new Date(selectedEvent.occurredAt)) : toDatetimeLocalValue(new Date()));
    setEditLat(selectedEvent.latitude != null ? String(selectedEvent.latitude) : '');
    setEditLng(selectedEvent.longitude != null ? String(selectedEvent.longitude) : '');
  }, [selectedEvent]);

  const { minTime, maxTime } = useMemo(() => {
    const timestamps = [];
    for (const ev of events) {
      if (ev.occurredAt) timestamps.push(new Date(ev.occurredAt).getTime());
    }
    if (timestamps.length === 0) return { minTime: null, maxTime: null };
    return {
      minTime: new Date(Math.min(...timestamps)),
      maxTime: new Date(Math.max(...timestamps))
    };
  }, [events]);

  useEffect(() => {
    if (!timeCursor && maxTime) {
      onTimeCursorChange(maxTime.toISOString());
    }
  }, [timeCursor, maxTime, onTimeCursorChange]);

  const currentCursorDate = timeCursor ? new Date(timeCursor) : null;
  const sliderMin = minTime ? minTime.getTime() : null;
  const sliderMax = maxTime ? maxTime.getTime() : null;
  const sliderValue = currentCursorDate ? currentCursorDate.getTime() : sliderMax;

  const filteredEventsCount = useMemo(() => {
    return events.length;
  }, [events.length]);

  const handleCursorDateChange = (value) => {
    if (!value) return;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return;
    onTimeCursorChange(date.toISOString());
  };

  const handleCreateEvent = async () => {
    if (!canWrite) return;
    if (!newTitle.trim()) {
      showNotification('Title is required', 'error');
      return;
    }

    const occurredAtDate = new Date(newOccurredAt);
    if (Number.isNaN(occurredAtDate.getTime())) {
      showNotification('Invalid occurredAt', 'error');
      return;
    }

    const latitude = newLat.trim() ? parseFloat(newLat) : null;
    const longitude = newLng.trim() ? parseFloat(newLng) : null;
    if ((latitude !== null && Number.isNaN(latitude)) || (longitude !== null && Number.isNaN(longitude))) {
      showNotification('Invalid latitude/longitude', 'error');
      return;
    }

    try {
      await createEvent({
        variables: {
          input: {
            occurredAt: occurredAtDate.toISOString(),
            latitude,
            longitude,
            title: newTitle.trim(),
            description: newDescription.trim() || null
          }
        }
      });
      setNewTitle('');
      setNewDescription('');
      setNewLat('');
      setNewLng('');
      showNotification('Event created', 'success');
    } catch (err) {
      console.error('Error creating event:', err);
      showNotification(`Failed to create event: ${err.message}`, 'error');
    }
  };

  const handleDeleteEvent = async (id) => {
    if (!canWrite) return;
    if (!window.confirm('Delete this event?')) return;
    try {
      await deleteEvent({ variables: { id } });
      showNotification('Event deleted', 'success');
    } catch (err) {
      console.error('Error deleting event:', err);
      showNotification(`Failed to delete event: ${err.message}`, 'error');
    }
  };

  const handleUpdateEvent = async () => {
    if (!canWrite) return;
    if (!selectedEventId) return;
    if (!editTitle.trim()) {
      showNotification('Title is required', 'error');
      return;
    }

    const occurredAtDate = new Date(editOccurredAt);
    if (Number.isNaN(occurredAtDate.getTime())) {
      showNotification('Invalid occurredAt', 'error');
      return;
    }

    const latitude = editLat.trim() ? parseFloat(editLat) : null;
    const longitude = editLng.trim() ? parseFloat(editLng) : null;
    if ((latitude !== null && Number.isNaN(latitude)) || (longitude !== null && Number.isNaN(longitude))) {
      showNotification('Invalid latitude/longitude', 'error');
      return;
    }

    try {
      await updateEvent({
        variables: {
          id: selectedEventId,
          input: {
            occurredAt: occurredAtDate.toISOString(),
            latitude,
            longitude,
            title: editTitle.trim(),
            description: editDescription.trim() || null
          }
        }
      });
      showNotification('Event updated', 'success');
    } catch (err) {
      console.error('Error updating event:', err);
      showNotification(`Failed to update event: ${err.message}`, 'error');
    }
  };

  const LocationPicker = ({ valueLat, valueLng, onPick }) => {
    useMapEvents({
      click(e) {
        onPick(e.latlng.lat, e.latlng.lng);
      }
    });

    if (valueLat == null || valueLng == null) return null;

    return <Marker position={[valueLat, valueLng]} />;
  };

  return (
    <div className="timeline-view">
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      <div className="timeline-header">
        <h2>Events</h2>
        <div className="timeline-summary">
          <div><strong>{filteredEventsCount}</strong> event(s)</div>
        </div>
      </div>

      <div className="timeline-controls">
        <div className="timeline-control">
          <label htmlFor="events-before">Show events up to</label>
          <input
            id="events-before"
            type="datetime-local"
            value={currentCursorDate ? toDatetimeLocalValue(currentCursorDate) : ''}
            onChange={(e) => handleCursorDateChange(e.target.value)}
          />
        </div>

        {sliderMin !== null && sliderMax !== null && sliderValue !== null && (
          <div className="timeline-control">
            <label>Scrub</label>
            <input
              type="range"
              min={sliderMin}
              max={sliderMax}
              value={sliderValue}
              onChange={(e) => onTimeCursorChange(new Date(parseInt(e.target.value, 10)).toISOString())}
            />
          </div>
        )}
      </div>

      {canWrite && (
        <div className="timeline-event-form">
          <h3>Create Event</h3>
          <div className="timeline-form-row">
            <div className="timeline-form-field">
              <label htmlFor="create-occurred-at">Occurred at</label>
              <input
                id="create-occurred-at"
                type="datetime-local"
                value={newOccurredAt}
                onChange={(e) => setNewOccurredAt(e.target.value)}
              />
            </div>
            <div className="timeline-form-field">
              <label htmlFor="create-title">Title</label>
              <input
                id="create-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Short title"
              />
            </div>
          </div>
          <div className="timeline-form-row">
            <div className="timeline-form-field">
              <label htmlFor="create-latitude">Latitude</label>
              <input
                id="create-latitude"
                value={newLat}
                onChange={(e) => setNewLat(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="timeline-form-field">
              <label htmlFor="create-longitude">Longitude</label>
              <input
                id="create-longitude"
                value={newLng}
                onChange={(e) => setNewLng(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="timeline-form-row">
            <div className="timeline-form-field full">
              <label htmlFor="create-description">Description</label>
              <input
                id="create-description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <button className="timeline-primary" onClick={handleCreateEvent}>Create</button>
        </div>
      )}

      {canWrite && selectedEvent && (
        <div className="timeline-event-form">
          <h3>Edit Event</h3>
          <div className="timeline-form-row">
            <div className="timeline-form-field">
              <label htmlFor="edit-occurred-at">Occurred at</label>
              <input
                id="edit-occurred-at"
                type="datetime-local"
                value={editOccurredAt}
                onChange={(e) => setEditOccurredAt(e.target.value)}
              />
            </div>
            <div className="timeline-form-field">
              <label htmlFor="edit-title">Title</label>
              <input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
          </div>
          <div className="timeline-form-row">
            <div className="timeline-form-field">
              <label htmlFor="edit-latitude">Latitude</label>
              <input
                id="edit-latitude"
                value={editLat}
                onChange={(e) => setEditLat(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="timeline-form-field">
              <label htmlFor="edit-longitude">Longitude</label>
              <input
                id="edit-longitude"
                value={editLng}
                onChange={(e) => setEditLng(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="timeline-form-row">
            <div className="timeline-form-field full">
              <label htmlFor="edit-description">Description</label>
              <input
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="timeline-map-picker">
            <div className="timeline-map-picker-header">
              <div className="timeline-map-picker-title">Pick location (optional)</div>
              <div className="timeline-map-picker-actions">
                <button
                  className="timeline-secondary"
                  onClick={() => {
                    setEditLat('');
                    setEditLng('');
                  }}
                >
                  Clear location
                </button>
              </div>
            </div>
            <div className="timeline-map-container">
              <MapContainer
                center={
                  editLat.trim() && editLng.trim()
                    ? [parseFloat(editLat), parseFloat(editLng)]
                    : [60.1699, 24.9384]
                }
                zoom={
                  editLat.trim() && editLng.trim()
                    ? 14
                    : 4
                }
                scrollWheelZoom={true}
                style={{ height: '220px', width: '100%' }}
              >
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <LocationPicker
                  valueLat={editLat.trim() ? parseFloat(editLat) : null}
                  valueLng={editLng.trim() ? parseFloat(editLng) : null}
                  onPick={(lat, lng) => {
                    setEditLat(String(lat));
                    setEditLng(String(lng));
                  }}
                />
              </MapContainer>
            </div>
            <div className="timeline-muted">Click the map to set latitude/longitude.</div>
          </div>

          <div className="timeline-edit-actions">
            <button className="timeline-primary" onClick={handleUpdateEvent}>Save</button>
            <button className="timeline-secondary" onClick={() => setSelectedEventId(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="timeline-events">
        <h3>Events</h3>
        {loading && <div className="timeline-muted">Loading…</div>}
        {error && <div className="timeline-error">Error: {error.message}</div>}
        {!loading && !error && events.length === 0 && (
          <div className="timeline-muted">No events yet.</div>
        )}

        {events.map((ev) => (
          <div key={ev.id} className="timeline-event-item">
            <div className="timeline-event-main">
              <div className="timeline-event-title">{ev.title}</div>
              <div className="timeline-event-meta">
                {ev.occurredAt ? new Date(ev.occurredAt).toLocaleString() : 'Unknown time'}
                {ev.latitude != null && ev.longitude != null ? ` · ${ev.latitude.toFixed(6)}, ${ev.longitude.toFixed(6)}` : ''}
              </div>
              {ev.description && <div className="timeline-event-desc">{ev.description}</div>}
            </div>
            {canWrite && (
              <div className="timeline-event-actions">
                <button
                  className="timeline-secondary"
                  onClick={() => setSelectedEventId(ev.id)}
                >
                  Edit
                </button>
                <button className="timeline-danger" onClick={() => handleDeleteEvent(ev.id)}>Delete</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TimelineView;
