import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation } from '@apollo/client/react';
import {
  GET_IMAGE,
  GET_IMAGES,
  UPDATE_IMAGE,
  DELETE_IMAGE,
  ANALYZE_IMAGE,
  SET_IMAGE_AUTO_PRESENCE_IGNORES,
} from '../graphql/images';
import { formatMGRS, parseMGRS } from '../utils/coordinates';
import AssetLocationPickerModal from './AssetLocationPickerModal';
import AnnotationViewer from './AnnotationViewer';
import {
  GET_ANNOTATIONS,
  CREATE_ANNOTATION as ADD_ANNOTATION,
  DELETE_ANNOTATION,
  ADD_ANNOTATION_REGION as ADD_REGION,
} from '../graphql/annotations';
import { UPDATE_ANNOTATION } from './updateAnnotationMutation';

const toDatetimeLocalValue = (isoString) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';

  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

const fromDatetimeLocalValue = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

const AssetEditor = ({ assetId, onBack, readOnly = false }) => {
  const rootRef = useRef(null);
  const { loading, error, data, refetch } = useQuery(GET_IMAGE, {
    variables: { id: assetId },
    skip: !assetId,
    fetchPolicy: 'network-only',
  });

  const image = data?.image;

  useEffect(() => {
    // Ensure we always start at the top for a new asset.
    try {
      rootRef.current?.scrollTo?.({ top: 0, left: 0, behavior: 'instant' });
    } catch {
      if (rootRef.current) rootRef.current.scrollTop = 0;
    }
  }, [assetId]);

  const [displayName, setDisplayName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [altitude, setAltitude] = useState('');
  const [captureTimestamp, setCaptureTimestamp] = useState('');
  const [mgrsText, setMgrsText] = useState('');
  const [isPickingLocation, setIsPickingLocation] = useState(false);

  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const [updateImage] = useMutation(UPDATE_IMAGE, {
    refetchQueries: [{ query: GET_IMAGES }],
    awaitRefetchQueries: false,
  });

  const [deleteImage] = useMutation(DELETE_IMAGE, {
    refetchQueries: [{ query: GET_IMAGES }],
    awaitRefetchQueries: false,
  });

  const [analyzeImage] = useMutation(ANALYZE_IMAGE, {
    refetchQueries: [{ query: GET_IMAGES }],
    awaitRefetchQueries: false,
  });

  const [setAutoPresenceIgnores] = useMutation(SET_IMAGE_AUTO_PRESENCE_IGNORES);

  const { data: annotationsData, refetch: refetchAnnotations } = useQuery(GET_ANNOTATIONS, {
    variables: { assetId },
    skip: !assetId,
    fetchPolicy: 'network-only',
  });
  const [addAnnotation] = useMutation(ADD_ANNOTATION);
  const [addRegion] = useMutation(ADD_REGION);
  const [deleteAnnotation] = useMutation(DELETE_ANNOTATION);
  const [updateAnnotation] = useMutation(UPDATE_ANNOTATION);

  useEffect(() => {
    if (!image) return;
    setDisplayName(image.displayName || image.filename || '');
    setLatitude(image.latitude ?? '');
    setLongitude(image.longitude ?? '');
    setAltitude(image.altitude ?? '');
    setCaptureTimestamp(toDatetimeLocalValue(image.captureTimestamp));
  }, [image]);

  useEffect(() => {
    const lat = latitude === '' ? null : Number(latitude);
    const lng = longitude === '' ? null : Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setMgrsText('');
      return;
    }
    try {
      setMgrsText(formatMGRS(lng, lat));
    } catch {
      setMgrsText('');
    }
  }, [latitude, longitude]);

  const imageUrl = useMemo(() => {
    if (!image?.filePath) return null;
    return `${import.meta.env.VITE_API_URL}${image.filePath}`;
  }, [image?.filePath]);

  const linkedEntities = useMemo(() => {
    const anns = annotationsData?.annotations || [];
    const map = new Map();
    for (const ann of anns) {
      for (const link of ann?.entityLinks || []) {
        const ent = link?.entity;
        if (!link?.entityId) continue;
        if (!map.has(link.entityId)) {
          map.set(link.entityId, {
            id: link.entityId,
            displayName: ent?.displayName || link.entityId,
            entityType: ent?.entityType || null,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
  }, [annotationsData?.annotations]);

  const ignoredEntityIds = useMemo(() => {
    const raw = image?.metadata?.autoPresenceIgnoreEntityIds;
    if (!Array.isArray(raw)) return new Set();
    return new Set(raw.map((x) => String(x)));
  }, [image?.metadata]);

  const toggleIgnoredEntity = async (entityId, nextIgnored) => {
    if (readOnly) return;
    if (!assetId) return;
    const current = Array.from(ignoredEntityIds);
    const next = nextIgnored
      ? Array.from(new Set([...current, String(entityId)]))
      : current.filter((x) => x !== String(entityId));

    try {
      await setAutoPresenceIgnores({
        variables: {
          imageId: assetId,
          ignoredEntityIds: next,
        },
      });
      await refetch();
    } catch (e) {
      console.error(e);
      alert('Failed to update auto-presence ignore list.');
    }
  };

  const handleSave = async () => {
    if (readOnly) return;
    if (!assetId) return;

    setSaving(true);
    try {
      const lat = latitude === '' ? null : Number(latitude);
      const lng = longitude === '' ? null : Number(longitude);
      const alt = altitude === '' ? null : Number(altitude);

      if ((lat === null) !== (lng === null)) {
        alert('Both latitude and longitude must be provided together.');
        return;
      }

      await updateImage({
        variables: {
          id: assetId,
          input: {
            displayName: displayName === '' ? null : displayName,
            latitude: lat,
            longitude: lng,
            altitude: alt,
            captureTimestamp: fromDatetimeLocalValue(captureTimestamp),
          },
        },
      });

      await refetch();
      alert('Saved.');
    } catch (err) {
      console.error('Update image error:', err);
      alert(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (readOnly) return;
    if (!assetId) return;
    if (!window.confirm('Delete this image? This cannot be undone.')) return;

    try {
      await deleteImage({ variables: { id: assetId } });
      onBack?.();
    } catch (err) {
      console.error('Delete image error:', err);
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleAnalyze = async () => {
    if (readOnly) return;
    if (!assetId) return;

    setAnalyzing(true);
    try {
      await analyzeImage({ variables: { id: assetId, persist: true } });
      await refetch();
    } catch (err) {
      console.error('Analyze image error:', err);
      alert(`Analyze failed: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  if (!assetId) {
    return (
      <div style={{ padding: 16 }}>
        <button onClick={onBack}>Back</button>
        <div style={{ marginTop: 12 }}>No asset selected.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 16 }}>
        <button onClick={onBack}>Back</button>
        <div style={{ marginTop: 12 }}>Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <button onClick={onBack}>Back</button>
        <div style={{ marginTop: 12, color: '#b00020' }}>Error: {error.message}</div>
      </div>
    );
  }

  if (!image) {
    return (
      <div style={{ padding: 16 }}>
        <button onClick={onBack}>Back</button>
        <div style={{ marginTop: 12 }}>Image not found.</div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="asset-editor-root" style={{ padding: 16, color: '#e0e0e0', boxSizing: 'border-box' }}>
      <AssetLocationPickerModal
        isOpen={isPickingLocation}
        readOnly={readOnly}
        initialLat={latitude === '' ? null : Number(latitude)}
        initialLng={longitude === '' ? null : Number(longitude)}
        onClose={() => setIsPickingLocation(false)}
        onUse={(lat, lng) => {
          setLatitude(String(lat));
          setLongitude(String(lng));
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack} style={{ padding: '8px 12px' }}>← Back</button>

        <div style={{ display: 'flex', gap: 10 }}>
          {!readOnly && (
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              style={{
                padding: '8px 12px',
                background: analyzing ? '#6c757d' : 'rgba(0, 123, 255, 0.9)',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: analyzing ? 'not-allowed' : 'pointer',
              }}
            >
              {analyzing ? '⏳ Analyzing…' : '🧠 Analyze (LM Studio)'}
            </button>
          )}

          {!readOnly && (
            <button
              onClick={handleDelete}
              style={{
                padding: '8px 12px',
                background: 'rgba(220, 53, 69, 0.9)',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <h2 style={{ margin: '16px 0 8px 0' }}>Asset Editor</h2>

      <div className="asset-editor-grid">
        <div style={{ background: '#1a1a1a', border: '1px solid #3a3a3a', borderRadius: 8, overflow: 'hidden' }}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={image.displayName || image.filename}
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
          ) : (
            <div style={{ padding: 16 }}>No preview available</div>
          )}

          <div style={{ padding: 12, fontSize: 12, color: '#b0b0b0' }}>
            <div><strong>Filename:</strong> {image.filename}</div>
            <div><strong>Uploaded:</strong> {image.uploadedAt ? new Date(image.uploadedAt).toLocaleString() : 'Unknown'}</div>
            <div><strong>Type:</strong> {image.mimeType || 'Unknown'}</div>
            {image.aiAnalysis?.caption && (
              <div style={{ marginTop: 10 }}>
                <strong>AI Caption:</strong> {image.aiAnalysis.caption}
              </div>
            )}
            {image.aiAnalysis?.licensePlates?.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <strong>AI Plates:</strong> {image.aiAnalysis.licensePlates.join(', ')}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            background: '#1a1a1a',
            border: '1px solid #3a3a3a',
            borderRadius: 8,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            minHeight: 0,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10, alignItems: 'center' }}>
            <label>Name</label>
            <input
              value={displayName}
              disabled={readOnly}
              onChange={(e) => setDisplayName(e.target.value)}
              style={{ padding: 8, borderRadius: 6, border: '1px solid #444', background: '#111', color: '#eee' }}
            />

            <label>MGRS</label>
            <input
              value={mgrsText}
              disabled={readOnly}
              onChange={(e) => {
                const next = e.target.value;
                setMgrsText(next);
                const parsed = parseMGRS(next);
                if (parsed) {
                  setLatitude(String(parsed.latitude));
                  setLongitude(String(parsed.longitude));
                }
              }}
              placeholder="e.g. 35WLP 70743 01293"
              style={{ padding: 8, borderRadius: 6, border: '1px solid #444', background: '#111', color: '#eee' }}
            />

            <label>Capture time</label>
            <input
              type="datetime-local"
              value={captureTimestamp}
              disabled={readOnly}
              onChange={(e) => setCaptureTimestamp(e.target.value)}
              style={{ padding: 8, borderRadius: 6, border: '1px solid #444', background: '#111', color: '#eee' }}
            />

            <label>Latitude</label>
            <input
              value={latitude}
              disabled={readOnly}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="e.g. 60.1699"
              style={{ padding: 8, borderRadius: 6, border: '1px solid #444', background: '#111', color: '#eee' }}
            />

            <label>Longitude</label>
            <input
              value={longitude}
              disabled={readOnly}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="e.g. 24.9384"
              style={{ padding: 8, borderRadius: 6, border: '1px solid #444', background: '#111', color: '#eee' }}
            />

            <label>Set location</label>
            <button
              disabled={readOnly}
              onClick={() => setIsPickingLocation(true)}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: 'none',
                background: readOnly ? '#6c757d' : 'rgba(23, 162, 184, 0.9)',
                color: 'white',
                cursor: readOnly ? 'not-allowed' : 'pointer',
                justifySelf: 'start',
              }}
            >
              Pick on map…
            </button>

            <label>Altitude (m)</label>
            <input
              value={altitude}
              disabled={readOnly}
              onChange={(e) => setAltitude(e.target.value)}
              placeholder="Optional"
              style={{ padding: 8, borderRadius: 6, border: '1px solid #444', background: '#111', color: '#eee' }}
            />
          </div>

          {!readOnly && (
            <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '10px 14px',
                  background: saving ? '#6c757d' : 'rgba(40, 167, 69, 0.9)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}

          {readOnly && (
            <div style={{ marginTop: 16, color: '#b0b0b0', fontSize: 12 }}>
              Read-only role: editing disabled.
            </div>
          )}

          <div
            style={{
              marginTop: 16,
              borderTop: '1px solid #3a3a3a',
              paddingTop: 16,
              flex: '1 1 auto',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <h3 style={{ margin: '0 0 10px 0' }}>Annotations & Tags</h3>

            {linkedEntities.length > 0 && (
              <div style={{ marginBottom: 12, padding: 10, border: '1px solid #3a3a3a', borderRadius: 8, background: '#111' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Auto-presence from this image</div>
                <div style={{ color: '#999', fontSize: 12, marginBottom: 8 }}>
                  Entities linked in annotations can be used as presences (timeline). You can ignore specific entities for this asset.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {linkedEntities.map((ent) => {
                    const isIgnored = ignoredEntityIds.has(String(ent.id));
                    return (
                      <label key={ent.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: readOnly ? 'default' : 'pointer' }}>
                        <input
                          type="checkbox"
                          disabled={readOnly}
                          checked={!isIgnored}
                          onChange={(e) => toggleIgnoredEntity(ent.id, !e.target.checked)}
                        />
                        <span style={{ color: '#e0e0e0', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ent.displayName}
                        </span>
                        {isIgnored && <span style={{ color: '#ffb74d', fontSize: 12 }}>(ignored)</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div
              style={{
                flex: '1 1 auto',
                minHeight: 360,
                height: 'min(70vh, 720px)',
                border: '1px solid #3a3a3a',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <AnnotationViewer
                key={image.id}
                image={{
                  ...image,
                  filePath: imageUrl,
                }}
                annotations={annotationsData?.annotations || []}
                readOnly={readOnly}
                onRefetch={refetchAnnotations}
                onAnnotationCreate={async (input, opts) => {
                  if (opts && opts.edit && input.id) {
                    const result = await updateAnnotation({
                      variables: {
                        id: input.id,
                        input: {
                          title: input.title || '',
                          description: input.description,
                          tags: input.tags || [],
                        },
                      },
                    });
                    refetchAnnotations();
                    return { ...result.data.updateAnnotation, id: input.id };
                  }

                  const res = await addAnnotation({
                    variables: {
                      input: {
                        assetId: image.id,
                        title: '',
                        description: input.description,
                        tags: input.tags || [],
                      },
                    },
                  });
                  const annotationId = res.data.createAnnotation.id;
                  await addRegion({
                    variables: {
                      annotationId,
                      input: { shapeType: input.shapeType, coordinates: input.coordinates, style: input.style },
                    },
                  });
                  refetchAnnotations();
                }}
                onAnnotationDelete={async (annotationId) => {
                  if (!annotationId) return;
                  if (!window.confirm('Delete this annotation and all its regions?')) return;
                  await deleteAnnotation({ variables: { id: annotationId } });
                  refetchAnnotations();
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssetEditor;
