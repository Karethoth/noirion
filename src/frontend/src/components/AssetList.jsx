import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useApolloClient } from '@apollo/client/react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  GET_IMAGES,
  DELETE_IMAGE,
  ANALYZE_IMAGE,
  UPDATE_IMAGE,
  SUGGEST_IMAGE_LOCATION_INTERPOLATIONS,
} from '../graphql/images';
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
import { initLeafletDefaultMarkerIcons } from '../utils/leafletInit';
import { parseTagTokens, formatTagDisplay } from '../utils/tagTokens';
import { normalizePlate } from '../utils/licensePlates';
import { buildAssetUrl } from '../utils/assetUrls';
import { formatMGRS } from '../utils/coordinates';

initLeafletDefaultMarkerIcons();

const SELECTED_LOCATION_ICON = (() => {
  // Use an inline SVG pin so the user-selected location is visually distinct.
  // Color chosen to match the app's existing "info" tone (#17a2b8).
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="25" height="41" viewBox="0 0 25 41">
  <path d="M12.5 0C5.6 0 0 5.6 0 12.5 0 22.2 12.5 41 12.5 41S25 22.2 25 12.5C25 5.6 19.4 0 12.5 0z" fill="#17a2b8"/>
  <circle cx="12.5" cy="12.5" r="5.5" fill="#ffffff"/>
</svg>`;
  const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  return L.icon({
    iconUrl: url,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    shadowSize: [41, 41],
    shadowAnchor: [12, 41],
  });
})();

function toMgrs(lat, lng) {
  const nlat = Number(lat);
  const nlng = Number(lng);
  if (!Number.isFinite(nlat) || !Number.isFinite(nlng)) return '—';
  try {
    return formatMGRS(nlng, nlat);
  } catch {
    return '—';
  }
}

function getTagsForImage(img) {
  const tags = (img?.annotations || [])
    .flatMap((a) => a?.tags || [])
    .filter(Boolean)
    .map((t) => String(t));
  return Array.from(new Set(tags));
}

function InterpolationMapPicker({ disabled, onPick }) {
  useMapEvents({
    click: (e) => {
      if (disabled) return;
      const lat = Number(e?.latlng?.lat);
      const lng = Number(e?.latlng?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      onPick({ lat, lng });
    },
  });
  return null;
}

function ZoomableImagePreviewModal({
  isOpen,
  title,
  images,
  activeIndex,
  onChangeIndex,
  onClose,
}) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [panStart, setPanStart] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setScale(1);
    setPan({ x: 0, y: 0 });
    setPanning(false);
    setPanStart(null);
  }, [isOpen, activeIndex]);

  if (!isOpen) return null;

  const safeImages = Array.isArray(images) ? images : [];
  const current = safeImages[activeIndex] || null;
  const canPrev = safeImages.some((x, idx) => idx < activeIndex && x?.src);
  const canNext = safeImages.some((x, idx) => idx > activeIndex && x?.src);

  const goPrev = () => {
    for (let i = activeIndex - 1; i >= 0; i -= 1) {
      if (safeImages[i]?.src) {
        onChangeIndex(i);
        return;
      }
    }
  };

  const goNext = () => {
    for (let i = activeIndex + 1; i < safeImages.length; i += 1) {
      if (safeImages[i]?.src) {
        onChangeIndex(i);
        return;
      }
    }
  };

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const zoomBy = (delta) => {
    setScale((prev) => clamp(prev + delta, 0.25, 8));
  };

  return (
    <div
      className="timeline-modal-overlay"
      onClick={onClose}
      style={{ zIndex: 2500 }}
    >
      <div
        className="timeline-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(1100px, 96vw)', zIndex: 2501 }}
      >
        <div className="timeline-modal-header">
          <div className="timeline-modal-title">{title || 'Preview'}</div>
          <button className="timeline-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="timeline-modal-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {safeImages.map((im, idx) => (
                <button
                  key={im?.key || String(idx)}
                  type="button"
                  className={idx === activeIndex ? 'timeline-primary' : 'timeline-secondary'}
                  disabled={!im?.src}
                  onClick={() => onChangeIndex(idx)}
                  title={im?.label || 'Image'}
                >
                  {im?.label || `#${idx + 1}`}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" className="timeline-secondary" disabled={!canPrev} onClick={goPrev}>Prev</button>
              <button type="button" className="timeline-secondary" disabled={!canNext} onClick={goNext}>Next</button>
              <button type="button" className="timeline-secondary" onClick={() => zoomBy(-0.25)}>-</button>
              <div className="timeline-muted" style={{ fontSize: 12 }}>Zoom: {Math.round(scale * 100)}%</div>
              <button type="button" className="timeline-secondary" onClick={() => zoomBy(0.25)}>+</button>
              <button
                type="button"
                className="timeline-secondary"
                onClick={() => {
                  setScale(1);
                  setPan({ x: 0, y: 0 });
                  setPanning(false);
                  setPanStart(null);
                }}
              >
                Reset
              </button>
            </div>
          </div>

          <div
            style={{
              height: 'min(70vh, 700px)',
              border: '1px solid #3a3a3a',
              borderRadius: 8,
              overflow: 'hidden',
              background: '#0e0e0e',
              position: 'relative',
              cursor: panning ? 'grabbing' : 'grab',
            }}
            onWheel={(e) => {
              e.preventDefault();
              const dir = e.deltaY > 0 ? -1 : 1;
              zoomBy(0.15 * dir);
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              setPanning(true);
              setPanStart({ x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y });
            }}
            onMouseMove={(e) => {
              if (!panning || !panStart) return;
              const dx = e.clientX - panStart.x;
              const dy = e.clientY - panStart.y;
              setPan({ x: panStart.panX + dx, y: panStart.panY + dy });
            }}
            onMouseUp={() => {
              setPanning(false);
              setPanStart(null);
            }}
            onMouseLeave={() => {
              setPanning(false);
              setPanStart(null);
            }}
          >
            {current?.src ? (
              <img
                src={current.src}
                alt={current.alt || current.label || 'Preview'}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: `translate(${pan.x}px, ${pan.y}px) translate(-50%, -50%) scale(${scale})`,
                  transformOrigin: 'center center',
                  maxWidth: 'none',
                  maxHeight: 'none',
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
                draggable={false}
              />
            ) : (
              <div className="timeline-muted" style={{ padding: 12 }}>No preview available.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

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

  const [sortKey, setSortKey] = useState('uploadedAt'); // name | uploadedAt | captureTimestamp | location
  const [sortDir, setSortDir] = useState('desc'); // asc | desc

  const [notification, setNotification] = useState(null);
  const showNotification = (message, type = 'info', duration = 3000) => {
    setNotification({ message, type, duration });
  };

  const [confirmState, setConfirmState] = useState(null); // { title, message, confirmLabel, danger, action: async () => void }
  const [confirmWorking, setConfirmWorking] = useState(false);

  const [interpPreviewOpen, setInterpPreviewOpen] = useState(false);
  const [interpPreviewIndex, setInterpPreviewIndex] = useState(1);

  const [locationInterpolationQueue, setLocationInterpolationQueue] = useState([]);
  const [locationInterpolationIndex, setLocationInterpolationIndex] = useState(0);
  const [locationInterpolationWorking, setLocationInterpolationWorking] = useState(false);
  const [locationInterpolationError, setLocationInterpolationError] = useState('');
  const [locationInterpolationDraft, setLocationInterpolationDraft] = useState({ imageId: null, latitude: null, longitude: null });

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

  const assetPreviewUrl = (img) => {
    return buildAssetUrl(img?.filePath);
  };

  const assetsById = useMemo(() => new Map((assets || []).map((x) => [String(x.id), x])), [assets]);
  const currentLocationInterpolation = useMemo(() => {
    return (locationInterpolationQueue || [])[locationInterpolationIndex] || null;
  }, [locationInterpolationIndex, locationInterpolationQueue]);

  const interpPreviewImages = useMemo(() => {
    const current = currentLocationInterpolation;
    if (!current?.imageId) return [];
    const prev = assetsById.get(String(current.prevImageId));
    const img = assetsById.get(String(current.imageId));
    const next = assetsById.get(String(current.nextImageId));
    return [
      {
        key: 'prev',
        label: 'Previous',
        id: prev?.id || null,
        src: assetPreviewUrl(prev),
        alt: prev?.displayName || prev?.filename || 'Previous',
      },
      {
        key: 'cur',
        label: 'Current',
        id: img?.id || null,
        src: assetPreviewUrl(img),
        alt: img?.displayName || img?.filename || 'Current',
      },
      {
        key: 'next',
        label: 'Next',
        id: next?.id || null,
        src: assetPreviewUrl(next),
        alt: next?.displayName || next?.filename || 'Next',
      },
    ];
  }, [assetPreviewUrl, assetsById, currentLocationInterpolation]);

  useEffect(() => {
    const current = currentLocationInterpolation;
    if (!current?.imageId) {
      setLocationInterpolationDraft({ imageId: null, latitude: null, longitude: null });
      return;
    }

    const same = String(locationInterpolationDraft?.imageId || '') === String(current.imageId);
    if (same) return;

    const lat = Number(current.proposedLatitude);
    const lng = Number(current.proposedLongitude);
    setLocationInterpolationDraft({
      imageId: String(current.imageId),
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
    });
  }, [currentLocationInterpolation, locationInterpolationDraft?.imageId]);

  const tagFilterTokens = useMemo(() => {
    return parseTagTokens(tagFilterRaw);
  }, [tagFilterRaw]);

  const formatTag = formatTagDisplay;

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

  const tagCounts = useMemo(() => {
    const counts = new Map();
    for (const img of assets || []) {
      const uniq = new Set(getTagsForImage(img).map((t) => String(t)));
      for (const t of uniq) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    return counts;
  }, [assets]);
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

  const sortedFiltered = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;

    const getName = (img) => String(img?.displayName || img?.filename || '').toLowerCase();
    const getUploadedAt = (img) => {
      const t = img?.uploadedAt ? new Date(img.uploadedAt).getTime() : NaN;
      return Number.isFinite(t) ? t : null;
    };
    const getCaptureTs = (img) => {
      const t = img?.captureTimestamp ? new Date(img.captureTimestamp).getTime() : NaN;
      return Number.isFinite(t) ? t : null;
    };
    const getLat = (img) => {
      const v = Number(img?.latitude);
      return Number.isFinite(v) ? v : null;
    };
    const getLng = (img) => {
      const v = Number(img?.longitude);
      return Number.isFinite(v) ? v : null;
    };

    const compareNullableNumber = (a, b) => {
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return a - b;
    };

    const cmp = (a, b) => {
      if (sortKey === 'name') {
        return getName(a).localeCompare(getName(b)) || String(a?.id || '').localeCompare(String(b?.id || ''));
      }

      if (sortKey === 'uploadedAt') {
        return (
          compareNullableNumber(getUploadedAt(a), getUploadedAt(b)) ||
          getName(a).localeCompare(getName(b)) ||
          String(a?.id || '').localeCompare(String(b?.id || ''))
        );
      }

      if (sortKey === 'captureTimestamp') {
        return (
          compareNullableNumber(getCaptureTs(a), getCaptureTs(b)) ||
          compareNullableNumber(getUploadedAt(a), getUploadedAt(b)) ||
          getName(a).localeCompare(getName(b)) ||
          String(a?.id || '').localeCompare(String(b?.id || ''))
        );
      }

      if (sortKey === 'location') {
        return (
          compareNullableNumber(getLat(a), getLat(b)) ||
          compareNullableNumber(getLng(a), getLng(b)) ||
          compareNullableNumber(getCaptureTs(a), getCaptureTs(b)) ||
          getName(a).localeCompare(getName(b)) ||
          String(a?.id || '').localeCompare(String(b?.id || ''))
        );
      }

      return getName(a).localeCompare(getName(b)) || String(a?.id || '').localeCompare(String(b?.id || ''));
    };

    const list = [...filtered];
    list.sort((a, b) => dir * cmp(a, b));
    return list;
  }, [filtered, sortDir, sortKey]);

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
            const res = await analyzeImage({ variables: { id, model: aiModel || null, persist: true } });
            const caption = (res?.data?.analyzeImage?.caption || '').trim();
            if (!caption) continue;

            const punchy = makePunchyName(caption);
            const nextName = punchy || caption.slice(0, 60);
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
              await updateAnnotation({
                variables: {
                  id: targetAnn.id,
                  input: {
                    tags: merged,
                  },
                },
              });

              const hasCoords =
                (Number.isFinite(Number(img?.subjectLatitude)) && Number.isFinite(Number(img?.subjectLongitude))) ||
                (Number.isFinite(Number(img?.latitude)) && Number.isFinite(Number(img?.longitude)));
              if (plates.length > 0 && hasCoords) {
                approvals.push({ assetId: id, annotationId: targetAnn.id, plates });
              }
            } else {
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
              const hasCoords =
                (Number.isFinite(Number(img?.subjectLatitude)) && Number.isFinite(Number(img?.subjectLongitude))) ||
                (Number.isFinite(Number(img?.latitude)) && Number.isFinite(Number(img?.longitude)));
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

  const startLocationInterpolation = async () => {
    if (readOnly) return;
    const ids = Array.from(selectedIds).map(String);
    if (ids.length === 0) return;

    setBulkWorking(true);
    setBulkStatus('Checking interpolation suggestions…');
    try {
      const resp = await apolloClient.query({
        query: SUGGEST_IMAGE_LOCATION_INTERPOLATIONS,
        variables: { maxMinutes: null },
        fetchPolicy: 'network-only',
      });

      const suggestions = (resp?.data?.suggestImageLocationInterpolations || []).filter((s) => ids.includes(String(s?.imageId)));
      if (suggestions.length === 0) {
        showNotification('No interpolation suggestions found for selected assets', 'info');
        return;
      }

      // Deterministic order: oldest first (fallback to imageId)
      const ordered = [...suggestions].sort((a, b) => {
        const ta = a?.captureTimestamp ? new Date(a.captureTimestamp).getTime() : 0;
        const tb = b?.captureTimestamp ? new Date(b.captureTimestamp).getTime() : 0;
        if (ta !== tb) return ta - tb;
        return String(a?.imageId || '').localeCompare(String(b?.imageId || ''));
      });

      setLocationInterpolationError('');
      setLocationInterpolationQueue(ordered);
      setLocationInterpolationIndex(0);
      showNotification(`Found ${ordered.length} asset(s) to interpolate`, 'info', 1800);
    } catch (e) {
      console.error(e);
      showNotification(`Failed to get interpolation suggestions: ${e.message}`, 'error');
    } finally {
      setBulkWorking(false);
      setTimeout(() => setBulkStatus(''), 1200);
    }
  };

  const closeLocationInterpolation = () => {
    if (locationInterpolationWorking) return;
    setLocationInterpolationQueue([]);
    setLocationInterpolationIndex(0);
    setLocationInterpolationError('');
  };

  const goToNextLocationInterpolation = () => {
    if (locationInterpolationWorking) return;
    const nextIndex = locationInterpolationIndex + 1;
    setLocationInterpolationError('');
    if (nextIndex >= (locationInterpolationQueue || []).length) {
      closeLocationInterpolation();
      refetch();
      return;
    }
    setLocationInterpolationIndex(nextIndex);
  };

  const applyLocationInterpolation = async () => {
    if (readOnly) return;
    const current = (locationInterpolationQueue || [])[locationInterpolationIndex] || null;
    if (!current?.imageId) return;

    const draftOk = String(locationInterpolationDraft?.imageId || '') === String(current.imageId);
    const lat = draftOk ? Number(locationInterpolationDraft?.latitude) : Number(current.proposedLatitude);
    const lng = draftOk ? Number(locationInterpolationDraft?.longitude) : Number(current.proposedLongitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setLocationInterpolationError('Invalid interpolated coordinates');
      return;
    }

    setLocationInterpolationWorking(true);
    setLocationInterpolationError('');
    try {
      await updateImage({
        variables: {
          id: String(current.imageId),
          input: {
            latitude: lat,
            longitude: lng,
          },
        },
      });

      goToNextLocationInterpolation();
    } catch (e) {
      console.error(e);
      setLocationInterpolationError(e?.message || 'Failed to apply interpolated location');
    } finally {
      setLocationInterpolationWorking(false);
    }
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

      <ZoomableImagePreviewModal
        isOpen={interpPreviewOpen}
        title="Interpolation preview"
        images={interpPreviewImages}
        activeIndex={interpPreviewIndex}
        onChangeIndex={setInterpPreviewIndex}
        onClose={() => setInterpPreviewOpen(false)}
      />

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

      <ConfirmModal
        isOpen={(locationInterpolationQueue || []).length > 0 && locationInterpolationIndex < (locationInterpolationQueue || []).length}
        title={`Interpolate location (${locationInterpolationIndex + 1}/${(locationInterpolationQueue || []).length})`}
        message={'Interpolated location based on nearby photos. Click the map to pick the final location, then Accept to fill GPS or Ignore to skip.'}
        confirmLabel={'Accept'}
        cancelLabel={'Ignore'}
        confirmWorking={locationInterpolationWorking}
        confirmDisabled={readOnly}
        onCancel={goToNextLocationInterpolation}
        onConfirm={applyLocationInterpolation}
      >
        {(() => {
          const current = (locationInterpolationQueue || [])[locationInterpolationIndex] || null;
          if (!current) return null;
          const img = assetsById.get(String(current.imageId));
          const prev = assetsById.get(String(current.prevImageId));
          const next = assetsById.get(String(current.nextImageId));
          const fmtTs = (ts) => {
            if (!ts) return '—';
            try {
              return new Date(ts).toLocaleString();
            } catch {
              return String(ts);
            }
          };
          const name = (img?.displayName || img?.filename || String(current.imageId));

          const draftOk = String(locationInterpolationDraft?.imageId || '') === String(current.imageId);
          const draftLat = draftOk ? Number(locationInterpolationDraft?.latitude) : Number(current.proposedLatitude);
          const draftLng = draftOk ? Number(locationInterpolationDraft?.longitude) : Number(current.proposedLongitude);
          const hasDraft = Number.isFinite(draftLat) && Number.isFinite(draftLng);

          const suggestedLat = Number(current.proposedLatitude);
          const suggestedLng = Number(current.proposedLongitude);
          const hasSuggested = Number.isFinite(suggestedLat) && Number.isFinite(suggestedLng);

          const suggestedMgrs = hasSuggested ? toMgrs(suggestedLat, suggestedLng) : '—';
          const selectedMgrs = hasDraft ? toMgrs(draftLat, draftLng) : '—';

          const currentUrl = assetPreviewUrl(img);
          const prevUrl = assetPreviewUrl(prev);
          const nextUrl = assetPreviewUrl(next);

          const hasPrev = Number.isFinite(Number(current?.prevLatitude)) && Number.isFinite(Number(current?.prevLongitude));
          const hasNext = Number.isFinite(Number(current?.nextLatitude)) && Number.isFinite(Number(current?.nextLongitude));
          const points = [];
          if (hasPrev) points.push([Number(current.prevLatitude), Number(current.prevLongitude)]);
          if (hasSuggested) points.push([suggestedLat, suggestedLng]);
          if (hasNext) points.push([Number(current.nextLatitude), Number(current.nextLongitude)]);
          const bounds = (() => {
            if (points.length === 0) return null;
            let minLat = points[0][0];
            let maxLat = points[0][0];
            let minLng = points[0][1];
            let maxLng = points[0][1];
            for (const [lat, lng] of points) {
              minLat = Math.min(minLat, lat);
              maxLat = Math.max(maxLat, lat);
              minLng = Math.min(minLng, lng);
              maxLng = Math.max(maxLng, lng);
            }
            if (hasDraft) {
              minLat = Math.min(minLat, draftLat);
              maxLat = Math.max(maxLat, draftLat);
              minLng = Math.min(minLng, draftLng);
              maxLng = Math.max(maxLng, draftLng);
            }
            if (minLat === maxLat) {
              minLat -= 0.0005;
              maxLat += 0.0005;
            }
            if (minLng === maxLng) {
              minLng -= 0.0005;
              maxLng += 0.0005;
            }
            return [[minLat, minLng], [maxLat, maxLng]];
          })();

          return (
            <div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{name}</div>
                <div className="timeline-muted" style={{ fontSize: 12 }}>
                  Camera: {current.cameraMake || '—'} {current.cameraModel || ''}
                </div>
                <div className="timeline-muted" style={{ fontSize: 12 }}>
                  Time: {fmtTs(current.captureTimestamp)}
                </div>
                <div className="timeline-muted" style={{ fontSize: 12 }}>
                  Suggested (MGRS): <span style={{ fontFamily: 'monospace' }}>{suggestedMgrs}</span>
                </div>
                <div className="timeline-muted" style={{ fontSize: 12 }}>
                  Selected (MGRS): <span style={{ fontFamily: 'monospace' }}>{selectedMgrs}</span>
                </div>
                <div className="timeline-muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Bracket span: {current.spanMinutes != null ? `${Number(current.spanMinutes).toFixed(1)} min` : '—'}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div style={{ padding: 10, border: '1px solid #3a3a3a', borderRadius: 8, background: '#111' }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Previous</div>
                  <div className="timeline-muted" style={{ fontSize: 12, marginBottom: 6 }}>
                    {prev?.displayName || prev?.filename || current.prevImageId || '—'}
                  </div>
                  {prevUrl ? (
                    <button
                      type="button"
                      title="Open zoomable preview"
                      onClick={() => {
                        setInterpPreviewIndex(0);
                        setInterpPreviewOpen(true);
                      }}
                      style={{
                        padding: 0,
                        border: 'none',
                        background: 'transparent',
                        width: '100%',
                        cursor: prev?.id ? 'pointer' : 'default',
                      }}
                    >
                      <img
                        src={prevUrl}
                        alt="Previous"
                        style={{ width: '100%', height: 130, objectFit: 'cover', borderRadius: 6, border: '1px solid #262626' }}
                      />
                    </button>
                  ) : (
                    <div className="timeline-muted" style={{ fontSize: 12 }}>No preview</div>
                  )}
                </div>
                <div style={{ padding: 10, border: '1px solid #3a3a3a', borderRadius: 8, background: '#111' }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Current</div>
                  <div className="timeline-muted" style={{ fontSize: 12, marginBottom: 6 }}>
                    {img?.displayName || img?.filename || current.imageId || '—'}
                  </div>
                  {currentUrl ? (
                    <button
                      type="button"
                      title="Open zoomable preview"
                      onClick={() => {
                        setInterpPreviewIndex(1);
                        setInterpPreviewOpen(true);
                      }}
                      style={{
                        padding: 0,
                        border: 'none',
                        background: 'transparent',
                        width: '100%',
                        cursor: img?.id ? 'pointer' : 'default',
                      }}
                    >
                      <img
                        src={currentUrl}
                        alt="Current"
                        style={{ width: '100%', height: 130, objectFit: 'cover', borderRadius: 6, border: '1px solid #262626' }}
                      />
                    </button>
                  ) : (
                    <div className="timeline-muted" style={{ fontSize: 12 }}>No preview</div>
                  )}
                </div>
                <div style={{ padding: 10, border: '1px solid #3a3a3a', borderRadius: 8, background: '#111' }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Next</div>
                  <div className="timeline-muted" style={{ fontSize: 12, marginBottom: 6 }}>
                    {next?.displayName || next?.filename || current.nextImageId || '—'}
                  </div>
                  {nextUrl ? (
                    <button
                      type="button"
                      title="Open zoomable preview"
                      onClick={() => {
                        setInterpPreviewIndex(2);
                        setInterpPreviewOpen(true);
                      }}
                      style={{
                        padding: 0,
                        border: 'none',
                        background: 'transparent',
                        width: '100%',
                        cursor: next?.id ? 'pointer' : 'default',
                      }}
                    >
                      <img
                        src={nextUrl}
                        alt="Next"
                        style={{ width: '100%', height: 130, objectFit: 'cover', borderRadius: 6, border: '1px solid #262626' }}
                      />
                    </button>
                  ) : (
                    <div className="timeline-muted" style={{ fontSize: 12 }}>No preview</div>
                  )}
                </div>
              </div>

              {bounds && (
                <div style={{ marginBottom: 10, border: '1px solid #3a3a3a', borderRadius: 8, overflow: 'hidden', background: '#111' }}>
                  <div style={{ padding: 10, borderBottom: '1px solid #3a3a3a', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 600 }}>Map preview</div>
                    <div className="timeline-muted" style={{ fontSize: 12 }}>Click map to set Selected</div>
                  </div>
                  <div style={{ height: 220, width: '100%' }}>
                    <MapContainer
                      key={`interp-${String(current.imageId)}-${String(draftLat)}-${String(draftLng)}`}
                      bounds={bounds}
                      style={{ height: '100%', width: '100%' }}
                      scrollWheelZoom
                    >
                      <TileLayer
                        attribution='&copy; OpenStreetMap contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />

                      <InterpolationMapPicker
                        disabled={readOnly || locationInterpolationWorking}
                        onPick={({ lat, lng }) => {
                          setLocationInterpolationDraft({ imageId: String(current.imageId), latitude: lat, longitude: lng });
                        }}
                      />

                      {points.length >= 2 ? <Polyline positions={points} /> : null}

                      {hasPrev ? (
                        <Marker position={[Number(current.prevLatitude), Number(current.prevLongitude)]}>
                          <Popup>
                            Previous
                            <div style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 6 }}>{toMgrs(current.prevLatitude, current.prevLongitude)}</div>
                          </Popup>
                        </Marker>
                      ) : null}

                      {hasSuggested ? (
                        <Marker position={[suggestedLat, suggestedLng]}>
                          <Popup>
                            Suggested (interpolation)
                            <div style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 6 }}>{suggestedMgrs}</div>
                          </Popup>
                        </Marker>
                      ) : null}

                      {hasDraft ? (
                        <Marker
                          draggable={!readOnly && !locationInterpolationWorking}
                          position={[draftLat, draftLng]}
                          icon={SELECTED_LOCATION_ICON}
                          eventHandlers={{
                            dragend: (e) => {
                              try {
                                const ll = e?.target?.getLatLng?.();
                                const nlat = Number(ll?.lat);
                                const nlng = Number(ll?.lng);
                                setLocationInterpolationDraft({
                                  imageId: String(current.imageId),
                                  latitude: Number.isFinite(nlat) ? nlat : null,
                                  longitude: Number.isFinite(nlng) ? nlng : null,
                                });
                              } catch {
                                // ignore
                              }
                            },
                          }}
                        >
                          <Popup>
                            Selected
                            <div className="timeline-muted" style={{ fontSize: 12, marginTop: 6 }}>Click/drag to adjust</div>
                            <div style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 6 }}>{selectedMgrs}</div>
                          </Popup>
                        </Marker>
                      ) : null}

                      {hasNext ? (
                        <Marker position={[Number(current.nextLatitude), Number(current.nextLongitude)]}>
                          <Popup>
                            Next
                            <div style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 6 }}>{toMgrs(current.nextLatitude, current.nextLongitude)}</div>
                          </Popup>
                        </Marker>
                      ) : null}
                    </MapContainer>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div style={{ padding: 10, border: '1px solid #3a3a3a', borderRadius: 8, background: '#111' }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Previous (known GPS)</div>
                  <div className="timeline-muted" style={{ fontSize: 12, marginBottom: 4 }}>
                    {prev?.displayName || prev?.filename || current.prevImageId || '—'}
                  </div>
                  <div className="timeline-muted" style={{ fontSize: 12, marginBottom: 4 }}>{fmtTs(current.prevCaptureTimestamp)}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{toMgrs(current.prevLatitude, current.prevLongitude)}</div>
                </div>
                <div style={{ padding: 10, border: '1px solid #3a3a3a', borderRadius: 8, background: '#111' }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Next (known GPS)</div>
                  <div className="timeline-muted" style={{ fontSize: 12, marginBottom: 4 }}>
                    {next?.displayName || next?.filename || current.nextImageId || '—'}
                  </div>
                  <div className="timeline-muted" style={{ fontSize: 12, marginBottom: 4 }}>{fmtTs(current.nextCaptureTimestamp)}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{toMgrs(current.nextLatitude, current.nextLongitude)}</div>
                </div>
              </div>

              {locationInterpolationError ? (
                <div style={{ color: '#dc3545', marginBottom: 10 }}>{locationInterpolationError}</div>
              ) : null}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="timeline-secondary" disabled={locationInterpolationWorking} onClick={closeLocationInterpolation}>
                  Stop
                </button>
              </div>
            </div>
          );
        })()}
      </ConfirmModal>

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

          <button
            disabled={readOnly || selectedCount === 0 || bulkWorking || locationInterpolationWorking}
            onClick={startLocationInterpolation}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: 'none',
              background: readOnly || selectedCount === 0 || bulkWorking || locationInterpolationWorking ? '#6c757d' : 'rgba(40, 167, 69, 0.9)',
              color: 'white',
              cursor: readOnly || selectedCount === 0 || bulkWorking || locationInterpolationWorking ? 'not-allowed' : 'pointer',
            }}
            title={readOnly ? 'Read-only role' : 'Interpolate missing GPS for selected assets'}
          >
            📍 Interpolate GPS
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12, border: '1px solid #3a3a3a', borderRadius: 8, overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '42px 1.5fr 1fr 1fr 1fr 120px',
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
          {(() => {
            const headerButtonStyle = {
              width: '100%',
              textAlign: 'left',
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              font: 'inherit',
              padding: 0,
              cursor: 'pointer',
            };

            const sortIndicator = (key) => {
              if (sortKey !== key) return '';
              return sortDir === 'asc' ? ' ▲' : ' ▼';
            };

            const toggleSort = (key) => {
              if (sortKey === key) {
                setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
              } else {
                setSortKey(key);
                setSortDir('asc');
              }
            };

            return (
              <>
                <div>
                  <button type="button" style={headerButtonStyle} onClick={() => toggleSort('name')} title="Sort by name">
                    Name{sortIndicator('name')}
                  </button>
                </div>
                <div>
                  <button type="button" style={headerButtonStyle} onClick={() => toggleSort('uploadedAt')} title="Sort by upload time">
                    Uploaded{sortIndicator('uploadedAt')}
                  </button>
                </div>
                <div>
                  <button type="button" style={headerButtonStyle} onClick={() => toggleSort('captureTimestamp')} title="Sort by capture time">
                    Taken{sortIndicator('captureTimestamp')}
                  </button>
                </div>
                <div>
                  <button type="button" style={headerButtonStyle} onClick={() => toggleSort('location')} title="Sort by location (MGRS display)">
                    Location{sortIndicator('location')}
                  </button>
                </div>
              </>
            );
          })()}
          <div style={{ textAlign: 'right' }}>Actions</div>
        </div>

        {sortedFiltered.map((img) => {
          const name = img.displayName || img.filename;
          const tags = getTagsForImage(img).slice(0, 8);
          const moreTagCount = Math.max(0, getTagsForImage(img).length - tags.length);
          const loc = (img.latitude != null && img.longitude != null)
            ? toMgrs(img.latitude, img.longitude)
            : '—';

          return (
            <div
              key={img.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '42px 1.5fr 1fr 1fr 1fr 120px',
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
              <div style={{ color: '#b0b0b0', fontSize: 12 }}>
                {img.captureTimestamp ? new Date(img.captureTimestamp).toLocaleString() : '—'}
              </div>
              <div style={{ color: '#b0b0b0', fontSize: 12, fontFamily: loc === '—' ? undefined : 'monospace' }}>{loc}</div>
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
