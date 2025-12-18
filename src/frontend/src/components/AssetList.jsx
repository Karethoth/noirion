import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useApolloClient } from '@apollo/client/react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { GET_IMAGES, DELETE_IMAGE, ANALYZE_IMAGE, UPDATE_IMAGE } from '../graphql/images';
import {
  ANALYZE_ANNOTATION_DRAFT,
  CREATE_ANNOTATION,
  UPDATE_ANNOTATION,
  LINK_VEHICLE_PLATE_TO_ANNOTATION,
} from '../graphql/annotations';
import TagPickerModal from './TagPickerModal';
import { GET_PRESENCES } from '../graphql/presences';
import { GET_ENTITIES } from '../graphql/entities';
import Notification from './Notification';
import ConfirmModal from './ConfirmModal';
import ImageUpload from './ImageUpload';
import { useAiConfig } from '../utils/aiConfig';
import { LEAFLET_DEFAULT_MARKER_ICON_URLS } from '../utils/externalUrls';

// Fix for default markers in react-leaflet (same approach as ImageMap)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions(LEAFLET_DEFAULT_MARKER_ICON_URLS);

const AssetList = ({ readOnly = false, onEdit = null }) => {
  const { enabled: aiEnabled, model: aiModel } = useAiConfig();
  const apolloClient = useApolloClient();
  const { loading, error, data, refetch } = useQuery(GET_IMAGES, {
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
  });

  const [query, setQuery] = useState('');
  const [tagFilterRaw, setTagFilterRaw] = useState('');
  const [showPreview, setShowPreview] = useState(() => {
    try {
      return localStorage.getItem('assetListShowPreview') === '1';
    } catch {
      return false;
    }
  });

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkWorking, setBulkWorking] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);

  const [notification, setNotification] = useState(null);
  const showNotification = (message, type = 'info', duration = 3000) => {
    setNotification({ message, type, duration });
  };

  const [confirmState, setConfirmState] = useState(null); // { title, message, confirmLabel, danger, action: async () => void }
  const [confirmWorking, setConfirmWorking] = useState(false);

  const closeConfirm = () => {
    if (confirmWorking) return;
    setConfirmState(null);
  };

  const runConfirmedAction = async () => {
    if (!confirmState?.action) {
      setConfirmState(null);
      return;
    }
    setConfirmWorking(true);
    try {
      await confirmState.action();
    } finally {
      setConfirmWorking(false);
      setConfirmState(null);
    }
  };

  const [presenceApprovalQueue, setPresenceApprovalQueue] = useState([]);
  const [presenceApprovalIndex, setPresenceApprovalIndex] = useState(0);
  const [presenceApprovalRows, setPresenceApprovalRows] = useState([]);
  const [presenceApprovalWorking, setPresenceApprovalWorking] = useState(false);
  const [presenceApprovalError, setPresenceApprovalError] = useState('');

  const [presenceApprovalView, setPresenceApprovalView] = useState('image'); // 'image' | 'map'
  const [presenceApprovalZoom, setPresenceApprovalZoom] = useState(1);
  const [presenceApprovalPan, setPresenceApprovalPan] = useState({ x: 0, y: 0 });
  const [presenceApprovalPanning, setPresenceApprovalPanning] = useState(false);
  const [presenceApprovalPanStart, setPresenceApprovalPanStart] = useState(null);

  const [deleteImage] = useMutation(DELETE_IMAGE, {
    refetchQueries: [{ query: GET_IMAGES }],
    awaitRefetchQueries: false,
  });

  const [analyzeImage] = useMutation(ANALYZE_IMAGE);
  const [updateImage] = useMutation(UPDATE_IMAGE, {
    refetchQueries: [{ query: GET_IMAGES }],
    awaitRefetchQueries: false,
  });

  const [analyzeAnnotationDraft] = useMutation(ANALYZE_ANNOTATION_DRAFT);
  const [createAnnotation] = useMutation(CREATE_ANNOTATION);
  const [updateAnnotation] = useMutation(UPDATE_ANNOTATION);
  const [linkVehiclePlateToAnnotation] = useMutation(LINK_VEHICLE_PLATE_TO_ANNOTATION);

  const assets = useMemo(() => data?.images || [], [data?.images]);

  const tagFilterTokens = useMemo(() => {
    return (tagFilterRaw || '')
      .split(/[\s,]+/g)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => x.toLowerCase());
  }, [tagFilterRaw]);

  function getTagsForImage(img) {
    const tags = (img.annotations || [])
      .flatMap((a) => a?.tags || [])
      .filter(Boolean)
      .map((t) => String(t));
    return Array.from(new Set(tags));
  }

  const formatTag = (tag) => {
    if (!tag) return '';
    const t = String(tag);
    return t.startsWith('general:') ? t.slice(8) : t;
  };

  const normalizePlate = (p) => {
    if (typeof p !== 'string') return null;
    let cleaned = p.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    for (const prefix of ['FIN', 'SF', 'SWE', 'EST', 'EU']) {
      if (cleaned.startsWith(prefix)) {
        const rest = cleaned.slice(prefix.length);
        const looksLikePlate = /[0-9]/.test(rest) && /[A-Z]/.test(rest) && rest.length >= 4;
        if (looksLikePlate) cleaned = rest;
      }
    }
    return cleaned || null;
  };

  const buildPresenceRows = (plates) => {
    const list = Array.isArray(plates) ? plates : [];
    return list.map((p, idx) => ({
      id: `${idx}-${p}`,
      selected: true,
      plate: p,
      confidence: 0.7,
      notes: `Auto: license plate ${p}`,
    }));
  };

  const computeTagCounts = (imgs) => {
    const counts = new Map();
    for (const img of imgs || []) {
      const uniq = new Set(getTagsForImage(img).map((t) => String(t)));
      for (const t of uniq) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    return counts;
  };

  const tagCounts = useMemo(() => computeTagCounts(assets), [assets]);
  const topTags = useMemo(() => {
    const entries = Array.from(tagCounts.entries());
    entries.sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
    return entries.map(([tag, count]) => ({ tag, count }));
  }, [tagCounts]);

  const makePunchyName = (caption) => {
    if (!caption) return '';
    let s = String(caption).trim();

    // Prefer the first sentence/clause.
    s = s.split(/\.|\n|\r|\t|;|\|/)[0].trim();

    // Strip common leading filler.
    s = s.replace(/^\s*(a|an|the)\s+/i, '');
    s = s.replace(/^\s*(this is|this looks like|it looks like|image of|photo of)\s+/i, '');

    // Remove trailing punctuation.
    s = s.replace(/[\s\-–—:]+$/, '').replace(/[.!,;:]+$/, '').trim();

    // Hard cap length.
    const maxLen = 60;
    if (s.length > maxLen) {
      s = s.slice(0, maxLen);
      s = s.replace(/\s+\S*$/, '').trim();
    }

    return s;
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return assets.filter((img) => {
      const tags = getTagsForImage(img);
      const tagText = tags.join(' ').toLowerCase();

      if (tagFilterTokens.length > 0) {
        const imageTagsLower = tags.map((t) => String(t).toLowerCase());
        const matchesTag = tagFilterTokens.some((needle) =>
          imageTagsLower.some((t) => t.includes(needle))
        );
        if (!matchesTag) return false;
      }

      if (!q) return true;

      const name = (img.displayName || img.filename || '').toLowerCase();
      const file = (img.filename || '').toLowerCase();
      const aiCaption = aiEnabled ? (img.aiAnalysis?.caption || '').toLowerCase() : '';
      const aiPlates = aiEnabled ? (img.aiAnalysis?.licensePlates || []).join(' ').toLowerCase() : '';

      return (
        name.includes(q) ||
        file.includes(q) ||
        tagText.includes(q) ||
        aiCaption.includes(q) ||
        aiPlates.includes(q)
      );
    });
  }, [assets, query, tagFilterTokens, aiEnabled]);

  const selectedCount = selectedIds.size;
  const filteredIds = useMemo(() => new Set(filtered.map((x) => String(x.id))), [filtered]);
  const selectedInFilteredCount = useMemo(() => {
    let count = 0;
    for (const id of selectedIds) {
      if (filteredIds.has(String(id))) count += 1;
    }
    return count;
  }, [filteredIds, selectedIds]);

  const isAllFilteredSelected = filtered.length > 0 && selectedInFilteredCount === filtered.length;

  const toggleSelected = (id, nextChecked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const sid = String(id);
      if (nextChecked) next.add(sid);
      else next.delete(sid);
      return next;
    });
  };

  const setSelectAllFiltered = (checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const img of filtered) next.add(String(img.id));
      } else {
        for (const img of filtered) next.delete(String(img.id));
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (readOnly) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setConfirmState({
      title: 'Delete assets',
      message: `Delete ${ids.length} selected asset(s)? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
      action: async () => {
        setBulkWorking(true);
        setBulkStatus('Deleting…');
        try {
          for (let i = 0; i < ids.length; i += 1) {
            setBulkStatus(`Deleting ${i + 1}/${ids.length}…`);
            // eslint-disable-next-line no-await-in-loop
            await deleteImage({ variables: { id: ids[i] } });
          }
          await refetch();
          setSelectedIds(new Set());
          setBulkStatus('Deleted.');
          showNotification(`Deleted ${ids.length} asset(s)`, 'success');
        } catch (e) {
          console.error(e);
          showNotification(`Bulk delete failed: ${e.message}`, 'error');
        } finally {
          setBulkWorking(false);
          setTimeout(() => setBulkStatus(''), 1200);
        }
      },
    });
  };

  const handleBulkAiRename = async () => {
    if (!aiEnabled) {
      showNotification('AI features are disabled in Settings', 'info');
      return;
    }
    if (readOnly) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setConfirmState({
      title: 'AI rename assets',
      message: `AI rename ${ids.length} selected asset(s)? This will overwrite Display Name.`,
      confirmLabel: 'Rename',
      danger: false,
      action: async () => {
        setBulkWorking(true);
        setBulkStatus('Analyzing…');
        try {
          for (let i = 0; i < ids.length; i += 1) {
            const id = ids[i];
            setBulkStatus(`Analyzing ${i + 1}/${ids.length}…`);
            // eslint-disable-next-line no-await-in-loop
            const res = await analyzeImage({ variables: { id, model: aiModel || null, persist: true } });
            const caption = (res?.data?.analyzeImage?.caption || '').trim();
            if (!caption) continue;

            const punchy = makePunchyName(caption);
            const nextName = punchy || caption.slice(0, 60);
            // eslint-disable-next-line no-await-in-loop
            await updateImage({
              variables: {
                id,
                input: {
                  displayName: nextName,
                },
              },
            });
          }

          await refetch();
          setBulkStatus('Renamed.');
          showNotification(`AI renamed ${ids.length} asset(s)`, 'success');
        } catch (e) {
          console.error(e);
          showNotification(`Bulk AI rename failed: ${e.message}`, 'error');
        } finally {
          setBulkWorking(false);
          setTimeout(() => setBulkStatus(''), 1200);
        }
      },
    });
  };

  const handleBulkAiTags = async () => {
    if (!aiEnabled) {
      showNotification('AI features are disabled in Settings', 'info');
      return;
    }
    if (readOnly) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setConfirmState({
      title: 'Generate AI tags',
      message: `Generate tags (AI) for ${ids.length} selected asset(s)? This will add tags to an annotation for each image.`,
      confirmLabel: 'Generate tags',
      danger: false,
      action: async () => {
        const byId = new Map((assets || []).map((x) => [String(x.id), x]));

        setBulkWorking(true);
        setBulkStatus('Tagging…');
        try {
          const approvals = [];
          for (let i = 0; i < ids.length; i += 1) {
            const id = String(ids[i]);
            const img = byId.get(id);
            const w = Number(img?.width);
            const h = Number(img?.height);
            if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
              continue;
            }

            setBulkStatus(`Tagging ${i + 1}/${ids.length}…`);

            // eslint-disable-next-line no-await-in-loop
            const resp = await analyzeAnnotationDraft({
              variables: {
                assetId: id,
                input: {
                  shapeType: 'BOX',
                  coordinates: { x: 0, y: 0, width: w, height: h },
                  style: null,
                },
                model: aiModel || null,
              },
            });

            const analysis = resp?.data?.analyzeAnnotationDraft || null;
            const aiTags = (analysis?.tags || [])
              .map((t) => (typeof t === 'string' ? t.trim() : null))
              .filter(Boolean);

            const plates = Array.from(
              new Set(
                (analysis?.licensePlates || [])
                  .map(normalizePlate)
                  .filter(Boolean)
              )
            );

            // Prioritize plates: add plate tags even if AI tags are empty.
            const plateTags = plates.flatMap((p) => [`license_plate:${p}`, `vehicle:${p}`]);
            const tags = Array.from(new Set([...aiTags, ...plateTags]));
            if (tags.length === 0) continue;

            const existingAnnotations = img?.annotations || [];
            const targetAnn = existingAnnotations[0] || null;
            if (targetAnn?.id) {
              const existingTags = (targetAnn?.tags || []).filter(Boolean);
              const merged = Array.from(new Set([...existingTags, ...tags]));
              // eslint-disable-next-line no-await-in-loop
              await updateAnnotation({
                variables: {
                  id: targetAnn.id,
                  input: {
                    tags: merged,
                  },
                },
              });

              const hasCoords = Number.isFinite(Number(img?.latitude)) && Number.isFinite(Number(img?.longitude));
              if (plates.length > 0 && hasCoords) {
                approvals.push({ assetId: id, annotationId: targetAnn.id, plates });
              }
            } else {
              // eslint-disable-next-line no-await-in-loop
              const created = await createAnnotation({
                variables: {
                  input: {
                    assetId: id,
                    title: 'AI tags',
                    tags,
                  },
                },
              });

              const annId = created?.data?.createAnnotation?.id;
              const hasCoords = Number.isFinite(Number(img?.latitude)) && Number.isFinite(Number(img?.longitude));
              if (annId && plates.length > 0 && hasCoords) {
                approvals.push({ assetId: id, annotationId: annId, plates });
              }
            }
          }

          await refetch();
          setBulkStatus('Tagged.');
          showNotification(`Generated tags for ${ids.length} asset(s)`, 'success');

          if (approvals.length > 0) {
            setPresenceApprovalQueue(approvals);
            setPresenceApprovalIndex(0);
            setPresenceApprovalRows(buildPresenceRows(approvals[0]?.plates || []));
            setPresenceApprovalView('image');
            setPresenceApprovalZoom(1);
            setPresenceApprovalPan({ x: 0, y: 0 });
            setPresenceApprovalPanning(false);
            setPresenceApprovalPanStart(null);
            setPresenceApprovalError('');
          }
        } catch (e) {
          console.error(e);
          showNotification(`Bulk AI tag failed: ${e.message}`, 'error');
        } finally {
          setBulkWorking(false);
          setTimeout(() => setBulkStatus(''), 1200);
        }
      },
    });
  };

  const assetPreviewUrl = (img) => {
    if (!img?.filePath) return null;
    return `${import.meta.env.VITE_API_URL}${img.filePath}`;
  };

  const currentApproval = presenceApprovalQueue[presenceApprovalIndex] || null;
  const currentApprovalImage = useMemo(() => {
    if (!currentApproval?.assetId) return null;
    return (assets || []).find((x) => String(x.id) === String(currentApproval.assetId)) || null;
  }, [assets, currentApproval?.assetId]);

  const closePresenceApproval = () => {
    setPresenceApprovalQueue([]);
    setPresenceApprovalIndex(0);
    setPresenceApprovalRows([]);
    setPresenceApprovalWorking(false);
    setPresenceApprovalError('');
    setPresenceApprovalView('image');
    setPresenceApprovalZoom(1);
    setPresenceApprovalPan({ x: 0, y: 0 });
    setPresenceApprovalPanning(false);
    setPresenceApprovalPanStart(null);
  };

  const goToNextApproval = () => {
    const nextIndex = presenceApprovalIndex + 1;
    if (nextIndex >= presenceApprovalQueue.length) {
      closePresenceApproval();
      return;
    }
    const next = presenceApprovalQueue[nextIndex];
    setPresenceApprovalIndex(nextIndex);
    setPresenceApprovalRows(buildPresenceRows(next?.plates || []));
    setPresenceApprovalWorking(false);
    setPresenceApprovalError('');
    setPresenceApprovalView('image');
    setPresenceApprovalZoom(1);
    setPresenceApprovalPan({ x: 0, y: 0 });
    setPresenceApprovalPanning(false);
    setPresenceApprovalPanStart(null);
  };

  const handleApprovePresence = async () => {
    if (readOnly) return;
    if (!currentApproval?.annotationId) {
      goToNextApproval();
      return;
    }

    const selectedRows = (presenceApprovalRows || []).filter((r) => r?.selected);
    if (selectedRows.length === 0) {
      goToNextApproval();
      return;
    }

    setPresenceApprovalWorking(true);
    setPresenceApprovalError('');
    try {
      for (const row of selectedRows) {
        const plate = normalizePlate(row?.plate);
        if (!plate) continue;
        // eslint-disable-next-line no-await-in-loop
        await linkVehiclePlateToAnnotation({
          variables: {
            annotationId: currentApproval.annotationId,
            plate,
            relationType: 'observed',
            confidence: Number.isFinite(Number(row?.confidence)) ? Number(row.confidence) : 0.7,
            notes: typeof row?.notes === 'string' ? row.notes : `Auto: license plate ${plate}`,
          },
        });
      }

      try {
        await apolloClient.refetchQueries({ include: [GET_PRESENCES, GET_ENTITIES] });
      } catch {
        // ignore
      }

      goToNextApproval();
    } catch (e) {
      console.error(e);
      setPresenceApprovalError(e?.message || 'Failed to link presence entities');
      setPresenceApprovalWorking(false);
    }
  };

  if (loading && assets.length === 0) {
    return <div style={{ padding: 16 }}>Loading…</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ color: '#b00020' }}>Error: {error.message}</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, color: '#e0e0e0', height: '100%', overflow: 'auto', boxSizing: 'border-box' }}>
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          duration={notification.duration}
          onClose={() => setNotification(null)}
        />
      )}

      <ConfirmModal
        isOpen={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        danger={!!confirmState?.danger}
        confirmWorking={confirmWorking}
        onCancel={closeConfirm}
        onConfirm={runConfirmedAction}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0 }}>Assets</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {!readOnly && (
            <ImageUpload
              onUploaded={(uploaded) => {
                if (!uploaded?.id) return;
                if (typeof onEdit === 'function') onEdit(uploaded.id);
              }}
            />
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#b0b0b0', fontSize: 12 }}>
            <input
              type="checkbox"
              checked={showPreview}
              onChange={(e) => {
                const next = e.target.checked;
                setShowPreview(next);
                try {
                  localStorage.setItem('assetListShowPreview', next ? '1' : '0');
                } catch {
                  // ignore
                }
              }}
            />
            Preview
          </label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search filename, tags…"
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid #444',
              background: '#111',
              color: '#eee',
              width: 240,
            }}
          />
          <input
            value={tagFilterRaw}
            readOnly
            onClick={() => setIsTagModalOpen(true)}
            onFocus={() => setIsTagModalOpen(true)}
            placeholder="Filter tags…"
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid #444',
              background: '#111',
              color: '#eee',
              width: 180,
            }}
          />
          <button
            onClick={() => refetch()}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #444', background: '#111', color: '#eee' }}
          >
            Refresh
          </button>
        </div>
      </div>

      <TagPickerModal
        isOpen={isTagModalOpen}
        title="Filter by tags"
        value={tagFilterRaw}
        onChange={setTagFilterRaw}
        tagsWithCounts={topTags}
        placeholder="tag1, tag2"
        onClose={() => setIsTagModalOpen(false)}
      />

      {presenceApprovalQueue.length > 0 && currentApproval && (
        <div className="timeline-modal-overlay" onClick={closePresenceApproval}>
          <div
            className="timeline-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(1100px, 96vw)' }}
          >
            <div className="timeline-modal-header">
              <div className="timeline-modal-title">
                Approve presence ({presenceApprovalIndex + 1}/{presenceApprovalQueue.length})
              </div>
              <button className="timeline-modal-close" onClick={closePresenceApproval} aria-label="Close">
                ×
              </button>
            </div>
            <div className="timeline-modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'min(520px, 48vw) 1fr', gap: 14, alignItems: 'start' }}>
                <div
                  style={{
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: 'rgba(255, 255, 255, 0.03)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: 10, borderBottom: '1px solid rgba(255, 255, 255, 0.12)' }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        className={presenceApprovalView === 'image' ? 'timeline-primary' : 'timeline-secondary'}
                        disabled={presenceApprovalWorking}
                        onClick={() => setPresenceApprovalView('image')}
                      >
                        Image
                      </button>
                      <button
                        className={presenceApprovalView === 'map' ? 'timeline-primary' : 'timeline-secondary'}
                        disabled={presenceApprovalWorking}
                        onClick={() => setPresenceApprovalView('map')}
                      >
                        Map
                      </button>
                    </div>
                    {presenceApprovalView === 'image' && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div className="timeline-muted" style={{ fontSize: 12 }}>
                          Zoom: {Math.round(presenceApprovalZoom * 100)}%
                        </div>
                        <button
                          className="timeline-secondary"
                          disabled={presenceApprovalWorking}
                          onClick={() => {
                            setPresenceApprovalZoom(1);
                            setPresenceApprovalPan({ x: 0, y: 0 });
                            setPresenceApprovalPanning(false);
                            setPresenceApprovalPanStart(null);
                          }}
                        >
                          Reset
                        </button>
                      </div>
                    )}
                  </div>

                  <div style={{ height: 'min(62vh, 620px)' }}>
                    {presenceApprovalView === 'image' && currentApprovalImage && (
                      <div
                        style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative', overscrollBehavior: 'contain' }}
                        onWheelCapture={(e) => {
                          // Zoom with mouse wheel
                          e.preventDefault();
                          e.stopPropagation();
                          const delta = e.deltaY;
                          setPresenceApprovalZoom((prev) => {
                            const next = delta > 0 ? prev / 1.12 : prev * 1.12;
                            return Math.max(1, Math.min(6, next));
                          });
                        }}
                        onWheel={(e) => {
                          // Defensive: prevent scroll chaining in browsers that don't honor capture.
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onMouseDown={(e) => {
                          if (presenceApprovalWorking) return;
                          if (presenceApprovalZoom <= 1) return;
                          setPresenceApprovalPanning(true);
                          setPresenceApprovalPanStart({ x: e.clientX, y: e.clientY });
                        }}
                        onMouseMove={(e) => {
                          if (!presenceApprovalPanning) return;
                          if (!presenceApprovalPanStart) return;
                          const dx = e.clientX - presenceApprovalPanStart.x;
                          const dy = e.clientY - presenceApprovalPanStart.y;
                          setPresenceApprovalPanStart({ x: e.clientX, y: e.clientY });
                          setPresenceApprovalPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
                        }}
                        onMouseUp={() => {
                          setPresenceApprovalPanning(false);
                          setPresenceApprovalPanStart(null);
                        }}
                        onMouseLeave={() => {
                          setPresenceApprovalPanning(false);
                          setPresenceApprovalPanStart(null);
                        }}
                      >
                        <img
                          src={assetPreviewUrl(currentApprovalImage)}
                          alt={currentApprovalImage.displayName || currentApprovalImage.filename}
                          draggable={false}
                          style={{
                            width: '100%',
                            height: 'auto',
                            display: 'block',
                            transform: `translate(${presenceApprovalPan.x}px, ${presenceApprovalPan.y}px) scale(${presenceApprovalZoom})`,
                            transformOrigin: 'center center',
                            cursor: presenceApprovalZoom > 1 ? (presenceApprovalPanning ? 'grabbing' : 'grab') : 'default',
                            userSelect: 'none',
                          }}
                        />
                      </div>
                    )}

                    {presenceApprovalView === 'map' && (
                      <div style={{ width: '100%', height: '100%' }}>
                        {Number.isFinite(Number(currentApprovalImage?.latitude)) && Number.isFinite(Number(currentApprovalImage?.longitude)) ? (
                          <MapContainer
                            center={[Number(currentApprovalImage.latitude), Number(currentApprovalImage.longitude)]}
                            zoom={15}
                            style={{ width: '100%', height: '100%' }}
                            scrollWheelZoom
                          >
                            <TileLayer
                              attribution='&copy; OpenStreetMap contributors'
                              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />
                            <Marker position={[Number(currentApprovalImage.latitude), Number(currentApprovalImage.longitude)]} />
                          </MapContainer>
                        ) : (
                          <div className="timeline-muted" style={{ padding: 12 }}>
                            No coordinates for this image.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="timeline-muted" style={{ marginBottom: 10 }}>
                    Detected license plates. Approve to link a vehicle entity to this image (auto-presence will be created from the image timestamp + coordinates).
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>
                      {currentApprovalImage?.displayName || currentApprovalImage?.filename || currentApproval.assetId}
                    </div>
                    <div className="timeline-muted" style={{ fontSize: 12 }}>
                      Time: {currentApprovalImage?.captureTimestamp || currentApprovalImage?.uploadedAt || '(unknown)'}
                      {' • '}
                      Coords: {Number.isFinite(Number(currentApprovalImage?.latitude)) ? Number(currentApprovalImage.latitude).toFixed(6) : '—'}, {Number.isFinite(Number(currentApprovalImage?.longitude)) ? Number(currentApprovalImage.longitude).toFixed(6) : '—'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600 }}>Presences</div>
                    <button
                      className="timeline-secondary"
                      disabled={presenceApprovalWorking}
                      onClick={() => {
                        setPresenceApprovalRows((prev) => {
                          const next = Array.isArray(prev) ? [...prev] : [];
                          next.push({
                            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                            selected: true,
                            plate: '',
                            confidence: 0.7,
                            notes: 'Auto: license plate',
                          });
                          return next;
                        });
                      }}
                    >
                      Add plate
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
                    {(presenceApprovalRows || []).map((row) => (
                      <div
                        key={row.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '24px 1fr 110px',
                          gap: 10,
                          alignItems: 'center',
                          padding: 10,
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          borderRadius: 8,
                          background: 'rgba(255, 255, 255, 0.03)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={!!row.selected}
                          disabled={presenceApprovalWorking}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setPresenceApprovalRows((prev) => (prev || []).map((r) => (r.id === row.id ? { ...r, selected: checked } : r)));
                          }}
                        />

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                          <input
                            value={row.plate}
                            disabled={presenceApprovalWorking}
                            onChange={(e) => {
                              const nextPlate = e.target.value;
                              setPresenceApprovalRows((prev) => (prev || []).map((r) => (r.id === row.id ? { ...r, plate: nextPlate } : r)));
                            }}
                            placeholder="Plate (e.g. ABC-123)"
                            style={{
                              padding: 8,
                              borderRadius: 6,
                              border: '1px solid rgba(255, 255, 255, 0.18)',
                              background: 'rgba(0, 0, 0, 0.25)',
                              color: '#e0e0e0',
                              fontFamily: 'monospace',
                              width: '100%',
                              boxSizing: 'border-box',
                            }}
                          />
                          <input
                            value={row.notes}
                            disabled={presenceApprovalWorking}
                            onChange={(e) => {
                              const nextNotes = e.target.value;
                              setPresenceApprovalRows((prev) => (prev || []).map((r) => (r.id === row.id ? { ...r, notes: nextNotes } : r)));
                            }}
                            placeholder="Notes"
                            style={{
                              padding: 8,
                              borderRadius: 6,
                              border: '1px solid rgba(255, 255, 255, 0.18)',
                              background: 'rgba(0, 0, 0, 0.25)',
                              color: '#e0e0e0',
                              width: '100%',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
                          <div className="timeline-muted" style={{ fontSize: 12 }}>
                            Confidence
                          </div>
                          <input
                            type="number"
                            min={0}
                            max={1}
                            step={0.05}
                            value={Number.isFinite(Number(row.confidence)) ? row.confidence : 0.7}
                            disabled={presenceApprovalWorking}
                            onChange={(e) => {
                              const next = e.target.value;
                              setPresenceApprovalRows((prev) => (prev || []).map((r) => (r.id === row.id ? { ...r, confidence: next } : r)));
                            }}
                            style={{
                              padding: 8,
                              borderRadius: 6,
                              border: '1px solid rgba(255, 255, 255, 0.18)',
                              background: 'rgba(0, 0, 0, 0.25)',
                              color: '#e0e0e0',
                              width: '100%',
                              boxSizing: 'border-box',
                            }}
                          />
                          <button
                            className="timeline-secondary"
                            disabled={presenceApprovalWorking}
                            onClick={() => {
                              setPresenceApprovalRows((prev) => (prev || []).filter((r) => r.id !== row.id));
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {presenceApprovalError && (
                    <div style={{ color: '#dc3545', marginBottom: 10 }}>{presenceApprovalError}</div>
                  )}

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    <button className="timeline-secondary" disabled={presenceApprovalWorking} onClick={goToNextApproval}>
                      Skip
                    </button>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button className="timeline-secondary" disabled={presenceApprovalWorking} onClick={closePresenceApproval}>
                        Stop
                      </button>
                      <button
                        className="timeline-primary"
                        disabled={presenceApprovalWorking || (presenceApprovalRows || []).filter((r) => r?.selected).length === 0 || readOnly}
                        onClick={handleApprovePresence}
                      >
                        {presenceApprovalWorking ? 'Linking…' : 'Approve'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ color: '#b0b0b0', fontSize: 12 }}>
          {selectedCount > 0 ? (
            <span>
              Selected: <strong style={{ color: '#e0e0e0' }}>{selectedCount}</strong>
              {selectedInFilteredCount !== selectedCount ? ` (in view: ${selectedInFilteredCount})` : ''}
            </span>
          ) : (
            <span>No selection</span>
          )}
          {bulkStatus ? <span style={{ marginLeft: 10 }}>{bulkStatus}</span> : null}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {aiEnabled && (
            <button
              disabled={readOnly || selectedCount === 0 || bulkWorking}
              onClick={handleBulkAiRename}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: 'none',
                background: readOnly || selectedCount === 0 || bulkWorking ? '#6c757d' : 'rgba(0, 123, 255, 0.9)',
                color: 'white',
                cursor: readOnly || selectedCount === 0 || bulkWorking ? 'not-allowed' : 'pointer',
              }}
              title={readOnly ? 'Read-only role' : 'Analyze and set Display Name from AI caption'}
            >
              🧠 AI rename selected
            </button>
          )}

          {aiEnabled && (
            <button
              disabled={readOnly || selectedCount === 0 || bulkWorking}
              onClick={handleBulkAiTags}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: 'none',
                background: readOnly || selectedCount === 0 || bulkWorking ? '#6c757d' : 'rgba(23, 162, 184, 0.9)',
                color: 'white',
                cursor: readOnly || selectedCount === 0 || bulkWorking ? 'not-allowed' : 'pointer',
              }}
              title={readOnly ? 'Read-only role' : 'Generate tags using AI (full image) and apply to an annotation'}
            >
              🏷️ AI tag selected
            </button>
          )}

          <button
            disabled={readOnly || selectedCount === 0 || bulkWorking}
            onClick={handleBulkDelete}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: 'none',
              background: readOnly || selectedCount === 0 || bulkWorking ? '#6c757d' : 'rgba(220, 53, 69, 0.9)',
              color: 'white',
              cursor: readOnly || selectedCount === 0 || bulkWorking ? 'not-allowed' : 'pointer',
            }}
            title={readOnly ? 'Read-only role' : 'Delete selected assets'}
          >
            🗑️ Delete selected
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12, border: '1px solid #3a3a3a', borderRadius: 8, overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '42px 1.5fr 1fr 1fr 120px',
            padding: '10px 12px',
            background: '#2a2a2a',
            borderBottom: '1px solid #3a3a3a',
            fontSize: 12,
            color: '#b0b0b0',
          }}
        >
          <div>
            <input
              type="checkbox"
              checked={isAllFilteredSelected}
              disabled={filtered.length === 0}
              onChange={(e) => setSelectAllFiltered(e.target.checked)}
              title="Select all in current view"
            />
          </div>
          <div>Name</div>
          <div>Uploaded</div>
          <div>Location</div>
          <div style={{ textAlign: 'right' }}>Actions</div>
        </div>

        {filtered.map((img) => {
          const name = img.displayName || img.filename;
          const tags = getTagsForImage(img).slice(0, 8);
          const moreTagCount = Math.max(0, getTagsForImage(img).length - tags.length);
          const loc = (img.latitude != null && img.longitude != null)
            ? `${Number(img.latitude).toFixed(5)}, ${Number(img.longitude).toFixed(5)}`
            : '—';

          return (
            <div
              key={img.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '42px 1.5fr 1fr 1fr 120px',
                padding: '10px 12px',
                borderBottom: '1px solid #262626',
                alignItems: 'center',
              }}
            >
              <div>
                <input
                  type="checkbox"
                  checked={selectedIds.has(String(img.id))}
                  onChange={(e) => toggleSelected(img.id, e.target.checked)}
                  aria-label={`Select ${name}`}
                />
              </div>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                  {showPreview && (
                    <img
                      src={assetPreviewUrl(img) || ''}
                      alt={name}
                      loading="lazy"
                      style={{
                        width: 54,
                        height: 54,
                        borderRadius: 6,
                        objectFit: 'cover',
                        background: '#111',
                        border: '1px solid #333',
                        flex: '0 0 auto',
                      }}
                      onError={(e) => {
                        // Avoid broken image icon.
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                    {tags.length > 0 && (
                      <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {tags.map((t) => (
                          <span
                            key={t}
                            title={t}
                            style={{
                              fontSize: 11,
                              color: '#cfcfcf',
                              padding: '2px 6px',
                              borderRadius: 999,
                              border: '1px solid #333',
                              background: 'rgba(255,255,255,0.04)',
                              maxWidth: 180,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {formatTag(t)}
                          </span>
                        ))}
                        {moreTagCount > 0 && (
                          <span style={{ fontSize: 11, color: '#a0a0a0' }}>+{moreTagCount}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ color: '#b0b0b0', fontSize: 12 }}>
                {img.uploadedAt ? new Date(img.uploadedAt).toLocaleString() : '—'}
              </div>
              <div style={{ color: '#b0b0b0', fontSize: 12 }}>{loc}</div>
              <div style={{ textAlign: 'right' }}>
                <button
                  onClick={() => {
                    if (typeof onEdit === 'function') onEdit(img.id);
                  }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'rgba(23, 162, 184, 0.9)',
                    color: 'white',
                    cursor: 'pointer',
                  }}
                >
                  Edit
                </button>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div style={{ padding: 12, color: '#b0b0b0' }}>No assets yet.</div>
        )}
      </div>

      {readOnly && (
        <div style={{ marginTop: 10, color: '#b0b0b0', fontSize: 12 }}>
          Read-only role: editing disabled.
        </div>
      )}
    </div>
  );
};

export default AssetList;
