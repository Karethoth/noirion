import React, { useEffect, useState, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import { useQuery, useMutation } from '@apollo/client/react';
import { formatMGRS } from '../utils/coordinates';
import ImageModal from './ImageModal';
import Notification from './Notification';
import EntitySearch from './EntitySearch';
import 'leaflet/dist/leaflet.css';
import './ImageMap.css';
import L from 'leaflet';
import { GET_IMAGES, DELETE_IMAGE } from '../graphql/images';
import { GET_EVENTS, CREATE_EVENT } from '../graphql/events';
import { GET_PRESENCES, CREATE_PRESENCE } from '../graphql/presences';
import { GET_ENTITIES, CREATE_ENTITY, ADD_ENTITY_ATTRIBUTE } from '../graphql/entities';

// Save/restore map position across component remounts
// Store both in module scope and localStorage for persistence
let savedMapView = null;

// Load from localStorage on module load
try {
  const stored = localStorage.getItem('mapView');
  if (stored) {
    savedMapView = JSON.parse(stored);
  }
} catch (e) {
  console.error('Failed to load saved map view:', e);
}

// Fix for default markers in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});


function toDatetimeLocalValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

// Component to restore saved view or fit bounds to markers
function MapInitializer({ points, hasInitialized }) {
  const map = useMap();

  useEffect(() => {
    if (hasInitialized.current) return;

    // If we have a saved view, restore it
    if (savedMapView?.center) {
      map.setView(savedMapView.center, savedMapView.zoom, { animate: false });
      hasInitialized.current = true;
    }
    // Otherwise, fit bounds to markers if we have any geolocated points
    else if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });

      try {
        const c = bounds.getCenter();
        localStorage.setItem('mapAutoCenter', JSON.stringify([c.lat, c.lng]));
      } catch {
        // ignore
      }
      hasInitialized.current = true;
    }
    // Only run on mount by excluding images from dependencies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return null;
}

// Component to save map view across remounts
function ViewPersistence() {
  const map = useMap();

  useEffect(() => {
    // Save view on any change
    const saveView = () => {
      const view = {
        center: map.getCenter(),
        zoom: map.getZoom()
      };
      savedMapView = view;

      // Also persist to localStorage
      try {
        localStorage.setItem('mapView', JSON.stringify(view));
      } catch (e) {
        console.error('Failed to save map view:', e);
      }
    };

    map.on('moveend', saveView);
    map.on('zoomend', saveView);

    return () => {
      map.off('moveend', saveView);
      map.off('zoomend', saveView);
    };
  }, [map]);

  return null;
}

// Component to apply map style class to container
function MapStyleController({ style }) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();

    // Remove all style classes
    container.classList.remove('map-style-day', 'map-style-night', 'map-style-satellite');

    // Add the current style class
    if (style !== 'day') { // 'day' is the default, no need for extra class
      container.classList.add(`map-style-${style}`);
    }
  }, [style, map]);

  return null;
}

// Map style configurations
const MAP_STYLES = {
  day: {
    name: 'Day',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },
  night: {
    name: 'Night',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  },
  satellite: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri'
  }
};

const ImageMap = ({
  userRole,
  timeCursor = null,
  timeStart = null,
  ignoreTimeFilter = { events: false, presences: false, images: false },
  onEditImage = null,
}) => {
  const { loading, error, data } = useQuery(GET_IMAGES, {
    fetchPolicy: 'cache-and-network', // Use cache first, then update in background
    nextFetchPolicy: 'cache-first', // After first fetch, prefer cache
  });

  const eventsVariables = useMemo(() => {
    if (ignoreTimeFilter?.events) return { before: null, after: null };
    return { before: timeCursor || null, after: timeStart || null };
  }, [ignoreTimeFilter?.events, timeCursor, timeStart]);

  const presencesVariables = useMemo(() => {
    if (ignoreTimeFilter?.presences) return { before: null, after: null };
    return { before: timeCursor || null, after: timeStart || null };
  }, [ignoreTimeFilter?.presences, timeCursor, timeStart]);

  const { data: eventsData } = useQuery(GET_EVENTS, {
    variables: eventsVariables,
    fetchPolicy: 'cache-and-network'
  });
  const { data: presencesData, refetch: refetchPresences } = useQuery(GET_PRESENCES, {
    variables: presencesVariables,
    fetchPolicy: 'cache-and-network'
  });
  const { data: locationsData, refetch: refetchLocations } = useQuery(GET_ENTITIES, {
    variables: { entityType: 'location', limit: 500, offset: 0 },
    fetchPolicy: 'cache-and-network'
  });
  const [deleteImage] = useMutation(DELETE_IMAGE);
  const [createEvent] = useMutation(CREATE_EVENT, {
    onCompleted: () => {
      // eventsData query will refresh via cache; map shows new marker after refetch
    }
  });
  const [createPresence] = useMutation(CREATE_PRESENCE);
  const [createEntity] = useMutation(CREATE_ENTITY);
  const [addEntityAttribute] = useMutation(ADD_ENTITY_ATTRIBUTE);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mapStyle, setMapStyle] = useState(() => {
    // Load saved map style from localStorage, default to 'day'
    return localStorage.getItem('mapStyle') || 'day';
  });
  const hasInitializedBounds = useRef(false);
  const mapRef = useRef(null);

  const [notification, setNotification] = useState(null);
  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
  };

  const canWrite = userRole === 'admin' || userRole === 'investigator';

  const [isEditMode, setIsEditMode] = useState(false);
  const [editKind, setEditKind] = useState('event'); // 'event' | 'presence' | 'location'
  const [pickedLat, setPickedLat] = useState(null);
  const [pickedLng, setPickedLng] = useState(null);

  const [draftEventTitle, setDraftEventTitle] = useState('');
  const [draftEventDescription, setDraftEventDescription] = useState('');
  const [draftEventOccurredAt, setDraftEventOccurredAt] = useState(() => toDatetimeLocalValue(new Date()));

  const [draftPresenceObservedAt, setDraftPresenceObservedAt] = useState(() => toDatetimeLocalValue(new Date()));
  const [draftPresenceNotes, setDraftPresenceNotes] = useState('');
  const [draftPresenceEntities, setDraftPresenceEntities] = useState([]); // [{ id, displayName, entityType }]

  const [draftLocationName, setDraftLocationName] = useState('');

  // Save map style to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('mapStyle', mapStyle);
  }, [mapStyle]);

  // Memoize images with location to avoid recreating on every render
  const imagesWithLocation = useMemo(() => {
    const images = data?.images?.filter(img => img.latitude && img.longitude) || [];

    if (ignoreTimeFilter?.images) return images;

    const beforeMs = timeCursor ? new Date(timeCursor).getTime() : null;
    const afterMs = timeStart ? new Date(timeStart).getTime() : null;
    if ((beforeMs != null && Number.isNaN(beforeMs)) || (afterMs != null && Number.isNaN(afterMs))) {
      return images;
    }

    if (beforeMs == null && afterMs == null) return images;

    return images.filter((img) => {
      const t = img.captureTimestamp || img.uploadedAt;
      if (!t) return false;
      const ms = new Date(t).getTime();
      if (Number.isNaN(ms)) return false;
      if (beforeMs != null && ms > beforeMs) return false;
      if (afterMs != null && ms < afterMs) return false;
      return true;
    });
  }, [data?.images, ignoreTimeFilter?.images, timeCursor, timeStart]);

  const eventIcon = useMemo(() => {
    return L.divIcon({
      className: 'custom-event-marker',
      html: '<div class="event-marker-inner">E</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      popupAnchor: [0, -28]
    });
  }, []);

  const presenceIcon = useMemo(() => {
    return L.divIcon({
      className: 'custom-presence-marker',
      html: '<div class="presence-marker-inner">P</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      popupAnchor: [0, -28]
    });
  }, []);

  const locationIcon = useMemo(() => {
    return L.divIcon({
      className: 'custom-location-marker',
      html: '<div class="location-marker-inner">L</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      popupAnchor: [0, -28]
    });
  }, []);

  const draftPickIcon = useMemo(() => {
    return L.divIcon({
      className: 'custom-draft-marker',
      html: '<div class="draft-marker-inner">+</div>',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  }, []);

  const eventsWithLocation = useMemo(() => {
    return (eventsData?.events || []).filter((e) => e.latitude != null && e.longitude != null);
  }, [eventsData?.events]);

  const presencesWithLocation = useMemo(() => {
    return (presencesData?.presences || []).filter((p) => p.latitude != null && p.longitude != null);
  }, [presencesData?.presences]);

  const presencePaths = useMemo(() => {
    const byEntity = new Map();

    const ensure = (entityId, label) => {
      if (!byEntity.has(entityId)) {
        byEntity.set(entityId, {
          entityId,
          label: label || null,
          points: [],
        });
      } else if (label && !byEntity.get(entityId).label) {
        byEntity.get(entityId).label = label;
      }
      return byEntity.get(entityId);
    };

    // Presences
    for (const p of presencesWithLocation) {
      const lat = p.latitude;
      const lng = p.longitude;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const ts = p.observedAt ? new Date(p.observedAt).getTime() : null;

      for (const pe of p.entities || []) {
        const entityId = pe?.entityId;
        if (!entityId) continue;
        ensure(entityId, pe?.entity?.displayName).points.push({ lat, lng, ts });
      }
    }

    // Events with linked entities count as presence points for those entities
    for (const ev of eventsWithLocation) {
      const lat = ev.latitude;
      const lng = ev.longitude;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const ts = ev.occurredAt ? new Date(ev.occurredAt).getTime() : null;

      for (const ee of ev.entities || []) {
        const entityId = ee?.entityId;
        if (!entityId) continue;
        ensure(entityId, ee?.entity?.displayName).points.push({ lat, lng, ts });
      }
    }

    const paths = [];
    for (const entry of byEntity.values()) {
      entry.points.sort((a, b) => {
        const at = a.ts ?? 0;
        const bt = b.ts ?? 0;
        return at - bt;
      });

      const deduped = [];
      for (const pt of entry.points) {
        const last = deduped[deduped.length - 1];
        if (last && last.lat === pt.lat && last.lng === pt.lng) continue;
        deduped.push(pt);
      }

      const positions = deduped.map((pt) => [pt.lat, pt.lng]);
      if (positions.length >= 2) {
        paths.push({ entityId: entry.entityId, label: entry.label, positions });
      }
    }

    return paths;
  }, [presencesWithLocation, eventsWithLocation]);

  const locationsWithCoordinates = useMemo(() => {
    const locations = locationsData?.entities || [];
    const parsed = [];

    const findAttr = (attrs, name) => {
      const needle = String(name).toLowerCase();
      return (attrs || []).find((a) => String(a?.attributeName || '').toLowerCase() === needle) || null;
    };

    for (const loc of locations) {
      const attrs = loc.attributes || [];

      const coordsAttr = findAttr(attrs, 'coordinates');
      const val = coordsAttr?.attributeValue;
      let latitude = val?.latitude;
      let longitude = val?.longitude;

      if (latitude == null || longitude == null) {
        const latAttr = findAttr(attrs, 'latitude');
        const lngAttr = findAttr(attrs, 'longitude');
        const latMaybe = latAttr?.attributeValue;
        const lngMaybe = lngAttr?.attributeValue;
        const latNum = typeof latMaybe === 'number' ? latMaybe : (typeof latMaybe === 'string' ? parseFloat(latMaybe) : null);
        const lngNum = typeof lngMaybe === 'number' ? lngMaybe : (typeof lngMaybe === 'string' ? parseFloat(lngMaybe) : null);
        if (latNum != null && !Number.isNaN(latNum)) latitude = latNum;
        if (lngNum != null && !Number.isNaN(lngNum)) longitude = lngNum;
      }

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      parsed.push({
        id: loc.id,
        displayName: loc.displayName || 'Unnamed location',
        latitude,
        longitude
      });
    }

    return parsed;
  }, [locationsData?.entities]);

  const initialGeolocatedPoints = useMemo(() => {
    const pts = [];

    for (const img of imagesWithLocation) {
      if (Number.isFinite(img.latitude) && Number.isFinite(img.longitude)) {
        pts.push([img.latitude, img.longitude]);
      }
    }

    for (const ev of eventsWithLocation) {
      if (Number.isFinite(ev.latitude) && Number.isFinite(ev.longitude)) {
        pts.push([ev.latitude, ev.longitude]);
      }
    }

    for (const p of presencesWithLocation) {
      if (Number.isFinite(p.latitude) && Number.isFinite(p.longitude)) {
        pts.push([p.latitude, p.longitude]);
      }
    }

    for (const loc of locationsWithCoordinates) {
      if (Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)) {
        pts.push([loc.latitude, loc.longitude]);
      }
    }

    return pts;
  }, [imagesWithLocation, eventsWithLocation, presencesWithLocation, locationsWithCoordinates]);

  useEffect(() => {
    if (!initialGeolocatedPoints || initialGeolocatedPoints.length === 0) return;

    let sumLat = 0;
    let sumLng = 0;
    let count = 0;

    for (const pt of initialGeolocatedPoints) {
      if (!Array.isArray(pt) || pt.length !== 2) continue;
      const lat = Number(pt[0]);
      const lng = Number(pt[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      sumLat += lat;
      sumLng += lng;
      count += 1;
    }

    if (count === 0) return;
    const avgLat = sumLat / count;
    const avgLng = sumLng / count;

    try {
      localStorage.setItem('mapAutoCenter', JSON.stringify([avgLat, avgLng]));
    } catch {
      // ignore
    }
  }, [initialGeolocatedPoints]);

  const MapEditClickHandler = ({ enabled, onPick }) => {
    useMapEvents({
      click(e) {
        if (!enabled) return;
        const target = e.originalEvent?.target;
        if (target && (target.closest?.('.leaflet-marker-icon') || target.closest?.('.leaflet-popup'))) {
          return;
        }
        onPick(e.latlng.lat, e.latlng.lng);
      }
    });
    return null;
  };

  const resetDraft = () => {
    setPickedLat(null);
    setPickedLng(null);
    setDraftEventTitle('');
    setDraftEventDescription('');
    setDraftEventOccurredAt(toDatetimeLocalValue(new Date()));
    setDraftPresenceObservedAt(toDatetimeLocalValue(new Date()));
    setDraftPresenceNotes('');
    setDraftPresenceEntities([]);
    setDraftLocationName('');
  };

  const handleCreateFromMap = async () => {
    if (!canWrite) return;

    if (pickedLat == null || pickedLng == null) {
      showNotification('Click the map to choose a location first', 'error');
      return;
    }

    try {
      if (editKind === 'event') {
        if (!draftEventTitle.trim()) {
          showNotification('Event title is required', 'error');
          return;
        }
        const occurredAtDate = new Date(draftEventOccurredAt);
        if (Number.isNaN(occurredAtDate.getTime())) {
          showNotification('Invalid occurredAt', 'error');
          return;
        }

        await createEvent({
          variables: {
            input: {
              occurredAt: occurredAtDate.toISOString(),
              latitude: pickedLat,
              longitude: pickedLng,
              title: draftEventTitle.trim(),
              description: draftEventDescription.trim() || null
            }
          },
          refetchQueries: [{ query: GET_EVENTS, variables: eventsVariables }]
        });
        showNotification('Event created', 'success');
        resetDraft();
        return;
      }

      if (editKind === 'presence') {
        if (draftPresenceEntities.length === 0) {
          showNotification('Select at least one entity for a presence', 'error');
          return;
        }
        const observedAtDate = new Date(draftPresenceObservedAt);
        if (Number.isNaN(observedAtDate.getTime())) {
          showNotification('Invalid observedAt', 'error');
          return;
        }

        await createPresence({
          variables: {
            input: {
              observedAt: observedAtDate.toISOString(),
              latitude: pickedLat,
              longitude: pickedLng,
              notes: draftPresenceNotes.trim() || null,
              entities: draftPresenceEntities.map((e) => ({ entityId: e.id }))
            }
          }
        });
        if (refetchPresences) {
          await refetchPresences();
        }
        showNotification('Presence created', 'success');
        resetDraft();
        return;
      }

      if (editKind === 'location') {
        if (!draftLocationName.trim()) {
          showNotification('Location name is required', 'error');
          return;
        }

        const entityResult = await createEntity({
          variables: {
            input: {
              entityType: 'location',
              displayName: draftLocationName.trim()
            }
          }
        });
        const newEntityId = entityResult?.data?.createEntity?.id;
        if (!newEntityId) {
          throw new Error('Location entity id missing from response');
        }

        await addEntityAttribute({
          variables: {
            entityId: newEntityId,
            input: {
              attributeName: 'coordinates',
              attributeValue: {
                latitude: pickedLat,
                longitude: pickedLng
              },
              confidence: 1.0
            }
          }
        });

        if (refetchLocations) {
          await refetchLocations();
        }
        showNotification('Location created', 'success');
        resetDraft();
        return;
      }
    } catch (err) {
      console.error('Create failed:', err);
      showNotification(`Create failed: ${err.message}`, 'error');
    }
  };

  // Calculate distance between two coordinates in meters (Haversine formula)
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  };

  // Group images by proximity (within 50 meters)
  const imageGroups = useMemo(() => {
    const groups = [];
    const processed = new Set();
    const CLUSTER_DISTANCE = 50; // meters

    imagesWithLocation.forEach((image, idx) => {
      if (processed.has(idx)) return;

      const group = {
        lat: image.latitude,
        lng: image.longitude,
        images: [image]
      };
      processed.add(idx);

      // Find all other images within CLUSTER_DISTANCE
      imagesWithLocation.forEach((otherImage, otherIdx) => {
        if (processed.has(otherIdx)) return;

        const distance = calculateDistance(
          image.latitude,
          image.longitude,
          otherImage.latitude,
          otherImage.longitude
        );

        if (distance <= CLUSTER_DISTANCE) {
          group.images.push(otherImage);
          processed.add(otherIdx);
        }
      });

      // Calculate center of group (average position)
      if (group.images.length > 1) {
        const latSum = group.images.reduce((sum, img) => sum + img.latitude, 0);
        const lngSum = group.images.reduce((sum, img) => sum + img.longitude, 0);
        group.lat = latSum / group.images.length;
        group.lng = lngSum / group.images.length;
      }

      groups.push(group);
    });

    return groups;
  }, [imagesWithLocation]);

  const handleDeleteImage = async (imageId) => {
    if (!confirm('Are you sure you want to delete this image? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteImage({
        variables: { id: imageId },
        update: (cache) => {
          // Read the current data from the cache
          const existingData = cache.readQuery({ query: GET_IMAGES });

          if (existingData) {
            // Filter out the deleted image
            const updatedImages = existingData.images.filter(img => img.id !== imageId);

            // Write the updated data back to the cache
            cache.writeQuery({
              query: GET_IMAGES,
              data: { images: updatedImages }
            });
          }
        }
      });
    } catch (err) {
      alert(`Failed to delete image: ${err.message}`);
    }
  };

  if (loading) return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      fontSize: '18px',
      color: '#666'
    }}>
      ⏳ Loading map and images...
    </div>
  );

  if (error) return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      fontSize: '18px',
      color: '#dc3545'
    }}>
      ⚠️ Error loading images: {error.message}
    </div>
  );

  const currentStyle = MAP_STYLES[mapStyle];

  // Create custom numbered marker icon
  const createNumberedIcon = (count) => {
    return L.divIcon({
      className: 'custom-marker-cluster',
      html: `<div class="marker-cluster-inner">${count}</div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      popupAnchor: [0, -40]
    });
  };

  const mapUiTheme = mapStyle === 'day' ? 'map-ui-light' : 'map-ui-dark';

  return (
    <div className={`map-overlay-root ${mapUiTheme}`} style={{ height: '100%', width: '100%', position: 'relative' }}>
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      {/* Map Style Toggle */}
      <div className="map-style-toggle">
        {Object.entries(MAP_STYLES).map(([key, style]) => (
          <button
            key={key}
            onClick={() => setMapStyle(key)}
            className={`map-style-button ${mapStyle === key ? 'active' : ''}`}
          >
            {style.name}
          </button>
        ))}
      </div>

      {/* Map Edit Panel */}
      {canWrite && (
        <div className="map-edit-panel">
          <div className="map-edit-header">
            <button
              className={`map-edit-toggle ${isEditMode ? 'active' : ''}`}
              onClick={() => {
                setIsEditMode((v) => {
                  const next = !v;
                  if (!next) {
                    resetDraft();
                  }
                  return next;
                });
              }}
            >
              Edit
            </button>
          </div>

          {isEditMode && (
            <div className="map-edit-body">
              <div className="map-edit-row">
                <label className="map-edit-label">Create</label>
                <select
                  className="map-edit-select"
                  value={editKind}
                  onChange={(e) => {
                    setEditKind(e.target.value);
                    setPickedLat(null);
                    setPickedLng(null);
                  }}
                >
                  <option value="event">Event</option>
                  <option value="presence">Presence</option>
                  <option value="location">Location</option>
                </select>
              </div>

              <div className="map-edit-row">
                <div className="map-edit-hint">
                  Click the map to place a point.
                </div>
              </div>

              <div className="map-edit-row">
                <div className="map-edit-coords" role="group" aria-label="Selected location">
                  <span className="map-edit-coords-text">
                    {pickedLat != null && pickedLng != null ? (
                      <>📍 {formatMGRS(pickedLng, pickedLat)}</>
                    ) : (
                      <span className="map-edit-muted">No location selected</span>
                    )}
                  </span>
                  {pickedLat != null && pickedLng != null && (
                    <button
                      type="button"
                      className="map-edit-coords-clear"
                      onClick={() => {
                        setPickedLat(null);
                        setPickedLng(null);
                      }}
                      aria-label="Clear location"
                      title="Clear location"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {editKind === 'event' && (
                <>
                  <div className="map-edit-row">
                    <label className="map-edit-label">Title</label>
                    <input
                      className="map-edit-input"
                      value={draftEventTitle}
                      onChange={(e) => setDraftEventTitle(e.target.value)}
                      placeholder="Event title"
                    />
                  </div>
                  <div className="map-edit-row">
                    <label className="map-edit-label">Occurred at</label>
                    <input
                      className="map-edit-input"
                      type="datetime-local"
                      value={draftEventOccurredAt}
                      onChange={(e) => setDraftEventOccurredAt(e.target.value)}
                    />
                  </div>
                  <div className="map-edit-row">
                    <label className="map-edit-label">Description</label>
                    <input
                      className="map-edit-input"
                      value={draftEventDescription}
                      onChange={(e) => setDraftEventDescription(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </>
              )}

              {editKind === 'presence' && (
                <>
                  <div className="map-edit-row">
                    <label className="map-edit-label">Observed at</label>
                    <input
                      className="map-edit-input"
                      type="datetime-local"
                      value={draftPresenceObservedAt}
                      onChange={(e) => setDraftPresenceObservedAt(e.target.value)}
                    />
                  </div>

                  <div className="map-edit-row">
                    <label className="map-edit-label">Entities</label>
                    <div style={{ width: '100%' }}>
                      <EntitySearch
                        placeholder="Search entities to link..."
                        onSelect={(entity) => {
                          setDraftPresenceEntities((prev) => {
                            if (prev.some((e) => e.id === entity.id)) return prev;
                            return [...prev, entity];
                          });
                        }}
                      />
                      {draftPresenceEntities.length > 0 && (
                        <div className="map-edit-chips">
                          {draftPresenceEntities.map((e) => (
                            <button
                              key={e.id}
                              className="map-edit-chip"
                              onClick={() => setDraftPresenceEntities((prev) => prev.filter((x) => x.id !== e.id))}
                              title="Remove"
                            >
                              {e.displayName} ✕
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="map-edit-row">
                    <label className="map-edit-label">Notes</label>
                    <input
                      className="map-edit-input"
                      value={draftPresenceNotes}
                      onChange={(e) => setDraftPresenceNotes(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </>
              )}

              {editKind === 'location' && (
                <>
                  <div className="map-edit-row">
                    <label className="map-edit-label">Name</label>
                    <input
                      className="map-edit-input"
                      value={draftLocationName}
                      onChange={(e) => setDraftLocationName(e.target.value)}
                      placeholder="Location name"
                    />
                  </div>
                </>
              )}

              <div className="map-edit-actions">
                <button className="map-edit-primary" onClick={handleCreateFromMap}>
                  Create
                </button>
                <button className="map-edit-secondary" onClick={resetDraft}>
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <MapContainer
        key="main-map"
        center={savedMapView?.center || [60.1699, 24.9384]}
        zoom={savedMapView?.zoom || 10}
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
      >
        <TileLayer
          key={mapStyle}
          attribution={currentStyle.attribution}
          url={currentStyle.url}
        />
        <MapStyleController style={mapStyle} />
        {!hasInitializedBounds.current && (
          <MapInitializer points={initialGeolocatedPoints} hasInitialized={hasInitializedBounds} />
        )}
        <ViewPersistence />
        <MapEditClickHandler
          enabled={isEditMode && canWrite}
          onPick={(lat, lng) => {
            setPickedLat(lat);
            setPickedLng(lng);
          }}
        />

        {isEditMode && Number.isFinite(pickedLat) && Number.isFinite(pickedLng) && (
          <Marker
            key={`draft-pick-${pickedLat}-${pickedLng}`}
            position={[pickedLat, pickedLng]}
            icon={draftPickIcon}
            interactive={false}
          />
        )}

        {presencePaths.map((path) => (
          <Polyline
            key={`presence-path-${path.entityId}`}
            positions={path.positions}
            pathOptions={{ className: 'presence-path', weight: 3, opacity: 0.75 }}
          />
        ))}

        {locationsWithCoordinates.map((loc) => (
          <Marker
            key={`location-${loc.id}`}
            position={[loc.latitude, loc.longitude]}
            icon={locationIcon}
          >
            <Popup maxWidth={280} minWidth={260}>
              <div style={{ padding: '4px' }}>
                <div className="popup-filename">📍 {loc.displayName}</div>
                <div className="popup-coordinates" style={{ marginTop: '8px' }}>
                  {formatMGRS(loc.longitude, loc.latitude)}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {presencesWithLocation.map((p) => (
          <Marker
            key={`presence-${p.id}`}
            position={[p.latitude, p.longitude]}
            icon={presenceIcon}
          >
            <Popup maxWidth={300} minWidth={260}>
              <div style={{ padding: '4px' }}>
                <div className="popup-timestamp">
                  👁️ {p.observedAt ? new Date(p.observedAt).toLocaleString() : 'Unknown time'}
                </div>
                <div className="popup-filename">
                  Presence
                </div>
                {p.entities && p.entities.length > 0 && (
                  <div style={{ marginTop: '8px', color: '#666', fontSize: '12px' }}>
                    {p.entities
                      .map((pe) => pe?.entity?.displayName || `Entity ${pe.entityId}`)
                      .filter(Boolean)
                      .slice(0, 5)
                      .join(', ')}
                    {p.entities.length > 5 ? '…' : ''}
                  </div>
                )}
                {p.notes && (
                  <div style={{ marginTop: '8px', color: '#666', fontSize: '12px' }}>
                    {p.notes}
                  </div>
                )}
                <div className="popup-coordinates" style={{ marginTop: '8px' }}>
                  📍 {formatMGRS(p.longitude, p.latitude)}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {eventsWithLocation.map((ev) => (
          <Marker
            key={`event-${ev.id}`}
            position={[ev.latitude, ev.longitude]}
            icon={eventIcon}
          >
            <Popup maxWidth={280} minWidth={260}>
              <div style={{ padding: '4px' }}>
                <div className="popup-timestamp">
                  🕒 {ev.occurredAt ? new Date(ev.occurredAt).toLocaleString() : 'Unknown time'}
                </div>
                <div className="popup-filename">
                  {ev.title}
                </div>
                {ev.description && (
                  <div style={{ marginTop: '8px', color: '#666', fontSize: '12px' }}>
                    {ev.description}
                  </div>
                )}
                <div className="popup-coordinates" style={{ marginTop: '8px' }}>
                  📍 {formatMGRS(ev.longitude, ev.latitude)}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {imageGroups.flatMap((group, groupIdx) => {
          const count = group.images.length;
          const markers = [];

          // Add numbered marker at center if multiple images
          if (count > 1) {
            markers.push(
              <Marker
                key={`group-${groupIdx}`}
                position={[group.lat, group.lng]}
                icon={createNumberedIcon(count)}
                eventHandlers={{
                  click: () => {
                    // Click will show popup, but marker is not interactive
                  }
                }}
              />
            );
          }

          // Add individual image markers
          group.images.forEach((image, imgIdx) => {
            let lat = image.latitude;
            let lng = image.longitude;

            if (count > 1) {
              const radius = 0.0003; // ~33 meters - increased for better clickability
              const angle = (imgIdx / count) * 2 * Math.PI;
              lat += radius * Math.cos(angle);
              lng += radius * Math.sin(angle);
            }

            markers.push(
            <Marker
              key={`marker-${groupIdx}-${image.id}`}
              position={[lat, lng]}
            >
              <Popup maxWidth={280} minWidth={260}>
              <div style={{ padding: '4px' }}>
                {/* Image Preview */}
                <div style={{
                  position: 'relative',
                  width: '100%',
                  height: '180px',
                  overflow: 'hidden',
                  borderRadius: '6px',
                  marginBottom: '12px',
                  backgroundColor: '#f5f5f5',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  setSelectedImage(image);
                  setIsModalOpen(true);
                }}>
                  <img
                    src={`${import.meta.env.VITE_API_URL}${image.filePath}`}
                    alt={image.filename}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transition: 'transform 0.2s'
                    }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.parentElement.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #999;">Image not available</div>';
                    }}
                    onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                    onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                  />
                </div>

                {/* Metadata */}
                <div className="popup-metadata">
                  {image.captureTimestamp && (
                    <div className="popup-timestamp">
                      📅 {new Date(image.captureTimestamp).toLocaleString()}
                    </div>
                  )}
                  <div className="popup-coordinates">
                    📍 {formatMGRS(image.longitude, image.latitude)}
                  </div>

                  {/* Tags */}
                  {image.annotations && image.annotations.length > 0 && (
                    <div className="popup-tags">
                      {Array.from(new Set(image.annotations.flatMap(ann => ann.tags || []))).map((tag, idx) => (
                        <span key={idx} className="popup-tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => {
                      setSelectedImage(image);
                      setIsModalOpen(true);
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      backgroundColor: '#1a1a2e',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '500',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#2a2a4e'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = '#1a1a2e'}
                  >
                    View Details
                  </button>
                  {canWrite && (
                    <button
                      onClick={() => handleDeleteImage(image.id)}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '500',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = '#c82333'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = '#dc3545'}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
            );
          });

          return markers;
        })}
      </MapContainer>

      {/* Map Info Overlay */}
      <div className="map-info-overlay">
        <strong>{imagesWithLocation.length}</strong> image{imagesWithLocation.length !== 1 ? 's' : ''} with location data
        {eventsWithLocation.length > 0 && (
          <> · <span style={{ color: '#888' }}><strong>{eventsWithLocation.length}</strong> event{eventsWithLocation.length !== 1 ? 's' : ''}</span></>
        )}
        {presencesWithLocation.length > 0 && (
          <> · <span style={{ color: '#888' }}><strong>{presencesWithLocation.length}</strong> presence{presencesWithLocation.length !== 1 ? 's' : ''}</span></>
        )}
        {locationsWithCoordinates.length > 0 && (
          <> · <span style={{ color: '#888' }}><strong>{locationsWithCoordinates.length}</strong> location{locationsWithCoordinates.length !== 1 ? 's' : ''}</span></>
        )}
        {data?.images?.length > imagesWithLocation.length && (
          <> · <span style={{ color: '#888' }}>{data.images.length - imagesWithLocation.length} without location</span></>
        )}
      </div>

      <ImageModal
        image={selectedImage}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedImage(null);
        }}
        readOnly={!canWrite}
        onEditDetails={(id) => {
          if (typeof onEditImage === 'function') onEditImage(id);
        }}
      />
    </div>
  );
};

export default React.memo(ImageMap);
