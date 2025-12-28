import React, { useEffect, useState, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import { useQuery, useMutation } from '@apollo/client/react';
import { formatMGRS } from '../utils/coordinates';
import { toDatetimeLocalValue } from '../utils/datetimeLocal';
import { parseTagTokens } from '../utils/tagTokens';
import { MAP_STYLES, loadSavedMapStyle, saveMapStyle } from '../utils/mapStyles';
import { loadSavedMapView, saveMapView } from '../utils/mapViewStorage';
import { initLeafletDefaultMarkerIcons } from '../utils/leafletInit';
import { buildAssetUrl } from '../utils/assetUrls';
import MapStyleController from './MapStyleController';
import ImageModal from './ImageModal';
import Notification from './Notification';
import EntitySearch from './EntitySearch';
import 'leaflet/dist/leaflet.css';
import './ImageMap.css';
import L from 'leaflet';
import { GET_IMAGES, DELETE_IMAGE, UPDATE_IMAGE } from '../graphql/images';
import { GET_EVENTS, CREATE_EVENT } from '../graphql/events';
import { GET_PRESENCES, GET_PRESENCES_BY_ENTITY, CREATE_PRESENCE, DELETE_PRESENCE } from '../graphql/presences';
import { GET_ENTITIES, GET_IMAGES_BY_ENTITY, CREATE_ENTITY, ADD_ENTITY_ATTRIBUTE } from '../graphql/entities';

const DEBUG_GRAPHQL = ['1', 'true', 'yes', 'on'].includes(
  String(import.meta.env.VITE_DEBUG_GRAPHQL || '').toLowerCase()
);

// Save/restore map position across component remounts
// Store both in module scope and localStorage for persistence
let savedMapView = null;

// Load from localStorage on module load
savedMapView = loadSavedMapView('mapView');

initLeafletDefaultMarkerIcons();


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
      saveMapView(view, 'mapView');
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

function MapInstanceBridge({ onMap }) {
  const map = useMap();

  useEffect(() => {
    if (typeof onMap === 'function') {
      onMap(map);
    }

    return () => {
      if (typeof onMap === 'function') {
        onMap(null);
      }
    };
  }, [map, onMap]);

  return null;
}

function MapViewTracker({ onViewChange }) {
  const map = useMap();

  useMapEvents({
    zoomend() {
      if (typeof onViewChange === 'function') onViewChange(map);
    },
    moveend() {
      if (typeof onViewChange === 'function') onViewChange(map);
    },
  });

  return null;
}

const ImageMap = ({
  userRole,
  timeCursor = null,
  timeStart = null,
  ignoreTimeFilter = { events: false, presences: false, images: false },
  onEditImage = null,
  openImageId = null,
  onOpenImageHandled = null,
  openPresenceId = null,
  onOpenPresenceHandled = null,
}) => {
  const [filterEntity, setFilterEntity] = useState(null); // { id, displayName, ... }
  const filterEntityId = filterEntity?.id || null;
  const [filterTagsRaw, setFilterTagsRaw] = useState('');

  const filterTagTokens = useMemo(() => {
    return parseTagTokens(filterTagsRaw);
  }, [filterTagsRaw]);

  const imagesQuery = filterEntityId ? GET_IMAGES_BY_ENTITY : GET_IMAGES;
  const imagesVariables = filterEntityId
    ? { entityId: filterEntityId, limit: 2000, offset: 0 }
    : undefined;

  const {
    loading: imagesLoading,
    error: imagesError,
    data: imagesData,
    refetch: refetchImages,
  } = useQuery(imagesQuery, {
    variables: imagesVariables,
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
  });

  const allImages = useMemo(() => {
    if (filterEntityId) return imagesData?.imagesByEntity || [];
    return imagesData?.images || [];
  }, [imagesData?.images, imagesData?.imagesByEntity, filterEntityId]);

  useEffect(() => {
    if (!DEBUG_GRAPHQL) return;
    if (!imagesLoading) return;

    const t = setTimeout(() => {
      console.warn('[ImageMap] Images query still loading after 10s. Check Network tab and backend logs.');
      console.warn('[ImageMap] VITE_API_URL=', import.meta.env.VITE_API_URL);
    }, 10000);

    return () => clearTimeout(t);
  }, [imagesLoading]);

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

  const presencesQuery = filterEntityId ? GET_PRESENCES_BY_ENTITY : GET_PRESENCES;
  const presencesQueryVariables = filterEntityId
    ? { entityId: filterEntityId, limit: 2000, offset: 0 }
    : presencesVariables;

  const {
    data: presencesData,
    refetch: refetchPresences,
  } = useQuery(presencesQuery, {
    variables: presencesQueryVariables,
    fetchPolicy: 'cache-and-network'
  });
  const { data: locationsData, refetch: refetchLocations } = useQuery(GET_ENTITIES, {
    variables: { entityType: 'location', limit: 500, offset: 0 },
    fetchPolicy: 'cache-and-network'
  });
  const [deleteImage] = useMutation(DELETE_IMAGE);
  const [updateImage] = useMutation(UPDATE_IMAGE);
  const [createEvent] = useMutation(CREATE_EVENT, {
    onCompleted: () => {
      // eventsData query will refresh via cache; map shows new marker after refetch
    }
  });
  const [createPresence] = useMutation(CREATE_PRESENCE);
  const [deletePresence] = useMutation(DELETE_PRESENCE);
  const [createEntity] = useMutation(CREATE_ENTITY);
  const [addEntityAttribute] = useMutation(ADD_ENTITY_ATTRIBUTE);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [subjectPickImageId, setSubjectPickImageId] = useState(null);
  const [subjectPickWorking, setSubjectPickWorking] = useState(false);
  const [mapStyle, setMapStyle] = useState(() => {
    // Load saved map style from localStorage, default to 'day'
    return loadSavedMapStyle('mapStyle');
  });
  const hasInitializedBounds = useRef(false);
  const [mapInstance, setMapInstance] = useState(null);
  const [mapViewVersion, setMapViewVersion] = useState(0);
  const presenceMarkerRefs = useRef(new Map());
  const imageMarkerRefs = useRef(new Map());
  const [pendingOpenPresenceId, setPendingOpenPresenceId] = useState(null);
  const latestPresencesRef = useRef([]);
  const latestMapInstanceRef = useRef(null);
  const openPresenceRetryRef = useRef({ timer: null, attempts: 0, lastId: null, didFly: false });

  useEffect(() => {
    // Persist selected style.
    saveMapStyle(mapStyle, 'mapStyle');
  }, [mapStyle]);

  // External request to open an image (e.g. immediately after upload).
  useEffect(() => {
    if (!openImageId) return;
    const images = allImages;
    if (!Array.isArray(images) || images.length === 0) return;

    const found = images.find((img) => img?.id === openImageId);
    if (!found) return;

    setSelectedImage(found);
    setIsModalOpen(true);
    if (typeof onOpenImageHandled === 'function') {
      onOpenImageHandled(openImageId);
    }
  }, [openImageId, allImages, onOpenImageHandled]);

  useEffect(() => {
    latestPresencesRef.current = Array.isArray(presencesData?.presences) ? presencesData.presences : [];
  }, [presencesData?.presences]);

  useEffect(() => {
    latestMapInstanceRef.current = mapInstance || null;
  }, [mapInstance]);

  // External request to open a presence (e.g. from Timeline click).
  // We store it as pending so we can handle timing (data/markers may not be ready yet).
  useEffect(() => {
    if (!openPresenceId) return;
    setPendingOpenPresenceId(openPresenceId);
  }, [openPresenceId]);

  useEffect(() => {
    const retryState = openPresenceRetryRef.current;

    if (!pendingOpenPresenceId) {
      if (retryState.timer) {
        clearTimeout(retryState.timer);
        retryState.timer = null;
      }
      retryState.attempts = 0;
      retryState.lastId = null;
      retryState.didFly = false;
      return;
    }

    // Reset retry state when the target presence changes.
    if (retryState.lastId !== pendingOpenPresenceId) {
      if (retryState.timer) {
        clearTimeout(retryState.timer);
        retryState.timer = null;
      }
      retryState.attempts = 0;
      retryState.lastId = pendingOpenPresenceId;
      retryState.didFly = false;
    }

    const attemptOpen = () => {
      const id = retryState.lastId;
      if (!id) return;

      const presences = latestPresencesRef.current || [];
      const found = presences.find((p) => p?.id === id);
      if (!found) {
        scheduleRetry();
        return;
      }

      if (found.latitude == null || found.longitude == null) {
        showNotification('Presence has no location; cannot open on map', 'error');
        if (typeof onOpenPresenceHandled === 'function') {
          onOpenPresenceHandled(id);
        }
        setPendingOpenPresenceId(null);
        return;
      }

      const map = latestMapInstanceRef.current;
      if (!map) {
        scheduleRetry();
        return;
      }

      // Pan/zoom first (only once per open).
      if (!retryState.didFly) {
        const currentZoom = typeof map.getZoom === 'function' ? map.getZoom() : 10;
        const nextZoom = Math.max(currentZoom || 10, 16);
        if (typeof map.flyTo === 'function') {
          map.flyTo([found.latitude, found.longitude], nextZoom, { animate: true, duration: 0.6 });
        } else if (typeof map.setView === 'function') {
          map.setView([found.latitude, found.longitude], nextZoom, { animate: true });
        }
        retryState.didFly = true;
      }

      const marker = presenceMarkerRefs.current.get(id);
      if (!marker || typeof marker.openPopup !== 'function') {
        scheduleRetry();
        return;
      }

      marker.openPopup();
      if (typeof onOpenPresenceHandled === 'function') {
        onOpenPresenceHandled(id);
      }
      setPendingOpenPresenceId(null);
    };

    const scheduleRetry = () => {
      const st = retryState;
      if (st.timer) return;
      if (st.attempts >= 60) {
        // ~3 seconds max at 50ms intervals
        st.timer = null;
        return;
      }
      st.attempts += 1;
      st.timer = setTimeout(() => {
        st.timer = null;
        attemptOpen();
      }, 50);
    };

    attemptOpen();

    return () => {
      if (retryState.timer) {
        clearTimeout(retryState.timer);
        retryState.timer = null;
      }
    };
  }, [pendingOpenPresenceId, onOpenPresenceHandled]);

  const [notification, setNotification] = useState(null);
  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
  };

  const canWrite = userRole === 'admin' || userRole === 'investigator';

  const handleDeletePresence = async (presenceId) => {
    if (!canWrite) return;
    if (!presenceId) return;
    if (!window.confirm('Delete this presence?')) return;
    try {
      await deletePresence({ variables: { id: presenceId } });
      if (refetchPresences) {
        await refetchPresences();
      }
      showNotification('Presence deleted', 'success');
    } catch (err) {
      console.error('Error deleting presence:', err);
      showNotification(`Failed to delete presence: ${err.message}`, 'error');
    }
  };

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
    const toFiniteNumber = (v) => {
      if (v === null || v === undefined || v === '') return null;
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const images = (Array.isArray(allImages) ? allImages : [])
      .map((img) => ({
        ...img,
        latitude: toFiniteNumber(img?.latitude),
        longitude: toFiniteNumber(img?.longitude),
        subjectLatitude: toFiniteNumber(img?.subjectLatitude),
        subjectLongitude: toFiniteNumber(img?.subjectLongitude),
      }))
      .filter((img) => img.latitude != null && img.longitude != null);

    if (ignoreTimeFilter?.images) return images;

    const beforeMs = timeCursor ? new Date(timeCursor).getTime() : null;
    const afterMs = timeStart ? new Date(timeStart).getTime() : null;
    if ((beforeMs != null && Number.isNaN(beforeMs)) || (afterMs != null && Number.isNaN(afterMs))) {
      return images;
    }

    if (beforeMs == null && afterMs == null) return images;

    const timeFiltered = images.filter((img) => {
      const t = img.captureTimestamp || img.uploadedAt;
      if (!t) return false;
      const ms = new Date(t).getTime();
      if (Number.isNaN(ms)) return false;
      if (beforeMs != null && ms > beforeMs) return false;
      if (afterMs != null && ms < afterMs) return false;
      return true;
    });

    if (filterTagTokens.length === 0) return timeFiltered;

    return timeFiltered.filter((img) => {
      const tags = (img?.annotations || [])
        .flatMap((a) => a?.tags || [])
        .filter(Boolean)
        .map((t) => String(t).toLowerCase());
      return filterTagTokens.some((needle) => tags.some((tag) => tag.includes(needle)));
    });
  }, [allImages, ignoreTimeFilter?.images, timeCursor, timeStart, filterTagTokens]);

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
    const raw = filterEntityId
      ? (presencesData?.presencesByEntity || [])
      : (presencesData?.presences || []);

    // Apply time filtering consistently even when using presencesByEntity.
    const beforeMs = !ignoreTimeFilter?.presences && timeCursor ? new Date(timeCursor).getTime() : null;
    const afterMs = !ignoreTimeFilter?.presences && timeStart ? new Date(timeStart).getTime() : null;

    const timeFiltered = raw.filter((p) => {
      if (p.latitude == null || p.longitude == null) return false;

      if (beforeMs == null && afterMs == null) return true;

      const t = p.observedAt;
      if (!t) return false;
      const ms = new Date(t).getTime();
      if (Number.isNaN(ms)) return false;
      if (beforeMs != null && ms > beforeMs) return false;
      if (afterMs != null && ms < afterMs) return false;
      return true;
    });

    if (filterTagTokens.length === 0) return timeFiltered;

    return timeFiltered.filter((p) => {
      const tags = (p?.entities || [])
        .flatMap((pe) => pe?.entity?.tags || [])
        .filter(Boolean)
        .map((t) => String(t).toLowerCase());
      return filterTagTokens.some((needle) => tags.some((tag) => tag.includes(needle)));
    });
  }, [
    presencesData?.presences,
    presencesData?.presencesByEntity,
    filterEntityId,
    ignoreTimeFilter?.presences,
    timeCursor,
    timeStart,
    filterTagTokens,
  ]);

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

  const MapSubjectPickClickHandler = ({ enabled, onPick }) => {
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

  // Group images by pixel proximity at the current zoom.
  const imageGroups = useMemo(() => {
    // Used as a "version bump" to force regrouping.
    void mapViewVersion;

    const images = Array.isArray(imagesWithLocation) ? imagesWithLocation : [];
    if (!mapInstance || images.length === 0) {
      return images.map((img) => ({ lat: img.latitude, lng: img.longitude, images: [img] }));
    }

    // Guard against transient states where Leaflet's panes are not ready (or were torn down).
    try {
      if (typeof mapInstance.getPane !== 'function' || !mapInstance.getPane('mapPane')) {
        return images.map((img) => ({ lat: img.latitude, lng: img.longitude, images: [img] }));
      }
    } catch {
      return images.map((img) => ({ lat: img.latitude, lng: img.longitude, images: [img] }));
    }

    const groups = [];
    const processed = new Set();

    // Rough pixel size of an image marker hit area.
    const CLUSTER_PX = 36;

    for (let idx = 0; idx < images.length; idx += 1) {
      if (processed.has(idx)) continue;

      const image = images[idx];
      const group = { lat: image.latitude, lng: image.longitude, images: [image] };
      processed.add(idx);

      let p1;
      try {
        p1 = mapInstance.latLngToContainerPoint([image.latitude, image.longitude]);
      } catch {
        // If Leaflet is mid-teardown or not ready, fall back to non-clustered behavior.
        return images.map((img) => ({ lat: img.latitude, lng: img.longitude, images: [img] }));
      }

      for (let otherIdx = idx + 1; otherIdx < images.length; otherIdx += 1) {
        if (processed.has(otherIdx)) continue;
        const otherImage = images[otherIdx];
        let p2;
        try {
          p2 = mapInstance.latLngToContainerPoint([otherImage.latitude, otherImage.longitude]);
        } catch {
          continue;
        }
        const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        if (d <= CLUSTER_PX) {
          group.images.push(otherImage);
          processed.add(otherIdx);
        }
      }

      if (group.images.length > 1) {
        const latSum = group.images.reduce((sum, img) => sum + img.latitude, 0);
        const lngSum = group.images.reduce((sum, img) => sum + img.longitude, 0);
        group.lat = latSum / group.images.length;
        group.lng = lngSum / group.images.length;
      }

      groups.push(group);
    }

    return groups;
  }, [imagesWithLocation, mapInstance, mapViewVersion]);

  const handleDeleteImage = async (imageId) => {
    if (!confirm('Are you sure you want to delete this image? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteImage({
        variables: { id: imageId }
      });

      // Keep the current view consistent (unfiltered or filtered-by-entity).
      if (typeof refetchImages === 'function') {
        await refetchImages();
      }
    } catch (err) {
      showNotification(`Failed to delete image: ${err.message}`, 'error');
    }
  };

  // Keep the map mounted even while data is loading; unmounting can cause Leaflet DOM reads
  // during teardown (e.g. latLngToContainerPoint), which throws "_leaflet_pos" errors.
  const showImagesLoadingOverlay = Boolean(imagesLoading);
  const showImagesErrorOverlay = Boolean(imagesError);

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

  // When filter changes (or map instance is restored), Leaflet can render gray tiles until it
  // recalculates container size. Trigger a size invalidation on next frame.
  useEffect(() => {
    if (!mapInstance || typeof mapInstance.invalidateSize !== 'function') return;
    const raf = requestAnimationFrame(() => {
      try {
        mapInstance.invalidateSize(false);
      } catch {
        // ignore
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [mapInstance, filterEntityId]);

  return (
    <div className={`map-overlay-root ${mapUiTheme}`} style={{ height: '100%', width: '100%', position: 'relative' }}>
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      {showImagesLoadingOverlay && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255, 255, 255, 0.65)',
            zIndex: 1200,
            pointerEvents: 'none',
            color: '#555',
            fontSize: '16px',
            fontWeight: 600,
          }}
        >
          ⏳ Loading images…
        </div>
      )}

      {showImagesErrorOverlay && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255, 255, 255, 0.75)',
            zIndex: 1200,
            padding: '16px',
            textAlign: 'center',
            color: '#b02a37',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          ⚠️ Error loading images: {imagesError?.message}
        </div>
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

      {/* Entity Filter Panel */}
      <div className="map-edit-panel map-filter-panel">
        <div className="map-edit-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ fontWeight: 600 }}>Filter</div>
            {filterEntityId && (
              <button
                type="button"
                className="map-edit-toggle"
                onClick={() => setFilterEntity(null)}
                title="Clear entity filter"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <div className="map-edit-body">
          <div className="map-edit-row">
            <label className="map-edit-label">Entity</label>
            <div style={{ width: '100%' }}>
              <EntitySearch
                placeholder="Search entity to filter…"
                onSelect={(entity) => {
                  setFilterEntity(entity);
                }}
              />
              {filterEntityId && (
                <div className="map-edit-chips">
                  <button
                    className="map-edit-chip"
                    onClick={() => setFilterEntity(null)}
                    title="Clear"
                  >
                    {filterEntity?.displayName || filterEntityId} ✕
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="map-edit-row">
            <label className="map-edit-label">Tags</label>
            <input
              className="map-edit-input"
              value={filterTagsRaw}
              onChange={(e) => setFilterTagsRaw(e.target.value)}
              placeholder="comma or space separated"
            />
          </div>

          {filterTagTokens.length > 0 && (
            <div className="map-edit-row">
              <div className="map-edit-hint">Tag filter active: {filterTagTokens.join(', ')}</div>
            </div>
          )}

          {filterEntityId && (
            <div className="map-edit-row">
              <div className="map-edit-hint">Showing images + presences linked to the selected entity.</div>
            </div>
          )}
        </div>
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
                  } else {
                    // Avoid conflicting click modes.
                    setSubjectPickImageId(null);
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
        maxZoom={22}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          key={mapStyle}
          attribution={currentStyle.attribution}
          url={currentStyle.url}
          maxZoom={22}
          maxNativeZoom={19}
        />
        <MapInstanceBridge onMap={setMapInstance} />
        <MapViewTracker
          onViewChange={() => {
            try {
              setMapViewVersion((v) => v + 1);
            } catch {
              // ignore
            }
          }}
        />
        <MapStyleController style={mapStyle} />
        {!hasInitializedBounds.current && (
          <MapInitializer points={initialGeolocatedPoints} hasInitialized={hasInitializedBounds} />
        )}
        <ViewPersistence />
        <MapEditClickHandler
          enabled={isEditMode && canWrite && !subjectPickImageId}
          onPick={(lat, lng) => {
            setPickedLat(lat);
            setPickedLng(lng);
          }}
        />

        <MapSubjectPickClickHandler
          enabled={!isEditMode && canWrite && !!subjectPickImageId}
          onPick={async (lat, lng) => {
            if (!subjectPickImageId) return;
            if (subjectPickWorking) return;
            setSubjectPickWorking(true);
            try {
              const res = await updateImage({
                variables: {
                  id: String(subjectPickImageId),
                  input: {
                    subjectLatitude: lat,
                    subjectLongitude: lng,
                  },
                },
              });

              const updated = res?.data?.updateImage || null;
              if (updated && String(selectedImage?.id) === String(updated.id)) {
                setSelectedImage((prev) => ({ ...(prev || {}), ...updated }));
              }

              if (typeof refetchImages === 'function') {
                await refetchImages();
              }

              showNotification('Subject location set', 'success');
              setSubjectPickImageId(null);
            } catch (err) {
              console.error(err);
              showNotification(`Failed to set subject location: ${err.message}`, 'error');
            } finally {
              setSubjectPickWorking(false);
            }
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

        {imagesWithLocation.map((img) => {
          const lat = img?.latitude;
          const lng = img?.longitude;
          const subjLat = img?.subjectLatitude;
          const subjLng = img?.subjectLongitude;
          if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(subjLat) || !Number.isFinite(subjLng)) return null;
          return (
            <Polyline
              key={`subject-path-${img.id}`}
              positions={[[lat, lng], [subjLat, subjLng]]}
              pathOptions={{ className: 'subject-path', weight: 3, opacity: 0.9 }}
              eventHandlers={{
                click: () => {
                  const marker = imageMarkerRefs.current.get(String(img.id));
                  if (marker && typeof marker.openPopup === 'function') {
                    marker.openPopup();
                  }
                },
              }}
            />
          );
        })}

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
            ref={(ref) => {
              if (!ref) {
                presenceMarkerRefs.current.delete(p.id);
                return;
              }
              presenceMarkerRefs.current.set(p.id, ref);
            }}
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

                {canWrite && (
                  <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="timeline-danger"
                      onClick={(e) => {
                        e.preventDefault();
                        handleDeletePresence(p.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
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

            // If we are clustered, scatter in pixels around group center.
            if (count > 1 && mapInstance) {
              try {
                if (typeof mapInstance.getPane === 'function' && mapInstance.getPane('mapPane')) {
                  const centerPt = mapInstance.latLngToContainerPoint([group.lat, group.lng]);
                  const radiusPx = 28;
                  const angle = (imgIdx / count) * 2 * Math.PI;
                  const dx = radiusPx * Math.cos(angle);
                  const dy = radiusPx * Math.sin(angle);
                  const ll = mapInstance.containerPointToLatLng(L.point(centerPt.x + dx, centerPt.y + dy));
                  lat = ll.lat;
                  lng = ll.lng;
                }
              } catch {
                // Keep original lat/lng.
              }
            }

            markers.push(
            <Marker
              key={`marker-${groupIdx}-${image.id}`}
              position={[lat, lng]}
              ref={(ref) => {
                const id = String(image?.id);
                if (!id) return;
                if (!ref) {
                  imageMarkerRefs.current.delete(id);
                  return;
                }
                imageMarkerRefs.current.set(id, ref);
              }}
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
                    src={buildAssetUrl(image.filePath)}
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
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
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
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!image?.id) return;
                        setSubjectPickImageId(String(image.id));
                        try {
                          mapInstance?.closePopup?.();
                        } catch {
                          // ignore
                        }
                        showNotification('Click the map to set subject location', 'info');
                      }}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: 'rgba(255, 193, 7, 0.9)',
                        color: 'black',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '500',
                        transition: 'background-color 0.2s'
                      }}
                      title="Click, then click on the main map to set the subject location"
                    >
                      🎯 Set subject
                    </button>
                  )}

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
        {Array.isArray(allImages) && allImages.length > imagesWithLocation.length && (
          <> · <span style={{ color: '#888' }}>{allImages.length - imagesWithLocation.length} without location</span></>
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
        onSetSubjectFromMap={(id) => {
          if (!canWrite) return;
          if (!id) return;
          setSubjectPickImageId(String(id));
          showNotification('Click the map to set subject location', 'info');
        }}
        onEditDetails={(id) => {
          if (typeof onEditImage === 'function') onEditImage(id);
        }}
      />
    </div>
  );
};

export default React.memo(ImageMap);
