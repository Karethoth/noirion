import React, { useEffect, useState, useCallback } from 'react';
import { useQuery, useMutation } from '@apollo/client/react';
import { formatMGRS } from '../utils/coordinates';
import AnnotationViewer from './AnnotationViewer';
import Notification from './Notification';
import { UPDATE_ANNOTATION } from './updateAnnotationMutation';
import { ANALYZE_IMAGE } from '../graphql/images';
import { useApolloClient } from '@apollo/client/react';
import { useAiConfig } from '../utils/aiConfig';
import {
  GET_ANNOTATIONS,
  CREATE_ANNOTATION as ADD_ANNOTATION,
  DELETE_ANNOTATION,
  ADD_ANNOTATION_REGION as ADD_REGION,
  LINK_VEHICLE_PLATE_TO_ANNOTATION,
} from '../graphql/annotations';
import { GET_PRESENCES } from '../graphql/presences';
import { normalizePlate } from '../utils/licensePlates';
import { buildAssetUrl } from '../utils/assetUrls';


const ImageModal = ({ image, isOpen, onClose, readOnly = false, onEditDetails = null }) => {
  const { enabled: aiEnabled, model: aiModel } = useAiConfig();
  const apolloClient = useApolloClient();
  const { data, refetch } = useQuery(GET_ANNOTATIONS, {
    variables: { assetId: image?.id },
    skip: !image,
    fetchPolicy: 'network-only',
  });
  const [addAnnotation] = useMutation(ADD_ANNOTATION);
  const [addRegion] = useMutation(ADD_REGION);
  const [deleteAnnotation] = useMutation(DELETE_ANNOTATION);
  const [updateAnnotation] = useMutation(UPDATE_ANNOTATION);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeImage] = useMutation(ANALYZE_IMAGE);
  const [linkVehiclePlateToAnnotation] = useMutation(LINK_VEHICLE_PLATE_TO_ANNOTATION);

  const [notification, setNotification] = useState(null);
  const showNotification = useCallback((message, type = 'info', duration = 3000) => {
    setNotification({ message, type, duration });
  }, []);

  const [presencePrompt, setPresencePrompt] = useState(null); // { annotationId, plates: string[] }
  const [presencePromptSelected, setPresencePromptSelected] = useState([]);
  const [presencePromptWorking, setPresencePromptWorking] = useState(false);

  // When annotations change, select the first by default if none selected
  useEffect(() => {
    if (data?.annotations?.length > 0 && !selectedAnnotationId) {
      setSelectedAnnotationId(data.annotations[0].id);
    }
    if (data?.annotations?.length === 0) {
      setSelectedAnnotationId(null);
    }
  }, [data, selectedAnnotationId]);

  useEffect(() => {
    setAiAnalysis(image?.aiAnalysis || null);
  }, [image]);

  const handleAnalyze = useCallback(async () => {
    if (!aiEnabled) {
      showNotification('AI features are disabled in Settings', 'info');
      return;
    }
    if (!image?.id) return;
    setAnalyzing(true);
    try {
      const res = await analyzeImage({
        variables: {
          id: image.id,
          model: aiModel || null,
          persist: true,
        },
      });
      setAiAnalysis(res?.data?.analyzeImage || null);
    } catch (err) {
      console.error('Analyze image error:', err);
      showNotification(`Analyze failed: ${err.message}`, 'error');
    } finally {
      setAnalyzing(false);
    }
  }, [aiEnabled, aiModel, analyzeImage, image?.id, showNotification]);

  // Delete annotation handler
  const handleAnnotationDelete = useCallback(async (annotationId) => {
    if (!annotationId) return;
    if (!window.confirm('Delete this annotation and all its regions?')) return;
    await deleteAnnotation({ variables: { id: annotationId } });
    if (selectedAnnotationId === annotationId) setSelectedAnnotationId(null);
    refetch();
  }, [deleteAnnotation, refetch, selectedAnnotationId]);

  const maybePromptPresenceForLicensePlates = async (annotationId, tags) => {
    const plates = Array.from(
      new Set(
        (tags || [])
          .filter((t) => typeof t === 'string' && t.toLowerCase().startsWith('license_plate:'))
          .map((t) => t.split(':').slice(1).join(':'))
          .map(normalizePlate)
          .filter(Boolean)
      )
    );

    if (!annotationId || plates.length === 0) return;

    const hasCoords = Number.isFinite(Number(image?.latitude)) && Number.isFinite(Number(image?.longitude));
    const hasTime = !!(image?.captureTimestamp || image?.uploadedAt);
    if (!hasCoords || !hasTime) {
      showNotification('License plate detected, but presence generation requires timestamp + coordinates on the image', 'info');
      return;
    }

    setPresencePrompt({ annotationId, plates });
    setPresencePromptSelected(plates);
  };

  const closePresencePrompt = () => {
    setPresencePrompt(null);
    setPresencePromptSelected([]);
    setPresencePromptWorking(false);
  };

  const handlePresencePromptApprove = async () => {
    if (readOnly) return;
    if (!presencePrompt?.annotationId || presencePromptSelected.length === 0) {
      closePresencePrompt();
      return;
    }

    setPresencePromptWorking(true);
    try {
      for (const plate of presencePromptSelected) {
        await linkVehiclePlateToAnnotation({
          variables: {
            annotationId: presencePrompt.annotationId,
            plate,
            relationType: 'observed',
            confidence: 0.7,
            notes: `Auto: license plate ${plate}`,
          },
        });
      }

      try {
        await apolloClient.refetchQueries({ include: [GET_PRESENCES] });
      } catch {
        // ignore
      }

      showNotification('Presence generated from license plate(s)', 'success');
      closePresencePrompt();
    } catch (e) {
      console.error(e);
      showNotification(`Failed to generate presence: ${e.message}`, 'error');
      setPresencePromptWorking(false);
    }
  };

  if (!isOpen || !image) return null;

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
        zIndex: 1000,
        cursor: 'pointer'
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'relative',
          width: '90vw',
          height: '90vh',
          maxWidth: '1400px',
          backgroundColor: '#1a1a1a',
          borderRadius: '8px',
          overflow: 'hidden',
          cursor: 'default',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid #3a3a3a'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {notification && (
          <Notification
            message={notification.message}
            type={notification.type}
            duration={notification.duration}
            onClose={() => setNotification(null)}
          />
        )}

        {presencePrompt && (
          <div className="timeline-modal-overlay" onClick={closePresencePrompt}>
            <div className="timeline-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(720px, 95vw)' }}>
              <div className="timeline-modal-header">
                <div className="timeline-modal-title">Generate presence from license plate</div>
                <button className="timeline-modal-close" onClick={closePresencePrompt} aria-label="Close">×</button>
              </div>
              <div className="timeline-modal-body">
                <div className="timeline-muted" style={{ marginBottom: 10 }}>
                  Select which plates to link as vehicle entities. This uses the image’s timestamp + coordinates.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {(presencePrompt.plates || []).map((p) => (
                    <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={presencePromptSelected.includes(p)}
                        disabled={presencePromptWorking}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setPresencePromptSelected((prev) => {
                            const set = new Set(prev);
                            if (checked) set.add(p);
                            else set.delete(p);
                            return Array.from(set);
                          });
                        }}
                      />
                      <span style={{ fontFamily: 'monospace' }}>{p}</span>
                    </label>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <button className="timeline-secondary" disabled={presencePromptWorking} onClick={closePresencePrompt}>
                    Cancel
                  </button>
                  <button
                    className="timeline-primary"
                    disabled={presencePromptWorking || presencePromptSelected.length === 0 || readOnly}
                    onClick={handlePresencePromptApprove}
                  >
                    {presencePromptWorking ? 'Linking…' : 'Generate'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '30px',
            height: '30px',
            cursor: 'pointer',
            fontSize: '16px',
            zIndex: 1001
          }}
        >
          ×
        </button>


        {/* Annotation Viewer */}
        <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden' }}>
          <AnnotationViewer
            image={{ ...image, filePath: buildAssetUrl(image?.filePath) }}
            annotations={data?.annotations || []}
            readOnly={readOnly}
            onRefetch={refetch}
            onAnnotationCreate={async (input, opts) => {
              // If opts.edit, update existing annotation, else create new
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
                refetch();
                try {
                  await maybePromptPresenceForLicensePlates(input.id, input.tags || []);
                  refetch();
                } catch (e) {
                  console.error(e);
                }
                // Return the updated annotation with id so entity linking works
                return { ...result.data.updateAnnotation, id: input.id };
              }
              // Create a new annotation with region and description
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
              refetch();
              try {
                await maybePromptPresenceForLicensePlates(annotationId, input.tags || []);
                refetch();
              } catch (e) {
                console.error(e);
              }
            }}
            onAnnotationDelete={handleAnnotationDelete}
          />
        </div>

        {/* Image metadata */}
        <div style={{
          padding: '15px',
          fontSize: '14px',
          color: '#e0e0e0',
          backgroundColor: '#2a2a2a',
          borderTop: '1px solid #3a3a3a',
          flexShrink: 0,
          maxHeight: '180px',
          overflowY: 'auto'
        }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#e0e0e0' }}>{image.filename}</h3>
          {!readOnly && aiEnabled && (
            <div style={{ marginBottom: '10px', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                style={{
                  padding: '6px 10px',
                  background: analyzing ? '#6c757d' : 'rgba(0, 123, 255, 0.9)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  cursor: analyzing ? 'not-allowed' : 'pointer'
                }}
              >
                {analyzing ? '⏳ Analyzing...' : '🧠 Analyze (LM Studio)'}
              </button>
              <button
                onClick={() => {
                  if (typeof onEditDetails === 'function' && image?.id) onEditDetails(image.id);
                }}
                style={{
                  padding: '6px 10px',
                  background: 'rgba(23, 162, 184, 0.9)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                ✏️ Edit details
              </button>
              {aiAnalysis?.createdAt && (
                <div style={{ color: '#b0b0b0', fontSize: '12px' }}>
                  {new Date(aiAnalysis.createdAt).toLocaleString()}
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              {image.captureTimestamp && (
                <div><strong>Captured:</strong> {new Date(image.captureTimestamp).toLocaleString()}</div>
              )}
              <div><strong>Uploaded:</strong> {new Date(image.uploadedAt).toLocaleString()}</div>
              {image.cameraMake && image.cameraModel && (
                <div><strong>Camera:</strong> {image.cameraMake} {image.cameraModel}</div>
              )}
              {aiEnabled && aiAnalysis?.caption && (
                <div style={{ marginTop: '8px' }}>
                  <strong>AI Caption:</strong> {aiAnalysis.caption}
                </div>
              )}
              {aiEnabled && aiAnalysis?.licensePlates?.length > 0 && (
                <div style={{ marginTop: '6px' }}>
                  <strong>AI Plates:</strong> {aiAnalysis.licensePlates.join(', ')}
                </div>
              )}
            </div>
            <div>
              {image.latitude && image.longitude && (
                <div style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                  <strong>MGRS:</strong> {formatMGRS(image.longitude, image.latitude)}
                </div>
              )}
              <div><strong>File Size:</strong> {image.fileSize ? (image.fileSize / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageModal;
