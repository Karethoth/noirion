import React, { useEffect, useMemo, useState } from 'react';
import { useLazyQuery, useMutation, useQuery } from '@apollo/client/react';
import { formatMGRS } from '../utils/coordinates';
import Notification from './Notification';
import ConfirmModal from './ConfirmModal';
import {
  GET_PROJECT_SETTINGS,
  GET_LM_STUDIO_MODELS,
  TEST_LM_STUDIO_VISION,
  UPDATE_PROJECT_SETTINGS,
  RECALCULATE_PROJECT_HOME_LOCATION,
} from '../graphql/settings';
import { DEV_RESET_DATABASE } from '../graphql/admin';
import { setAiConfig } from '../utils/aiConfig';

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
  const [devResetDatabase] = useMutation(DEV_RESET_DATABASE);

  const [autoUpdateHome, setAutoUpdateHome] = useState(false);
  const [homeLat, setHomeLat] = useState('');
  const [homeLng, setHomeLng] = useState('');
  const [mapStyle, setMapStyle] = useState(() => loadMapStyle());

  const [aiEnabled, setAiEnabled] = useState(true);
  const [lmStudioBaseUrl, setLmStudioBaseUrl] = useState('');
  const [lmStudioModel, setLmStudioModel] = useState('');
  const [lmStudioModelsOpen, setLmStudioModelsOpen] = useState(false);

  const [fetchLmStudioModels, { data: lmModelsData, loading: lmModelsLoading, error: lmModelsError }] = useLazyQuery(
    GET_LM_STUDIO_MODELS,
    { fetchPolicy: 'network-only' }
  );

  const [runVisionTest, { loading: visionTestLoading }] = useLazyQuery(TEST_LM_STUDIO_VISION, {
    fetchPolicy: 'no-cache',
  });

  const [notification, setNotification] = useState(null);
  const showNotification = (message, type = 'info', duration = 3000) => {
    setNotification({ message, type, duration });
  };

  const showDevTools = useMemo(() => {
    return import.meta.env.DEV || String(import.meta.env.VITE_ENABLE_DB_RESET || '').toLowerCase() === 'true';
  }, []);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetWorking, setResetWorking] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');

  useEffect(() => {
    const s = data?.projectSettings;
    if (!s) return;
    setAutoUpdateHome(!!s.homeAutoUpdate);
    setHomeLat(s.homeLat == null ? '' : String(s.homeLat));
    setHomeLng(s.homeLng == null ? '' : String(s.homeLng));

     setAiEnabled(s.aiEnabled !== false);
     setLmStudioBaseUrl(String(s.lmStudioBaseUrl || ''));
     setLmStudioModel(String(s.lmStudioModel || ''));
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

  const handleSaveAi = async () => {
    try {
      const baseUrl = String(lmStudioBaseUrl || '').trim();
      const model = String(lmStudioModel || '').trim();

      await updateProjectSettings({
        variables: {
          input: {
            aiEnabled: !!aiEnabled,
            lmStudioBaseUrl: baseUrl === '' ? null : baseUrl,
            lmStudioModel: model === '' ? null : model,
          },
        },
      });

      // Keep the UI gating consistent even before the app-level sync runs.
      setAiConfig({ enabled: !!aiEnabled, host: baseUrl, model });

      await refetch();
      showNotification('Saved', 'success');
    } catch (e) {
      console.error(e);
      showNotification(e?.message || 'Failed to save AI settings', 'error');
    }
  };

  const handleRefreshModels = async () => {
    setLmStudioModelsOpen(true);
    try {
      await fetchLmStudioModels({ variables: { visionOnly: false } });
    } catch (e) {
      // handled by lmModelsError
    }
  };

  const handleVisionTest = async () => {
    const modelId = String(lmStudioModel || '').trim();
    if (!modelId) {
      showNotification('Select a model first', 'error');
      return;
    }

    try {
      const res = await runVisionTest({ variables: { modelId } });
      const r = res?.data?.lmStudioTestVision;
      if (!r) {
        showNotification('Vision test failed', 'error');
        return;
      }
      if (r.ok && r.isVision) {
        showNotification(r.message ? `Vision OK: ${r.message}` : 'Vision OK', 'success', 5000);
      } else if (r.ok && !r.isVision) {
        showNotification(r.message ? `Not vision: ${r.message}` : 'Model does not appear to support vision', 'error', 7000);
      } else {
        showNotification(r.message ? `Test failed: ${r.message}` : 'Vision test failed', 'error', 7000);
      }
    } catch (e) {
      showNotification(e?.message || 'Vision test failed', 'error', 7000);
    }
  };

  const handleSaveHome = () => {
    (async () => {
      const lat = homeLat === '' ? null : Number(homeLat);
      const lng = homeLng === '' ? null : Number(homeLng);

      if ((lat === null) !== (lng === null)) {
        showNotification('Both latitude and longitude must be provided together', 'error');
        return;
      }
      if (lat != null && (!Number.isFinite(lat) || !Number.isFinite(lng))) {
        showNotification('Latitude/longitude must be valid numbers', 'error');
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
        showNotification('Saved', 'success');
      } catch (e) {
        console.error(e);
        showNotification('Failed to save settings', 'error');
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
        showNotification('Failed to update setting', 'error');
      }
    })();
  };

  const handleRecalculateHome = async () => {
    try {
      await recalculateHome();
      await refetch();
    } catch (e) {
      console.error(e);
      showNotification('Failed to recalculate home location', 'error');
    }
  };

  const handleResetMapView = () => {
    try {
      localStorage.removeItem(STORAGE_KEYS.mapView);
      showNotification('Map view reset', 'success');
    } catch {
      showNotification('Failed to reset map view', 'error');
    }
  };

  const handleResetDatabase = async () => {
    setResetWorking(true);
    try {
      await devResetDatabase({
        variables: { confirm: 'RESET_DB' },
      });

      // Token/user are now invalid because the DB was recreated.
      try {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      } catch {
        // ignore
      }

      showNotification('Database reset complete. Refreshing…', 'success', 2000);
      setResetOpen(false);
      setTimeout(() => window.location.reload(), 400);
    } catch (e) {
      console.error(e);
      showNotification(e?.message || 'Failed to reset database', 'error', 5000);
    } finally {
      setResetWorking(false);
    }
  };

  const computedCenter = useMemo(() => {
    const s = data?.projectSettings;
    if (s?.homeLat == null || s?.homeLng == null) return null;
    return { lat: s.homeLat, lng: s.homeLng };
  }, [data?.projectSettings]);

  return (
    <div style={{ padding: 16, color: '#e0e0e0', boxSizing: 'border-box', height: '100%', overflow: 'auto' }}>
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          duration={notification.duration}
          onClose={() => setNotification(null)}
        />
      )}
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

        <div style={{ background: '#1a1a1a', border: '1px solid #3a3a3a', borderRadius: 8, padding: 16 }}>
          <h3 style={{ margin: '0 0 10px 0' }}>AI</h3>

          <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={aiEnabled}
              onChange={(e) => setAiEnabled(e.target.checked)}
            />
            Enable AI features
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10, alignItems: 'center' }}>
            <label>LM Studio host</label>
            <input
              value={lmStudioBaseUrl}
              disabled={!aiEnabled}
              onChange={(e) => setLmStudioBaseUrl(e.target.value)}
              placeholder="http://127.0.0.1:1234"
              style={{ padding: 8, borderRadius: 6, border: '1px solid #444', background: '#111', color: '#eee' }}
            />

            <label>Default model</label>
            <input
              value={lmStudioModel}
              disabled={!aiEnabled}
              onChange={(e) => setLmStudioModel(e.target.value)}
              placeholder="(leave empty to require explicit model)"
              style={{ padding: 8, borderRadius: 6, border: '1px solid #444', background: '#111', color: '#eee' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button
              onClick={handleSaveAi}
              style={{ padding: '8px 12px', borderRadius: 6, border: 'none', background: 'rgba(40, 167, 69, 0.9)', color: 'white', cursor: 'pointer' }}
            >
              Save AI settings
            </button>

            <button
              onClick={handleRefreshModels}
              disabled={!aiEnabled}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #444', background: '#111', color: '#eee', cursor: aiEnabled ? 'pointer' : 'not-allowed' }}
            >
              {lmModelsLoading ? 'Loading models…' : 'Refresh models'}
            </button>

            <button
              onClick={handleVisionTest}
              disabled={!aiEnabled || !String(lmStudioModel || '').trim() || visionTestLoading}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #444',
                background: '#111',
                color: '#eee',
                cursor: !aiEnabled || visionTestLoading ? 'not-allowed' : 'pointer',
                opacity: !aiEnabled || visionTestLoading ? 0.6 : 1,
              }}
            >
              {visionTestLoading ? 'Testing…' : 'Test vision'}
            </button>
          </div>

          {lmStudioModelsOpen && (
            <div style={{ marginTop: 12 }}>
              {lmModelsError && <div style={{ color: '#b00020', marginBottom: 8 }}>Failed to load models: {lmModelsError.message}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10, alignItems: 'center' }}>
                <label>Available models</label>
                <select
                  value={lmStudioModel}
                  disabled={!aiEnabled}
                  onChange={(e) => setLmStudioModel(e.target.value)}
                  style={{ padding: 8, borderRadius: 6, border: '1px solid #444', background: '#111', color: '#eee' }}
                >
                  <option value="">(select)</option>
                  {(lmModelsData?.lmStudioModels || []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}{m.isVision ? ' (vision)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginTop: 8, color: '#888', fontSize: 12 }}>
                Models are listed from LM Studio’s /v1/models. “(vision)” uses LM Studio-reported capabilities when present, otherwise a best-effort model-id heuristic.
              </div>
            </div>
          )}

          <div style={{ marginTop: 10, color: '#888', fontSize: 12 }}>
            When disabled, AI buttons, history, and AI-derived helpers are hidden.
          </div>
        </div>

        {showDevTools && (
          <div style={{ background: '#1a1a1a', border: '1px solid #3a3a3a', borderRadius: 8, padding: 16 }}>
            <h3 style={{ margin: '0 0 10px 0' }}>Development</h3>

            <div style={{ color: '#b0b0b0', fontSize: 13, marginBottom: 10 }}>
              Resetting the database will remove all data and rerun migrations (demo users will be recreated). This is intended for local development only.
            </div>

            <button
              onClick={() => {
                setResetConfirmText('');
                setResetOpen(true);
              }}
              style={{ padding: '8px 12px', borderRadius: 6, border: 'none', background: 'rgba(220, 53, 69, 0.9)', color: 'white', cursor: 'pointer' }}
            >
              Reset database
            </button>
          </div>
        )}

      </div>

      <ConfirmModal
        isOpen={resetOpen}
        title="Reset database"
        message="This will delete ALL data in the database and recreate the schema. Use only for development."
        confirmLabel="Reset"
        cancelLabel="Cancel"
        danger
        confirmDisabled={String(resetConfirmText || '').trim().toUpperCase() !== 'RESET_DB'}
        confirmWorking={resetWorking}
        onCancel={() => (resetWorking ? null : setResetOpen(false))}
        onConfirm={handleResetDatabase}
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: '#b0b0b0', marginBottom: 6 }}>
            Type <span style={{ color: '#e0e0e0', fontWeight: 700 }}>RESET_DB</span> to confirm.
          </div>
          <input
            value={resetConfirmText}
            onChange={(e) => setResetConfirmText(e.target.value)}
            disabled={resetWorking}
            placeholder="RESET_DB"
            style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #444', background: '#111', color: '#eee' }}
          />
        </div>
      </ConfirmModal>
    </div>
  );
};

export default Settings;
