import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './ImageMap.css';
import { formatMGRS } from '../utils/coordinates';
import { initLeafletDefaultMarkerIcons } from '../utils/leafletInit';
import { MAP_STYLES, loadSavedMapStyle, saveMapStyle } from '../utils/mapStyles';
import { loadSavedMapView } from '../utils/mapViewStorage';
import MapStyleController from './MapStyleController';

initLeafletDefaultMarkerIcons();

function ClickToPick({ onPick }) {
  useMapEvents({
    click: (e) => {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function getInitialCenter(initialLat, initialLng, fallbackCenter) {
  const lat = initialLat == null || initialLat === '' ? null : Number(initialLat);
  const lng = initialLng == null || initialLng === '' ? null : Number(initialLng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];

  if (fallbackCenter && Number.isFinite(Number(fallbackCenter.lat)) && Number.isFinite(Number(fallbackCenter.lng))) {
    return [Number(fallbackCenter.lat), Number(fallbackCenter.lng)];
  }

  const view = loadSavedMapView('mapView');
  if (view?.center && Number.isFinite(view.center.lat) && Number.isFinite(view.center.lng)) {
    return [view.center.lat, view.center.lng];
  }

  try {
    const auto = localStorage.getItem('mapAutoCenter');
    if (auto) {
      const parsed = JSON.parse(auto);
      if (Array.isArray(parsed) && parsed.length === 2 && parsed.every((n) => Number.isFinite(Number(n)))) {
        return [Number(parsed[0]), Number(parsed[1])];
      }
    }
  } catch {
    // ignore
  }

  return [60.1699, 24.9384];
}

export default function HomeLocationPickerModal({
  isOpen,
  initialLat,
  initialLng,
  fallbackCenter = null,
  onClose,
  onUse,
  disabled = false,
}) {
  const [mapStyle, setMapStyle] = useState(() => loadSavedMapStyle('mapStyle'));
  const styleCfg = MAP_STYLES[mapStyle] || MAP_STYLES.day;

  const [pickedLat, setPickedLat] = useState(null);
  const [pickedLng, setPickedLng] = useState(null);

  const center = useMemo(() => {
    return getInitialCenter(initialLat, initialLng, fallbackCenter);
  }, [initialLat, initialLng, fallbackCenter]);

  const zoom = useMemo(() => {
    // Prefer saved zoom if present.
    const view = loadSavedMapView('mapView');
    if (view && Number.isFinite(view.zoom)) return Math.max(3, Math.min(22, view.zoom));
    return 12;
  }, []);

  useEffect(() => {
    saveMapStyle(mapStyle, 'mapStyle');
  }, [mapStyle]);

  useEffect(() => {
    if (!isOpen) return;

    const lat = initialLat == null || initialLat === '' ? null : Number(initialLat);
    const lng = initialLng == null || initialLng === '' ? null : Number(initialLng);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setPickedLat(lat);
      setPickedLng(lng);
    } else {
      setPickedLat(null);
      setPickedLng(null);
    }
  }, [isOpen, initialLat, initialLng]);

  const mgrs = useMemo(() => {
    if (!Number.isFinite(pickedLat) || !Number.isFinite(pickedLng)) return null;
    try {
      return formatMGRS(Number(pickedLng), Number(pickedLat));
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
          <div>Pick home location</div>
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
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div
          className={mapStyle === 'day' ? 'map-ui-light' : 'map-ui-dark'}
          style={{ flex: 1, minHeight: 0, position: 'relative' }}
        >
          <div className="map-style-toggle">
            {Object.entries(MAP_STYLES).map(([key, style]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMapStyle(key)}
                className={`map-style-button ${mapStyle === key ? 'active' : ''}`}
              >
                {style.name}
              </button>
            ))}
          </div>

          <MapContainer
            center={center}
            zoom={zoom}
            style={{ height: '100%', width: '100%' }}
            maxZoom={22}
          >
            <TileLayer
              key={mapStyle}
              attribution={styleCfg.attribution}
              url={styleCfg.url}
              maxNativeZoom={19}
            />
            <MapStyleController style={mapStyle} />
            {!disabled && (
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
            <button
              onClick={() => {
                if (disabled) return;
                if (!Number.isFinite(pickedLat) || !Number.isFinite(pickedLng)) return;
                onUse?.(pickedLat, pickedLng);
                onClose?.();
              }}
              disabled={disabled || !Number.isFinite(pickedLat) || !Number.isFinite(pickedLng)}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: 'none',
                background: 'rgba(40, 167, 69, 0.9)',
                color: 'white',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.6 : 1,
              }}
            >
              Use location
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
