import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { LEAFLET_DEFAULT_MARKER_ICON_URLS } from '../utils/externalUrls';
import { formatMGRS } from '../utils/coordinates';
import { GET_PROJECT_SETTINGS } from '../graphql/settings';

// Fix for default markers in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions(LEAFLET_DEFAULT_MARKER_ICON_URLS);

function ClickToPick({ onPick }) {
  useMapEvents({
    click: (e) => {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapStyleController({ style }) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    container.classList.remove('map-style-day', 'map-style-night', 'map-style-satellite');
    if (style !== 'day') {
      container.classList.add(`map-style-${style}`);
    }
  }, [style, map]);

  return null;
}

function MapRecenter({ center, zoom }) {
  const map = useMap();

  useEffect(() => {
    if (!Array.isArray(center) || center.length !== 2) return;
    const lat = Number(center[0]);
    const lng = Number(center[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    map.setView([lat, lng], zoom, { animate: false });
  }, [map, center, zoom]);

  return null;
}

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

const getSavedMapStyle = () => {
  try {
    const style = localStorage.getItem('mapStyle') || 'day';
    return MAP_STYLES[style] ? style : 'day';
  } catch {
    return 'day';
  }
};

const getStoredCenter = (key) => {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.length === 2 && parsed.every((n) => Number.isFinite(Number(n)))) {
      return [Number(parsed[0]), Number(parsed[1])];
    }
    if (Array.isArray(parsed?.center) && parsed.center.length === 2) return parsed.center;

    if (parsed && typeof parsed === 'object' && Number.isFinite(Number(parsed.lat)) && Number.isFinite(Number(parsed.lng))) {
      return [Number(parsed.lat), Number(parsed.lng)];
    }
  } catch {
    // ignore
  }
  return null;
};

const getInitialCenter = (lat, lng, projectHomeCenter) => {
  if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
  if (Array.isArray(projectHomeCenter) && projectHomeCenter.length === 2) return projectHomeCenter;
  const fromView = getStoredCenter('mapView');
  if (fromView) return fromView;

  // When there's no saved view yet, try the auto-computed center from the main map.
  const auto = getStoredCenter('mapAutoCenter');
  if (auto) return auto;

  return [60.1699, 24.9384];
};

const getInitialZoom = () => {
  try {
    const stored = localStorage.getItem('mapView');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Number.isFinite(parsed?.zoom)) return parsed.zoom;
    }
  } catch {
    // ignore
  }
  return 12;
};

const AssetLocationPickerModal = ({
  isOpen,
  initialLat,
  initialLng,
  onClose,
  onUse,
  readOnly = false,
}) => {
  const [pickedLat, setPickedLat] = useState(null);
  const [pickedLng, setPickedLng] = useState(null);
  const [mapStyle] = useState(() => getSavedMapStyle());

  const { data: projectSettingsData } = useQuery(GET_PROJECT_SETTINGS, {
    skip: !isOpen,
    fetchPolicy: 'cache-and-network',
  });

  useEffect(() => {
    if (!isOpen) return;
    setPickedLat(Number.isFinite(initialLat) ? initialLat : null);
    setPickedLng(Number.isFinite(initialLng) ? initialLng : null);
  }, [isOpen, initialLat, initialLng]);

  const projectHomeCenter = useMemo(() => {
    const s = projectSettingsData?.projectSettings;
    const lat = Number(s?.homeLat);
    const lng = Number(s?.homeLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return [lat, lng];
  }, [projectSettingsData?.projectSettings]);

  const center = useMemo(
    () => getInitialCenter(initialLat, initialLng, projectHomeCenter),
    [initialLat, initialLng, projectHomeCenter]
  );
  const zoom = useMemo(() => getInitialZoom(), []);
  const styleCfg = MAP_STYLES[mapStyle] || MAP_STYLES.day;

  const mgrs = useMemo(() => {
    if (!Number.isFinite(pickedLat) || !Number.isFinite(pickedLng)) return null;
    try {
      return formatMGRS(pickedLng, pickedLat);
    } catch {
      return null;
    }
  }, [pickedLat, pickedLng]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1200,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '90vw',
          height: '80vh',
          maxWidth: 1200,
          backgroundColor: '#1a1a1a',
          borderRadius: 8,
          border: '1px solid #3a3a3a',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          cursor: 'default',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '10px 12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            borderBottom: '1px solid #3a3a3a',
            background: '#2a2a2a',
            color: '#e0e0e0',
          }}
        >
          <div>Pick asset location</div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(0,0,0,0.6)',
              color: 'white',
              border: 'none',
              borderRadius: 999,
              width: 30,
              height: 30,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution={styleCfg.attribution}
              url={styleCfg.url}
            />
            <MapStyleController style={mapStyle} />
            <MapRecenter center={center} zoom={zoom} />
            {!readOnly && (
              <ClickToPick
                onPick={(lat, lng) => {
                  setPickedLat(lat);
                  setPickedLng(lng);
                }}
              />
            )}
            {Number.isFinite(pickedLat) && Number.isFinite(pickedLng) && (
              <Marker position={[pickedLat, pickedLng]} />
            )}
          </MapContainer>
        </div>

        <div
          style={{
            padding: '10px 12px',
            borderTop: '1px solid #3a3a3a',
            background: '#2a2a2a',
            color: '#e0e0e0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: 12, color: '#b0b0b0' }}>
            {Number.isFinite(pickedLat) && Number.isFinite(pickedLng) ? (
              <>
                <div>
                  <strong>Lat/Lng:</strong> {pickedLat.toFixed(6)}, {pickedLng.toFixed(6)}
                </div>
                {mgrs && (
                  <div>
                    <strong>MGRS:</strong> {mgrs}
                  </div>
                )}
              </>
            ) : (
              'Click the map to set a location.'
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #444',
                background: '#111',
                color: '#eee',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            {!readOnly && (
              <button
                onClick={() => {
                  if (!Number.isFinite(pickedLat) || !Number.isFinite(pickedLng)) return;
                  if (typeof onUse === 'function') onUse(pickedLat, pickedLng);
                  onClose?.();
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: 'rgba(40, 167, 69, 0.9)',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                Use location
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssetLocationPickerModal;
