import React, { useEffect, useState, useCallback } from 'react';
import { useQuery, useMutation } from '@apollo/client/react';
import { formatMGRS } from '../utils/coordinates';
import AnnotationViewer from './AnnotationViewer';
import { UPDATE_ANNOTATION } from './updateAnnotationMutation';
import {
  GET_ANNOTATIONS,
  CREATE_ANNOTATION as ADD_ANNOTATION,
  DELETE_ANNOTATION,
  ADD_ANNOTATION_REGION as ADD_REGION
} from '../graphql/annotations';


const ImageModal = ({ image, isOpen, onClose, readOnly = false }) => {
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

  // When annotations change, select the first by default if none selected
  useEffect(() => {
    if (data?.annotations?.length > 0 && !selectedAnnotationId) {
      setSelectedAnnotationId(data.annotations[0].id);
    }
    if (data?.annotations?.length === 0) {
      setSelectedAnnotationId(null);
    }
  }, [data, selectedAnnotationId]);

  // Delete annotation handler
  const handleAnnotationDelete = useCallback(async (annotationId) => {
    if (!annotationId) return;
    if (!window.confirm('Delete this annotation and all its regions?')) return;
    await deleteAnnotation({ variables: { id: annotationId } });
    if (selectedAnnotationId === annotationId) setSelectedAnnotationId(null);
    refetch();
  }, [deleteAnnotation, refetch, selectedAnnotationId]);

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
            image={{ ...image, filePath: `${import.meta.env.VITE_API_URL}${image.filePath}` }}
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              {image.captureTimestamp && (
                <div><strong>Captured:</strong> {new Date(image.captureTimestamp).toLocaleString()}</div>
              )}
              <div><strong>Uploaded:</strong> {new Date(image.uploadedAt).toLocaleString()}</div>
              {image.cameraMake && image.cameraModel && (
                <div><strong>Camera:</strong> {image.cameraMake} {image.cameraModel}</div>
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
