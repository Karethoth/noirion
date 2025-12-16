import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { useQuery, useMutation } from '@apollo/client/react';
import Notification from './Notification';
import EntitySearch from './EntitySearch';
import 'leaflet/dist/leaflet.css';
import './TimelineView.css';
import L from 'leaflet';
import { GET_EVENTS, CREATE_EVENT, DELETE_EVENT, UPDATE_EVENT } from '../graphql/events';
import { GET_PRESENCES } from '../graphql/presences';
import { formatMGRS, parseMGRS } from '../utils/coordinates';

// Fix for default markers in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export { GET_EVENTS, CREATE_EVENT, DELETE_EVENT, UPDATE_EVENT };
export { GET_PRESENCES };

// Mirror the Map tab basemap configuration
const MAP_STYLES = {
  day: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },
  night: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri'
  }
};

function MapStyleController({ style }) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    container.classList.remove('map-style-day', 'map-style-night', 'map-style-satellite');
    if (style && style !== 'day') {
      container.classList.add(`map-style-${style}`);
    }
  }, [style, map]);

  return null;
}

function getSavedMapView() {
  try {
    const raw = localStorage.getItem('mapView');
    if (!raw) return null;
    const view = JSON.parse(raw);
    if (!view?.center || typeof view?.zoom !== 'number') return null;
    if (typeof view.center.lat !== 'number' || typeof view.center.lng !== 'number') return null;
    return view;
  } catch {
    return null;
  }
}

function toDatetimeLocalValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

const TimelineView = ({
  userRole,
  timeCursor,
  onTimeCursorChange,
  timeStart,
  onTimeStartChange,
  ignoreTimeFilter = { events: false, presences: false, images: false },
  onIgnoreTimeFilterChange,
}) => {
  const canWrite = userRole === 'admin' || userRole === 'investigator';
  const [notification, setNotification] = useState(null);
  const [isCreateLocationModalOpen, setIsCreateLocationModalOpen] = useState(false);
  const [isEditLocationModalOpen, setIsEditLocationModalOpen] = useState(false);
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);
  const [filterEntity, setFilterEntity] = useState(null); // { id, displayName, ... }
  const [filterTagsRaw, setFilterTagsRaw] = useState('');
  const mapStyle = useMemo(() => {
    return localStorage.getItem('mapStyle') || 'day';
  }, []);

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
  };

  const eventsVariables = useMemo(() => {
    if (ignoreTimeFilter?.events) return { before: null, after: null };
    return { before: timeCursor || null, after: timeStart || null };
  }, [ignoreTimeFilter?.events, timeCursor, timeStart]);

  const presencesVariables = useMemo(() => {
    if (ignoreTimeFilter?.presences) return { before: null, after: null };
    return { before: timeCursor || null, after: timeStart || null };
  }, [ignoreTimeFilter?.presences, timeCursor, timeStart]);

  const { data, loading, error, refetch } = useQuery(GET_EVENTS, {
    variables: eventsVariables,
    fetchPolicy: 'cache-and-network'
  });

  const {
    data: presencesData,
    loading: presencesLoading,
    error: presencesError,
  } = useQuery(GET_PRESENCES, {
    variables: presencesVariables,
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

  const presences = useMemo(() => {
    return presencesData?.presences || [];
  }, [presencesData?.presences]);

  const timelineItems = useMemo(() => {
    const items = [];
    for (const ev of events) {
      items.push({
        kind: 'event',
        id: `event:${ev.id}`,
        timestamp: ev.occurredAt,
        event: ev,
      });
    }
    for (const pr of presences) {
      items.push({
        kind: 'presence',
        id: `presence:${pr.id}`,
        timestamp: pr.observedAt,
        presence: pr,
      });
    }

    items.sort((a, b) => {
      const at = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bt = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return bt - at;
    });
    return items;
  }, [events, presences]);

  const filterTagTokens = useMemo(() => {
    return (filterTagsRaw || '')
      .split(/[\s,]+/g)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => x.toLowerCase());
  }, [filterTagsRaw]);

  const filteredTimelineItems = useMemo(() => {
    const entityId = filterEntity?.id || null;

    return timelineItems.filter((item) => {
      const linkedEntities =
        item.kind === 'event'
          ? item.event?.entities || []
          : item.presence?.entities || [];

      if (entityId) {
        const hasEntity = linkedEntities.some((x) => x?.entityId === entityId || x?.entity?.id === entityId);
        if (!hasEntity) return false;
      }

      if (filterTagTokens.length > 0) {
        const tags = linkedEntities
          .flatMap((x) => x?.entity?.tags || [])
          .filter(Boolean)
          .map((t) => String(t).toLowerCase());
        const matches = filterTagTokens.some((needle) => tags.some((tag) => tag.includes(needle)));
        if (!matches) return false;
      }

      return true;
    });
  }, [timelineItems, filterEntity?.id, filterTagTokens]);

  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newLat, setNewLat] = useState('');
  const [newLng, setNewLng] = useState('');
  const [newMGRS, setNewMGRS] = useState('');
  const [newOccurredAt, setNewOccurredAt] = useState(() => toDatetimeLocalValue(new Date()));
  const [newLinkedEntities, setNewLinkedEntities] = useState([]); // [{ entityId, entity }]

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
  const [editMGRS, setEditMGRS] = useState('');
  const [editLinkedEntities, setEditLinkedEntities] = useState([]); // [{ entityId, entity }]

  useEffect(() => {
    if (!selectedEvent) return;
    setEditTitle(selectedEvent.title || '');
    setEditDescription(selectedEvent.description || '');
    setEditOccurredAt(selectedEvent.occurredAt ? toDatetimeLocalValue(new Date(selectedEvent.occurredAt)) : toDatetimeLocalValue(new Date()));
    setEditLat(selectedEvent.latitude != null ? String(selectedEvent.latitude) : '');
    setEditLng(selectedEvent.longitude != null ? String(selectedEvent.longitude) : '');
    if (selectedEvent.latitude != null && selectedEvent.longitude != null) {
      setEditMGRS(formatMGRS(selectedEvent.longitude, selectedEvent.latitude));
    } else {
      setEditMGRS('');
    }
    const linked = (selectedEvent.entities || []).map((ee) => ({
      entityId: ee.entityId,
      entity: ee.entity || null,
      role: ee.role || null,
      confidence: ee.confidence ?? null,
    }));
    setEditLinkedEntities(linked);
  }, [selectedEvent]);

  const addUniqueLinkedEntity = (setFn) => (entity) => {
    if (!entity?.id) return;
    setFn((prev) => {
      if (prev.some((x) => x.entityId === entity.id)) return prev;
      return [...prev, { entityId: entity.id, entity }];
    });
  };

  const removeLinkedEntity = (setFn, entityId) => {
    setFn((prev) => prev.filter((x) => x.entityId !== entityId));
  };

  const { minTime, maxTime } = useMemo(() => {
    const timestamps = [];
    for (const item of timelineItems) {
      if (!item.timestamp) continue;
      const t = new Date(item.timestamp).getTime();
      if (!Number.isNaN(t)) timestamps.push(t);
    }
    if (timestamps.length === 0) return { minTime: null, maxTime: null };
    return {
      minTime: new Date(Math.min(...timestamps)),
      maxTime: new Date(Math.max(...timestamps))
    };
  }, [timelineItems]);

  useEffect(() => {
    if (!timeCursor && maxTime) {
      onTimeCursorChange(maxTime.toISOString());
    }
  }, [timeCursor, maxTime, onTimeCursorChange]);

  const currentStartDate = timeStart ? new Date(timeStart) : null;
  const currentCursorDate = timeCursor ? new Date(timeCursor) : null;

  const summaryCounts = useMemo(() => {
    let eventsCount = 0;
    let presencesCount = 0;
    for (const item of filteredTimelineItems) {
      if (item.kind === 'event') eventsCount += 1;
      if (item.kind === 'presence') presencesCount += 1;
    }
    return {
      events: eventsCount,
      presences: presencesCount,
      total: filteredTimelineItems.length,
    };
  }, [filteredTimelineItems]);

  const handleCursorDateChange = (value) => {
    if (!value) {
      onTimeCursorChange(null);
      return;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return;
    const nextIso = date.toISOString();
    if (timeStart) {
      const startMs = new Date(timeStart).getTime();
      const endMs = date.getTime();
      if (!Number.isNaN(startMs) && endMs < startMs) {
        onTimeStartChange?.(nextIso);
      }
    }
    onTimeCursorChange(nextIso);
  };

  const handleStartDateChange = (value) => {
    if (!value) {
      onTimeStartChange?.(null);
      return;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return;
    const nextIso = date.toISOString();
    if (timeCursor) {
      const startMs = date.getTime();
      const endMs = new Date(timeCursor).getTime();
      if (!Number.isNaN(endMs) && startMs > endMs) {
        onTimeCursorChange?.(nextIso);
      }
    }
    onTimeStartChange?.(nextIso);
  };

  const setIgnoreTimeFilter = (patch) => {
    if (!onIgnoreTimeFilterChange) return;
    onIgnoreTimeFilterChange({
      events: !!patch?.events,
      presences: !!patch?.presences,
      images: !!patch?.images,
    });
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

    let latitude = newLat.trim() ? parseFloat(newLat) : null;
    let longitude = newLng.trim() ? parseFloat(newLng) : null;
    if ((latitude !== null && Number.isNaN(latitude)) || (longitude !== null && Number.isNaN(longitude))) {
      latitude = null;
      longitude = null;
    }
    if ((latitude == null || longitude == null) && newMGRS.trim()) {
      const parsed = parseMGRS(newMGRS);
      if (!parsed) {
        showNotification('Invalid MGRS coordinate', 'error');
        return;
      }
      latitude = parsed.latitude;
      longitude = parsed.longitude;
      setNewLat(String(latitude));
      setNewLng(String(longitude));
    }

    try {
      await createEvent({
        variables: {
          input: {
            occurredAt: occurredAtDate.toISOString(),
            latitude,
            longitude,
            title: newTitle.trim(),
            description: newDescription.trim() || null,
            entities: newLinkedEntities.map((x) => ({
              entityId: x.entityId,
              role: x.role || null,
              confidence: x.confidence ?? null,
            }))
          }
        }
      });
      setNewTitle('');
      setNewDescription('');
      setNewLat('');
      setNewLng('');
      setNewMGRS('');
      setNewLinkedEntities([]);
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

    let latitude = editLat.trim() ? parseFloat(editLat) : null;
    let longitude = editLng.trim() ? parseFloat(editLng) : null;
    if ((latitude !== null && Number.isNaN(latitude)) || (longitude !== null && Number.isNaN(longitude))) {
      latitude = null;
      longitude = null;
    }
    if ((latitude == null || longitude == null) && editMGRS.trim()) {
      const parsed = parseMGRS(editMGRS);
      if (!parsed) {
        showNotification('Invalid MGRS coordinate', 'error');
        return;
      }
      latitude = parsed.latitude;
      longitude = parsed.longitude;
      setEditLat(String(latitude));
      setEditLng(String(longitude));
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
            description: editDescription.trim() || null,
            entities: editLinkedEntities.map((x) => ({
              entityId: x.entityId,
              role: x.role || null,
              confidence: x.confidence ?? null,
            }))
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

  const LocationPickerModal = ({
    isOpen,
    title,
    valueLat,
    valueLng,
    onPick,
    onClose,
  }) => {
    if (!isOpen) return null;

    const saved = getSavedMapView();
    const fallbackCenter = saved?.center ? [saved.center.lat, saved.center.lng] : [60.1699, 24.9384];
    const fallbackZoom = typeof saved?.zoom === 'number' ? saved.zoom : 4;

    const hasValue = Number.isFinite(valueLat) && Number.isFinite(valueLng);
    const center = hasValue ? [valueLat, valueLng] : fallbackCenter;
    const zoom = hasValue ? 14 : fallbackZoom;

    const styleCfg = MAP_STYLES[mapStyle] || MAP_STYLES.day;

    return (
      <div className="timeline-modal-overlay" onClick={onClose}>
        <div className="timeline-modal" onClick={(e) => e.stopPropagation()}>
          <div className="timeline-modal-header">
            <div className="timeline-modal-title">{title}</div>
            <button className="timeline-modal-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
          <div className="timeline-modal-body">
            <div className="timeline-map-container">
              <MapContainer
                center={center}
                zoom={zoom}
                scrollWheelZoom={true}
                style={{ height: '380px', width: '100%' }}
              >
                <MapStyleController style={mapStyle} />
                <TileLayer attribution={styleCfg.attribution} url={styleCfg.url} />
                <LocationPicker
                  valueLat={hasValue ? valueLat : null}
                  valueLng={hasValue ? valueLng : null}
                  onPick={(lat, lng) => {
                    onPick(lat, lng);
                    onClose();
                  }}
                />
              </MapContainer>
            </div>
            <div className="timeline-muted">Click the map to set latitude/longitude.</div>
          </div>
        </div>
      </div>
    );
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
        <h2>Timeline</h2>
        <div className="timeline-summary">
          <div><strong>{summaryCounts.total}</strong> item(s)</div>
          <div><strong>{summaryCounts.presences}</strong> presence(s)</div>
          <div><strong>{summaryCounts.events}</strong> event(s)</div>
        </div>
      </div>

      <div className="timeline-controls">
        <div className="timeline-control">
          <label htmlFor="timeline-after">Start</label>
          <input
            id="timeline-after"
            type="datetime-local"
            value={currentStartDate ? toDatetimeLocalValue(currentStartDate) : ''}
            onChange={(e) => handleStartDateChange(e.target.value)}
          />
        </div>
        <div className="timeline-control">
          <label htmlFor="events-before">End</label>
          <input
            id="events-before"
            type="datetime-local"
            value={currentCursorDate ? toDatetimeLocalValue(currentCursorDate) : ''}
            onChange={(e) => handleCursorDateChange(e.target.value)}
          />
        </div>

        <div className="timeline-control">
          <label>Ignore time filter</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="checkbox"
                checked={!!ignoreTimeFilter?.events}
                onChange={(e) => setIgnoreTimeFilter({
                  ...ignoreTimeFilter,
                  events: e.target.checked,
                })}
              />
              Events
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="checkbox"
                checked={!!ignoreTimeFilter?.presences}
                onChange={(e) => setIgnoreTimeFilter({
                  ...ignoreTimeFilter,
                  presences: e.target.checked,
                })}
              />
              Presences
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="checkbox"
                checked={!!ignoreTimeFilter?.images}
                onChange={(e) => setIgnoreTimeFilter({
                  ...ignoreTimeFilter,
                  images: e.target.checked,
                })}
              />
              Images (Map)
            </label>
          </div>
        </div>

        <div className="timeline-control">
          <label>Filter by entity</label>
          <EntitySearch
            placeholder={filterEntity ? 'Search to change…' : 'Search entities…'}
            onSelect={(entity) => setFilterEntity(entity)}
          />
          {filterEntity && (
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div className="timeline-muted">
                Filtering: <strong>{filterEntity.displayName || filterEntity.id}</strong>
              </div>
              <button className="timeline-secondary" onClick={() => setFilterEntity(null)}>
                Clear
              </button>
            </div>
          )}
        </div>

        <div className="timeline-control">
          <label htmlFor="timeline-tag-filter">Filter by tags (entity tags)</label>
          <input
            id="timeline-tag-filter"
            type="text"
            value={filterTagsRaw}
            onChange={(e) => setFilterTagsRaw(e.target.value)}
            placeholder="tag1, tag2"
          />
          {filterTagsRaw.trim() && (
            <div style={{ marginTop: '8px' }}>
              <button className="timeline-secondary" onClick={() => setFilterTagsRaw('')}>
                Clear tags
              </button>
            </div>
          )}
        </div>
      </div>

      {canWrite && !isCreateEventOpen && (
        <div className="timeline-location-actions" style={{ marginBottom: '16px' }}>
          <button className="timeline-primary" onClick={() => setIsCreateEventOpen(true)}>
            Create event…
          </button>
        </div>
      )}

      {canWrite && isCreateEventOpen && (
        <div className="timeline-event-form">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline' }}>
            <h3>Create Event</h3>
            <button className="timeline-secondary" onClick={() => setIsCreateEventOpen(false)}>
              Close
            </button>
          </div>
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
            <div className="timeline-form-field full">
              <label htmlFor="create-mgrs">MGRS</label>
              <input
                id="create-mgrs"
                value={newMGRS}
                onChange={(e) => {
                  const next = e.target.value;
                  setNewMGRS(next);
                  const parsed = parseMGRS(next);
                  if (parsed) {
                    setNewLat(String(parsed.latitude));
                    setNewLng(String(parsed.longitude));
                  }
                }}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="timeline-location-actions">
            <button className="timeline-secondary" onClick={() => setIsCreateLocationModalOpen(true)}>
              Set place…
            </button>
            <button
              className="timeline-secondary"
              onClick={() => {
                setNewLat('');
                setNewLng('');
                setNewMGRS('');
              }}
            >
              Clear place
            </button>
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

          <div className="timeline-linked-entities">
            <div className="timeline-linked-entities-header">Link entities (optional)</div>
            <EntitySearch
              placeholder="Search entities to link…"
              onSelect={addUniqueLinkedEntity(setNewLinkedEntities)}
            />
            {newLinkedEntities.length > 0 && (
              <div className="timeline-linked-entities-list">
                {newLinkedEntities.map((x) => (
                  <div key={x.entityId} className="timeline-linked-entity-chip">
                    <span className="timeline-linked-entity-name">
                      {x.entity?.displayName || x.entityId}
                    </span>
                    <button
                      className="timeline-linked-entity-remove"
                      onClick={() => removeLinkedEntity(setNewLinkedEntities, x.entityId)}
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="timeline-location-actions" style={{ marginTop: '10px' }}>
            <button className="timeline-primary" onClick={handleCreateEvent}>Create</button>
            <button className="timeline-secondary" onClick={() => setIsCreateEventOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <LocationPickerModal
        isOpen={isCreateLocationModalOpen}
        title="Set event location"
        valueLat={newLat.trim() ? parseFloat(newLat) : null}
        valueLng={newLng.trim() ? parseFloat(newLng) : null}
        onPick={(lat, lng) => {
          setNewLat(String(lat));
          setNewLng(String(lng));
          setNewMGRS(formatMGRS(lng, lat));
        }}
        onClose={() => setIsCreateLocationModalOpen(false)}
      />

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
            <div className="timeline-form-field full">
              <label htmlFor="edit-mgrs">MGRS</label>
              <input
                id="edit-mgrs"
                value={editMGRS}
                onChange={(e) => {
                  const next = e.target.value;
                  setEditMGRS(next);
                  const parsed = parseMGRS(next);
                  if (parsed) {
                    setEditLat(String(parsed.latitude));
                    setEditLng(String(parsed.longitude));
                  }
                }}
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

          <div className="timeline-linked-entities">
            <div className="timeline-linked-entities-header">Linked entities</div>
            <EntitySearch
              placeholder="Search entities to link…"
              onSelect={addUniqueLinkedEntity(setEditLinkedEntities)}
            />
            {editLinkedEntities.length > 0 && (
              <div className="timeline-linked-entities-list">
                {editLinkedEntities.map((x) => (
                  <div key={x.entityId} className="timeline-linked-entity-chip">
                    <span className="timeline-linked-entity-name">
                      {x.entity?.displayName || x.entityId}
                    </span>
                    <button
                      className="timeline-linked-entity-remove"
                      onClick={() => removeLinkedEntity(setEditLinkedEntities, x.entityId)}
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="timeline-location-actions">
            <button className="timeline-secondary" onClick={() => setIsEditLocationModalOpen(true)}>
              Set place…
            </button>
            <button
              className="timeline-secondary"
              onClick={() => {
                setEditLat('');
                setEditLng('');
                setEditMGRS('');
              }}
            >
              Clear place
            </button>
          </div>

          <div className="timeline-edit-actions">
            <button className="timeline-primary" onClick={handleUpdateEvent}>Save</button>
            <button className="timeline-secondary" onClick={() => setSelectedEventId(null)}>Cancel</button>
          </div>
        </div>
      )}

      <LocationPickerModal
        isOpen={isEditLocationModalOpen}
        title="Set event location"
        valueLat={editLat.trim() ? parseFloat(editLat) : null}
        valueLng={editLng.trim() ? parseFloat(editLng) : null}
        onPick={(lat, lng) => {
          setEditLat(String(lat));
          setEditLng(String(lng));
          setEditMGRS(formatMGRS(lng, lat));
        }}
        onClose={() => setIsEditLocationModalOpen(false)}
      />

      <div className="timeline-events">
        <h3>Items</h3>
        {(loading || presencesLoading) && <div className="timeline-muted">Loading…</div>}
        {error && <div className="timeline-error">Error (events): {error.message}</div>}
        {presencesError && <div className="timeline-error">Error (presences): {presencesError.message}</div>}
        {!loading && !presencesLoading && !error && !presencesError && filteredTimelineItems.length === 0 && (
          <div className="timeline-muted">No timeline items yet.</div>
        )}

        {filteredTimelineItems.map((item) => {
          if (item.kind === 'event') {
            const ev = item.event;
            const linkedNames = (ev.entities || [])
              .map((ee) => ee?.entity?.displayName || ee?.entityId)
              .filter(Boolean);
            return (
              <div key={item.id} className="timeline-event-item">
                <div className="timeline-event-main">
                  <div className="timeline-event-title">Event: {ev.title}</div>
                  <div className="timeline-event-meta">
                    {ev.occurredAt ? new Date(ev.occurredAt).toLocaleString() : 'Unknown time'}
                    {ev.latitude != null && ev.longitude != null ? ` · ${formatMGRS(ev.longitude, ev.latitude)}` : ''}
                  </div>
                  {linkedNames.length > 0 && (
                    <div className="timeline-event-desc">
                      <strong>Entities:</strong> {linkedNames.join(', ')}
                    </div>
                  )}
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
            );
          }

          const pr = item.presence;
          const entitySummary = (pr.entities || [])
            .map((pe) => {
              const name = pe?.entity?.displayName || pe?.entity?.id || pe?.entityId;
              const type = pe?.entity?.entityType;
              const role = pe?.role;
              return [name, type ? `(${type})` : null, role ? `· ${role}` : null].filter(Boolean).join(' ');
            })
            .filter(Boolean);

          const presenceTitle = (() => {
            const linked = (pr.entities || [])
              .map((pe) => pe?.entity?.displayName || pe?.entity?.id || pe?.entityId)
              .filter(Boolean);
            if (linked.length === 1) return `Presence: ${linked[0]}`;
            if (linked.length > 1) return `Presence: ${linked.length} entities`;
            return 'Presence';
          })();

          return (
            <div key={item.id} className="timeline-event-item">
              <div className="timeline-event-main">
                <div className="timeline-event-title">{presenceTitle}</div>
                <div className="timeline-event-meta">
                  {pr.observedAt ? new Date(pr.observedAt).toLocaleString() : 'Unknown time'}
                  {pr.latitude != null && pr.longitude != null ? ` · ${formatMGRS(pr.longitude, pr.latitude)}` : ''}
                  {pr.sourceType ? ` · ${pr.sourceType}` : ''}
                </div>
                {entitySummary.length > 0 && (
                  <div className="timeline-event-desc">
                    <strong>Entities:</strong> {entitySummary.join(', ')}
                  </div>
                )}
                {pr.notes && <div className="timeline-event-desc">{pr.notes}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TimelineView;
