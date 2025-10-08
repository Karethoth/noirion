import React, { useEffect, useState, useCallback } from 'react';
import { gql } from '@apollo/client';
import { useQuery, useMutation } from '@apollo/client/react';
import { formatMGRS } from '../utils/coordinates';
import AnnotationViewer from './AnnotationViewer';
import { UPDATE_ANNOTATION } from './updateAnnotationMutation';

// GraphQL queries and mutations
const GET_ANNOTATIONS = gql`
  query GetAnnotations($assetId: ID!) {
    annotations(assetId: $assetId) {
      id
      title
      description
      tags
      regions {
        id
        shapeType
        coordinates
        style
      }
    }
  }
`;

const ADD_ANNOTATION = gql`
  mutation CreateAnnotation($input: CreateAnnotationInput!) {
    createAnnotation(input: $input) {
      id
      regions { id shapeType coordinates style }
    }
  }
`;

const DELETE_ANNOTATION = gql`
  mutation DeleteAnnotation($id: ID!) {
    deleteAnnotation(id: $id)
  }
`;

const ADD_REGION = gql`
  mutation AddAnnotationRegion($annotationId: ID!, $input: AddRegionInput!) {
    addAnnotationRegion(annotationId: $annotationId, input: $input) {
      id
      shapeType
      coordinates
      style
    }
  }
`;


const ImageModal = ({ image, isOpen, onClose }) => {
  const { data, loading, refetch } = useQuery(GET_ANNOTATIONS, {
    variables: { assetId: image?.id },
    skip: !image,
    fetchPolicy: 'network-only',
  });
  const [addAnnotation] = useMutation(ADD_ANNOTATION);
  const [addRegion] = useMutation(ADD_REGION);
  const [deleteAnnotation] = useMutation(DELETE_ANNOTATION);
  const [updateAnnotation] = useMutation(UPDATE_ANNOTATION);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState(null);
  const [newDesc, setNewDesc] = useState('');

  // When annotations change, select the first by default if none selected
  useEffect(() => {
    if (data?.annotations?.length > 0 && !selectedAnnotationId) {
      setSelectedAnnotationId(data.annotations[0].id);
    }
    if (data?.annotations?.length === 0) {
      setSelectedAnnotationId(null);
    }
  }, [data, selectedAnnotationId]);

  // Create a new annotation
  const handleNewAnnotation = async (e) => {
    e.preventDefault();
    if (!newDesc.trim()) return;
    const res = await addAnnotation({
      variables: { input: { assetId: image.id, title: '', description: newDesc, tags: [] } },
    });
    setSelectedAnnotationId(res.data.createAnnotation.id);
    setNewDesc('');
    refetch();
  };

  // Add region to selected annotation
  const handleAnnotationCreate = useCallback(async (region) => {
    if (!selectedAnnotationId) return;
    await addRegion({
      variables: {
        annotationId: selectedAnnotationId,
        input: {
          shapeType: region.shapeType,
          coordinates: region.coordinates,
          style: region.style,
        },
      },
    });
    refetch();
  }, [selectedAnnotationId, addRegion, refetch]);

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
          maxWidth: '90%',
          maxHeight: '90%',
          backgroundColor: 'white',
          borderRadius: '8px',
          overflow: 'hidden',
          cursor: 'default'
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
        <div style={{ width: '800px', height: '600px', position: 'relative' }}>
          <AnnotationViewer
            image={{ ...image, filePath: `http://localhost:4000${image.filePath}` }}
            annotations={data?.annotations || []}
            onAnnotationCreate={async (input, opts) => {
              // If opts.edit, update existing annotation, else create new
              if (opts && opts.edit && input.id) {
                await updateAnnotation({
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
                return;
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
            readOnly={false}
          />
        </div>

        {/* Image metadata */}
        <div style={{ padding: '15px', fontSize: '14px', color: '#333' }}>
          <h3 style={{ margin: '0 0 10px 0' }}>{image.filename}</h3>
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
