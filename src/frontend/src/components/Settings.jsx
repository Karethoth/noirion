import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { formatMGRS } from '../utils/coordinates';
import {
  GET_PROJECT_SETTINGS,
  UPDATE_PROJECT_SETTINGS,
  RECALCULATE_PROJECT_HOME_LOCATION,
} from '../graphql/settings';

const STORAGE_KEYS = {
  mapStyle: 'mapStyle',
  mapView: 'mapView',
};

function loadMapStyle() {
  try {
    const s = localStorage.getItem(STORAGE_KEYS.mapStyle) || 'day';
    if (['day', 'night', 'satellite'].includes(s)) return s;
  } catch {
    // ignore
  }
  return 'day';
}

const Settings = () => {
  const { data, loading, error, refetch } = useQuery(GET_PROJECT_SETTINGS, {
    fetchPolicy: 'network-only',
  });

  const [updateProjectSettings] = useMutation(UPDATE_PROJECT_SETTINGS);
  const [recalculateHome] = useMutation(RECALCULATE_PROJECT_HOME_LOCATION);

  const [autoUpdateHome, setAutoUpdateHome] = useState(false);
  const [homeLat, setHomeLat] = useState('');
  const [homeLng, setHomeLng] = useState('');
  const [mapStyle, setMapStyle] = useState(() => loadMapStyle());

  useEffect(() => {
    const s = data?.projectSettings;
    if (!s) return;
    setAutoUpdateHome(!!s.homeAutoUpdate);
    setHomeLat(s.homeLat == null ? '' : String(s.homeLat));
    setHomeLng(s.homeLng == null ? '' : String(s.homeLng));
  }, [data?.projectSettings]);

  const mgrs = useMemo(() => {
    const lat = homeLat === '' ? null : Number(homeLat);
    const lng = homeLng === '' ? null : Number(homeLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    try {
      return formatMGRS(lng, lat);
    } catch {
      return null;
    }
  }, [homeLat, homeLng]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.mapStyle, mapStyle);
    } catch {
      // ignore
    }
  }, [mapStyle]);

  const handleSaveHome = () => {
    (async () => {
      const lat = homeLat === '' ? null : Number(homeLat);
      const lng = homeLng === '' ? null : Number(homeLng);

      if ((lat === null) !== (lng === null)) {
        alert('Both latitude and longitude must be provided together.');
        return;
      }
      if (lat != null && (!Number.isFinite(lat) || !Number.isFinite(lng))) {
        alert('Latitude/longitude must be valid numbers.');
        return;
      }

      try {
        await updateProjectSettings({
          variables: {
            input: {
              homeAutoUpdate: autoUpdateHome,
              homeLat: lat,
              homeLng: lng,
            },
          },
        });
        await refetch();
        alert('Saved.');
      } catch (e) {
        console.error(e);
        alert('Failed to save settings.');
      }
    })();
  };

  const handleToggleAutoUpdate = (next) => {
    (async () => {
      setAutoUpdateHome(next);
      try {
        await updateProjectSettings({
          variables: { input: { homeAutoUpdate: next } },
        });
        await refetch();
      } catch (e) {
        console.error(e);
        alert('Failed to update setting.');
      }
    })();
  };

  const handleRecalculateHome = async () => {
    try {
      await recalculateHome();
      await refetch();
    } catch (e) {
      console.error(e);
      alert('Failed to recalculate home location.');
    }
  };

  const handleResetMapView = () => {
    try {
      localStorage.removeItem(STORAGE_KEYS.mapView);
      alert('Map view reset.');
    } catch {
      alert('Failed to reset map view.');
    }
  };

  const computedCenter = useMemo(() => {
    const s = data?.projectSettings;
    if (s?.homeLat == null || s?.homeLng == null) return null;
    return { lat: s.homeLat, lng: s.homeLng };
  }, [data?.projectSettings]);

  return (
    <div style={{ padding: 16, color: '#e0e0e0', boxSizing: 'border-box', height: '100%', overflow: 'auto' }}>
      <h2 style={{ margin: '0 0 12px 0' }}>Settings</h2>

      {loading && <div style={{ color: '#b0b0b0', marginBottom: 12 }}>Loading…</div>}
      {error && <div style={{ color: '#b00020', marginBottom: 12 }}>Error: {error.message}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, maxWidth: 900 }}>
        <div style={{ background: '#1a1a1a', border: '1px solid #3a3a3a', borderRadius: 8, padding: 16 }}>
          <h3 style={{ margin: '0 0 10px 0' }}>Project home location</h3>

          <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={autoUpdateHome}
              onChange={(e) => handleToggleAutoUpdate(e.target.checked)}
            />
            Auto-update home location from all geolocated data
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10, alignItems: 'center' }}>
            <label>Latitude</label>
            <input
              value={homeLat}
              disabled={autoUpdateHome}
              onChange={(e) => setHomeLat(e.target.value)}
              placeholder="e.g. 60.1699"
              style={{ padding: 8, borderRadius: 6, border: '1px solid #444', background: '#111', color: '#eee' }}
            />

            <label>Longitude</label>
            <input
              value={homeLng}
              disabled={autoUpdateHome}
              onChange={(e) => setHomeLng(e.target.value)}
              placeholder="e.g. 24.9384"
              style={{ padding: 8, borderRadius: 6, border: '1px solid #444', background: '#111', color: '#eee' }}
            />

            <label>MGRS</label>
            <div style={{ color: '#b0b0b0', fontSize: 13 }}>
              {mgrs || '—'}
            </div>

            <label>Computed center</label>
            <div style={{ color: '#b0b0b0', fontSize: 13 }}>
              {computedCenter ? `${computedCenter.lat.toFixed(6)}, ${computedCenter.lng.toFixed(6)}` : '—'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button
              onClick={handleRecalculateHome}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #444', background: '#111', color: '#eee', cursor: 'pointer' }}
            >
              Recalculate from data
            </button>
            <button
              onClick={handleSaveHome}
              style={{ padding: '8px 12px', borderRadius: 6, border: 'none', background: 'rgba(40, 167, 69, 0.9)', color: 'white', cursor: 'pointer' }}
            >
              Save
            </button>
          </div>

          <div style={{ marginTop: 10, color: '#888', fontSize: 12 }}>
            Location pickers will default to this home location when no explicit location is set.
          </div>
        </div>

        <div style={{ background: '#1a1a1a', border: '1px solid #3a3a3a', borderRadius: 8, padding: 16 }}>
          <h3 style={{ margin: '0 0 10px 0' }}>Map</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10, alignItems: 'center' }}>
            <label>Map style</label>
            <select
              value={mapStyle}
              onChange={(e) => setMapStyle(e.target.value)}
              style={{ padding: 8, borderRadius: 6, border: '1px solid #444', background: '#111', color: '#eee' }}
            >
              <option value="day">Day</option>
              <option value="night">Night</option>
              <option value="satellite">Satellite</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button
              onClick={handleResetMapView}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #444', background: '#111', color: '#eee', cursor: 'pointer' }}
            >
              Reset saved map view
            </button>
          </div>

          <div style={{ marginTop: 10, color: '#888', fontSize: 12 }}>
            Tip: after changing map style, switch back to the Map tab to apply it.
          </div>
        </div>

      </div>
    </div>
  );
};

export default Settings;
