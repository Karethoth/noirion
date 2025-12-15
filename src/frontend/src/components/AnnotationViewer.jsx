import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation, useLazyQuery } from '@apollo/client/react';
import { gql } from '@apollo/client';
import './AnnotationViewer.css';

const SEARCH_ENTITIES_BY_TAG = gql`
  query SearchEntitiesByTag($query: String!, $limit: Int) {
    searchEntities(query: $query, limit: $limit) {
      id
      displayName
      entityType
      tags
    }
  }
`;

const LINK_ENTITY_TO_ANNOTATION = gql`
  mutation LinkEntityToAnnotation(
    $annotationId: ID!
    $entityId: ID!
    $relationType: String
    $confidence: Float
    $notes: String
  ) {
    linkEntityToAnnotation(
      annotationId: $annotationId
      entityId: $entityId
      relationType: $relationType
      confidence: $confidence
      notes: $notes
    ) {
      id
      entityId
      entity {
        id
        displayName
        entityType
        tags
      }
      relationType
      confidence
      notes
    }
  }
`;

const UNLINK_ENTITY_FROM_ANNOTATION = gql`
  mutation UnlinkEntityFromAnnotation($linkId: ID!) {
    unlinkEntityFromAnnotation(linkId: $linkId) {
      id
    }
  }
`;

const AnnotationViewer = ({ image, annotations = [], onAnnotationCreate, onAnnotationDelete, readOnly = false, setSelectedAnnotationId, onRefetch }) => {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const imageContainerRef = useRef(null);
  const descriptionTextareaRef = useRef(null);

  // Ensure image src is absolute if needed
  const backendUrl = import.meta.env.VITE_API_URL;
  const imageSrc = image?.filePath?.startsWith('http') ? image.filePath : `${backendUrl}${image.filePath || ''}`;

  const [currentTool, setCurrentTool] = useState('select');
  const [drawingRegion, setDrawingRegion] = useState(null);
  const [pendingRegion, setPendingRegion] = useState(null);
  const [description, setDescription] = useState('');
  const [selectedRegion, _setSelectedRegion] = useState(null);
  const [editingDescription, setEditingDescription] = useState(false);
  const [editDescValue, setEditDescValue] = useState('');
  const [imageLoaded, setImageLoaded] = useState(false);
  const [hoveredAnnotationId, setHoveredAnnotationId] = useState(null);
  const [annotationsVisible, setAnnotationsVisible] = useState(true);
  const [entitySuggestions, setEntitySuggestions] = useState([]);
  const [pendingAnnotationData, setPendingAnnotationData] = useState(null);

  // Zoom and pan state
  const [scale, setScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState(null);
  const hasInitializedZoom = useRef(false);

  // Entity search query
  const [searchEntitiesByTag] = useLazyQuery(SEARCH_ENTITIES_BY_TAG);

  // Entity linking mutations
  const [linkEntity] = useMutation(LINK_ENTITY_TO_ANNOTATION, {
    onCompleted: () => {
      // Refetch annotations to show updated entity links
      if (onRefetch) {
        onRefetch();
      }
    }
  });

  const [unlinkEntity] = useMutation(UNLINK_ENTITY_FROM_ANNOTATION, {
    onCompleted: () => {
      // Refetch annotations to show updated entity links
      if (onRefetch) {
        onRefetch();
      }
    }
  });

  const handleUnlinkEntity = async (linkId) => {
    try {
      await unlinkEntity({
        variables: {
          linkId
        }
      });
    } catch (error) {
      console.error('Error unlinking entity:', error);
      alert('Failed to unlink entity');
    }
  };

  const handleSaveAnnotationWithEntities = async (selectedEntityIds) => {
    if (!pendingAnnotationData || !onAnnotationCreate) return;

    // Check if this is an edit (has id) or new annotation
    const isEdit = !!pendingAnnotationData.id;

    // Replace tag placeholders with entity slugs in description
    let updatedDescription = pendingAnnotationData.description;
    const entitySlugMap = {}; // Map slugs to entity IDs

    for (let i = 0; i < entitySuggestions.length; i++) {
      const suggestion = entitySuggestions[i];
      const selectedEntityId = selectedEntityIds[i];

      if (selectedEntityId) {
        // Find the selected entity
        const selectedEntity = suggestion.entities.find(e => e.id === selectedEntityId);
        if (selectedEntity) {
          // Generate slug from entity display name
          const slug = generateSlug(selectedEntity.displayName);
          const [tagType] = suggestion.tag.split(':');

          // Replace the partial tag with the full tag using slug
          // e.g., replace "#person:J" with "#person:john-doe"
          const tagPattern = new RegExp(`#${suggestion.tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\w)`, 'g');
          const newTag = `#${tagType}:${slug}`;
          updatedDescription = updatedDescription.replace(tagPattern, newTag);

          // Store the slug-to-entity mapping
          entitySlugMap[`${tagType}:${slug}`] = selectedEntityId;
        }
      }
    }

    // Update the pending annotation data with the modified description and re-extract tags
    const updatedTags = extractTags(updatedDescription); // Re-extract tags to include the full slugs
    const dataToSave = {
      ...pendingAnnotationData,
      description: updatedDescription,
      tags: updatedTags
    };

    // Save/create the annotation first
    const savedAnnotation = await onAnnotationCreate(dataToSave, isEdit ? { edit: true } : undefined);

    // Use the annotation id (either from edit or newly created)
    const annotationId = isEdit ? pendingAnnotationData.id : savedAnnotation?.id;

    // Link selected entities with their associated slugs as relation_type
    if (annotationId && Object.keys(entitySlugMap).length > 0) {
      for (const [slugTag, entityId] of Object.entries(entitySlugMap)) {
        try {
          await linkEntity({
            variables: {
              annotationId,
              entityId: entityId,
              relationType: slugTag, // Store the full slug tag (e.g., "person:john-doe")
              confidence: 1.0
            }
          });
        } catch (error) {
          console.error('Error linking entity:', error);
        }
      }
    }

    // Clear state
    setPendingAnnotationData(null);
    setEntitySuggestions([]);
    setPendingRegion(null);
    setDescription('');

    // If editing, just exit edit mode but keep the annotation selected
    if (isEdit) {
      setEditingDescription(false);
      // Don't clear selection - let the refetch update the view
    }
  };  const handleSkipEntitySuggestions = () => {
    if (!pendingAnnotationData || !onAnnotationCreate) return;

    const isEdit = !!pendingAnnotationData.id;
    // When skipping, keep the tags as-is in the description
    onAnnotationCreate(pendingAnnotationData, isEdit ? { edit: true } : undefined);

    setPendingAnnotationData(null);
    setEntitySuggestions([]);
    setPendingRegion(null);
    setDescription('');

    // If editing, just exit edit mode but keep the annotation selected
    if (isEdit) {
      setEditingDescription(false);
      // Don't clear selection
    }
  };

  const handleEditAnnotationSave = async () => {
    if (!selectedRegion) return;

    const tags = extractTags(editDescValue);
    const entityTypeTags = extractEntityTypeTags(tags);

    // If there are new entity-type tags, search for matching entities
    if (entityTypeTags.length > 0) {
      const annotationData = {
        ...selectedRegion,
        description: editDescValue,
        tags
      };
      setPendingAnnotationData(annotationData);

      // Search for each entity-type tag
      const suggestions = [];
      for (const tag of entityTypeTags) {
        const [, value] = tag.split(':');
        if (value) {
          try {
            const result = await searchEntitiesByTag({
              variables: {
                query: value,
                limit: 5
              }
            });

            if (result.data?.searchEntities) {
              const matchingEntities = result.data.searchEntities.filter(entity =>
                entity.tags?.some(t => t.toLowerCase().includes(value.toLowerCase())) ||
                entity.displayName?.toLowerCase().includes(value.toLowerCase())
              );

              if (matchingEntities.length > 0) {
                suggestions.push({
                  tag,
                  entities: matchingEntities
                });
              }
            }
          } catch (error) {
            console.error('Error searching entities:', error);
          }
        }
      }

      if (suggestions.length > 0) {
        setEntitySuggestions(suggestions);
        setEditingDescription(false);
        return; // Don't save yet, show suggestions first
      }
    }

    // No entity suggestions, save normally with updated tags
    const updated = { ...selectedRegion, description: editDescValue, tags };
    _setSelectedRegion(updated);
    setEditingDescription(false);
    if (typeof onAnnotationCreate === 'function') {
      onAnnotationCreate(updated, { edit: true });
    }
  };

  const drawBox = useCallback((ctx, coords, style, isSelected) => {
    const { x, y, width, height } = coords;
    // Draw fill first
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = (isSelected ? '#00ff00' : (style?.color || '#ff0000'));
    ctx.fillRect(x, y, width, height);
    ctx.restore();
    // Draw border on top
    ctx.save();
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = isSelected ? '#00ff00' : (style?.color || '#ff0000');
    ctx.lineWidth = style?.strokeWidth || 2;
    ctx.strokeRect(x, y, width, height);
    ctx.restore();
  }, []);

  const drawRegion = useCallback((ctx, region, isSelected, annotationDesc) => {
    const style = region.style || { color: '#ff0000', strokeWidth: 2 };

    // Draw region shape
    switch (region.shapeType) {
      case 'BOX':
        drawBox(ctx, region.coordinates, style, isSelected);
        // Draw description above the box
        if (annotationDesc) {
          ctx.save();
          ctx.font = '14px sans-serif';
          ctx.fillStyle = '#222';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 4;
          const x = region.coordinates.x;
          const y = region.coordinates.y - 8;
          // Draw white outline for readability
          ctx.strokeText(annotationDesc, x, y);
          ctx.fillStyle = isSelected ? '#00ff00' : style.color;
          ctx.fillText(annotationDesc, x, y);
          ctx.restore();
        }
        break;
      default:
        break;
    }
  }, [drawBox]);

  const redrawAnnotations = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (annotationsVisible) {
      annotations.forEach(annotation => {
        const isSelected = annotation.id === selectedRegion?.id;
        const isHovered = annotation.id === hoveredAnnotationId;
        annotation.regions?.forEach(region => {
          drawRegion(ctx, region, isSelected || isHovered, annotation.description);
        });
      });
    }

    if (drawingRegion) {
      drawRegion(ctx, drawingRegion, true, description);
    }
  }, [annotations, selectedRegion, drawingRegion, drawRegion, description, annotationsVisible, hoveredAnnotationId]);

  // Setup canvas to match image natural size and fit to view on initial load only
  useEffect(() => {
    if (!imageLoaded || !canvasRef.current || !imageRef.current) return;

    const canvas = canvasRef.current;
    const img = imageRef.current;

    // Set canvas size to match the natural image size
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    // Fit image to view on initial load only (not on every re-render)
    if (!hasInitializedZoom.current) {
      const container = imageContainerRef.current;
      if (container && img.naturalWidth && img.naturalHeight) {
        const containerRect = container.getBoundingClientRect();
        const scaleX = (containerRect.width - 40) / img.naturalWidth;
        const scaleY = (containerRect.height - 40) / img.naturalHeight;
        const fitScale = Math.min(scaleX, scaleY, 1);

        setScale(fitScale);

        const scaledWidth = img.naturalWidth * fitScale;
        const scaledHeight = img.naturalHeight * fitScale;
        setPanOffset({
          x: (containerRect.width - scaledWidth) / 2,
          y: (containerRect.height - scaledHeight) / 2
        });

        hasInitializedZoom.current = true;
      }
    }

    redrawAnnotations();
  }, [imageLoaded, redrawAnnotations]);

  // Get coordinates in image space (accounting for zoom/pan)
  const getImageCoordinates = (event) => {
    const canvas = canvasRef.current;
    const container = imageContainerRef.current;
    if (!canvas || !container) return { x: 0, y: 0 };

    const rect = container.getBoundingClientRect();

    // Get position relative to container
    const containerX = event.clientX - rect.left;
    const containerY = event.clientY - rect.top;

    // Account for pan offset and scale
    const imageX = (containerX - panOffset.x) / scale;
    const imageY = (containerY - panOffset.y) / scale;

    return { x: imageX, y: imageY };
  };

  // Mouse wheel for zoom
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.2, Math.min(5, scale * delta));

    // Zoom towards mouse position
    const container = imageContainerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Adjust pan offset to zoom towards mouse
      const scaleRatio = newScale / scale;
      setPanOffset({
        x: mouseX - (mouseX - panOffset.x) * scaleRatio,
        y: mouseY - (mouseY - panOffset.y) * scaleRatio
      });
    }

    setScale(newScale);
  };

  // Pan handling
  const handlePanMouseDown = (e) => {
    if (e.button === 1 || (e.button === 0 && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY, ox: panOffset.x, oy: panOffset.y });
    } else if (e.button === 0 && !readOnly && currentTool !== 'select') {
      handleMouseDown(e);
    }
  };

  const handlePanMouseMove = (e) => {
    if (isPanning && panStart) {
      setPanOffset({
        x: panStart.ox + (e.clientX - panStart.x),
        y: panStart.oy + (e.clientY - panStart.y)
      });
    } else {
      handleMouseMove(e);
    }
  };

  const handlePanMouseUp = (e) => {
    if (isPanning) {
      setIsPanning(false);
      setPanStart(null);
    } else {
      handleMouseUp(e);
    }
  };

  const handleMouseDown = (event) => {
    if (readOnly || currentTool === 'select') return;

    const coords = getImageCoordinates(event);

    switch (currentTool) {
      case 'box':
        setDrawingRegion({
          shapeType: 'BOX',
          coordinates: { x: coords.x, y: coords.y, width: 0, height: 0 },
          style: { color: '#ff0000', strokeWidth: 2 }
        });
        break;
      default:
        break;
    }
  };

  const handleMouseMove = (event) => {
    if (!drawingRegion || drawingRegion.shapeType !== 'BOX') {
      // Hover highlight for regions
      const coords = getImageCoordinates(event);
      let found = null;

      for (const annotation of annotations) {
        for (const region of annotation.regions || []) {
          if (region.shapeType === 'BOX') {
            const { x: rx, y: ry, width, height } = region.coordinates;
            if (coords.x >= rx && coords.x <= rx + width && coords.y >= ry && coords.y <= ry + height) {
              found = annotation.id;
              break;
            }
          }
        }
        if (found) break;
      }
      setHoveredAnnotationId(found);
      return;
    }

    const coords = getImageCoordinates(event);

    setDrawingRegion(prev => ({
      ...prev,
      coordinates: {
        ...prev.coordinates,
        width: coords.x - prev.coordinates.x,
        height: coords.y - prev.coordinates.y
      }
    }));

    redrawAnnotations();
  };

  const handleMouseUp = () => {
    if (!drawingRegion || drawingRegion.shapeType !== 'BOX') return;
    setPendingRegion(drawingRegion);
    setDrawingRegion(null);
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && drawingRegion) {
        setDrawingRegion(null);
        redrawAnnotations();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawingRegion, redrawAnnotations]);

  // Auto-focus description textarea when starting to add a new annotation
  useEffect(() => {
    if (pendingRegion && descriptionTextareaRef.current) {
      descriptionTextareaRef.current.focus();
    }
  }, [pendingRegion]);

  // Clear selected annotation if it no longer exists (e.g., was deleted)
  useEffect(() => {
    if (selectedRegion) {
      const stillExists = annotations.some(ann => ann.id === selectedRegion.id);
      if (!stillExists) {
        _setSelectedRegion(null);
        setEditingDescription(false);
      }
    }
  }, [annotations, selectedRegion]);

  function extractTags(desc) {
    // Match tags with format: #tagtype or #tagtype:value
    // Supports alphanumeric, hyphens, underscores, and colons
    // Examples: #car, #car:XXX-NNN, #license_plate:ABC-123, #vehicle-type:sedan
    const tagRegex = /#([\w-]+(?::[\w-]+)?)/g;
    const matches = desc.match(tagRegex) || [];
    return matches.map(t => t.slice(1)); // Remove the # prefix
  }

  // Extract entity-type tags (tags that could be entities like person:name, car:plate)
  function extractEntityTypeTags(tags) {
    const entityTypes = ['person', 'vehicle', 'object', 'location', 'organization'];
    return tags.filter(tag => {
      const [type] = tag.split(':');
      return entityTypes.includes(type.toLowerCase());
    });
  }

  // Generate a tag-safe slug from display name
  function generateSlug(displayName) {
    return displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric chars with hyphens
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  }

  const handleMetadataSubmit = async (e) => {
    e.preventDefault();
    if (!pendingRegion) return;

    const tags = extractTags(description);
    const entityTypeTags = extractEntityTypeTags(tags);

    // If there are entity-type tags, search for matching entities
    if (entityTypeTags.length > 0) {
      const annotationData = {
        ...pendingRegion,
        description,
        tags
      };
      setPendingAnnotationData(annotationData);

      // Search for each entity-type tag
      const suggestions = [];
      for (const tag of entityTypeTags) {
        const [, value] = tag.split(':');
        if (value) {
          try {
            const result = await searchEntitiesByTag({
              variables: {
                query: value,
                limit: 5
              }
            });

            if (result.data?.searchEntities) {
              const matchingEntities = result.data.searchEntities.filter(entity =>
                entity.tags?.some(t => t.toLowerCase().includes(value.toLowerCase())) ||
                entity.displayName?.toLowerCase().includes(value.toLowerCase())
              );

              if (matchingEntities.length > 0) {
                suggestions.push({
                  tag,
                  entities: matchingEntities
                });
              }
            }
          } catch (error) {
            console.error('Error searching entities:', error);
          }
        }
      }

      if (suggestions.length > 0) {
        setEntitySuggestions(suggestions);
        return; // Don't save yet, show suggestions first
      }
    }

    // No entity suggestions, save normally
    if (onAnnotationCreate) {
      onAnnotationCreate({
        ...pendingRegion,
        description,
        tags
      });
    }
    setPendingRegion(null);
    setDescription('');
  };

  // Handle Enter key for new annotation description
  const handleNewAnnotationKeyDown = (e) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      if (description.trim()) {
        handleMetadataSubmit(e);
      }
    }
  };

  // Handle Enter key for editing annotation description
  const handleEditAnnotationKeyDown = (e) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      handleEditAnnotationSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditingDescription(false);
    }
  };

  const handleCanvasClick = (event) => {
    if (readOnly || currentTool !== 'select') return;

    const coords = getImageCoordinates(event);
    let found = null;

    for (const annotation of annotations) {
      for (const region of annotation.regions || []) {
        if (region.shapeType === 'BOX') {
          const { x: rx, y: ry, width, height } = region.coordinates;
          if (coords.x >= rx && coords.x <= rx + width && coords.y >= ry && coords.y <= ry + height) {
            found = annotation;
            break;
          }
        }
      }
      if (found) break;
    }

    if (found) {
      _setSelectedRegion(found);
      setEditDescValue(found.description || '');
      setEditingDescription(true);
      if (setSelectedAnnotationId) setSelectedAnnotationId(found.id);
    } else {
      _setSelectedRegion(null);
      setEditingDescription(false);
      if (setSelectedAnnotationId) setSelectedAnnotationId(null);
    }
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(5, prev * 1.2));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(0.2, prev / 1.2));
  };

  const handleResetZoom = () => {
    // Calculate scale to fit image to container
    const container = imageContainerRef.current;
    const img = imageRef.current;
    if (container && img && img.naturalWidth && img.naturalHeight) {
      const containerRect = container.getBoundingClientRect();
      const scaleX = (containerRect.width - 40) / img.naturalWidth; // 40px padding
      const scaleY = (containerRect.height - 40) / img.naturalHeight;
      const fitScale = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 100%

      setScale(fitScale);

      // Center the image
      const scaledWidth = img.naturalWidth * fitScale;
      const scaledHeight = img.naturalHeight * fitScale;
      setPanOffset({
        x: (containerRect.width - scaledWidth) / 2,
        y: (containerRect.height - scaledHeight) / 2
      });
    } else {
      setScale(1);
      setPanOffset({ x: 0, y: 0 });
    }
  };

  return (
    <div className="annotation-viewer">
      {/* Sidebar annotation list */}
      <div className="annotation-sidebar">
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 0, marginBottom: 8 }}>
          <h4 style={{ margin: 0, flex: 1 }}>Annotations</h4>
          <label style={{ display: 'flex', alignItems: 'center', fontSize: 14, marginLeft: 8, userSelect: 'none', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={annotationsVisible}
              onChange={e => setAnnotationsVisible(e.target.checked)}
              style={{ marginRight: 4 }}
            />
            Visible
          </label>
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {annotations.filter(a => (a.regions && a.regions.length > 0) || (a.description && a.description.trim().length > 0)).map(annotation => {
            const isSelected = annotation.id === selectedRegion?.id;
            const isHovered = annotation.id === hoveredAnnotationId;
            return (
              <li
                key={annotation.id}
                style={{
                  marginBottom: 10,
                  background: isSelected || isHovered ? '#1e5a9e' : '#2a2a2a',
                  border: isSelected || isHovered ? '2px solid #2a6bb5' : '1px solid #3a3a3a',
                  borderRadius: 4,
                  padding: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  color: '#e0e0e0',
                }}
                onMouseEnter={() => setHoveredAnnotationId(annotation.id)}
                onMouseLeave={() => setHoveredAnnotationId(null)}
                onClick={() => {
                  _setSelectedRegion(annotation);
                  setEditDescValue(annotation.description || '');
                  setEditingDescription(true);
                  if (setSelectedAnnotationId) setSelectedAnnotationId(annotation.id);
                }}
              >
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSelected ? 'bold' : 'normal' }}
                    title={annotation.description}
                  >
                    {annotation.description?.slice(0, 32) || 'Untitled'}
                  </div>
                  {annotation.entityLinks && annotation.entityLinks.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                      {annotation.entityLinks.map(link => (
                        <span
                          key={link.id}
                          style={{
                            fontSize: 10,
                            padding: '2px 6px',
                            background: '#4a9eff',
                            color: 'white',
                            borderRadius: 3,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '100px'
                          }}
                          title={link.entity?.displayName || 'Unknown Entity'}
                        >
                          {link.entity?.displayName?.slice(0, 12) || '???'}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {!readOnly && (
                  <button
                    title="Delete annotation"
                    style={{ marginLeft: 8, background: 'none', border: 'none', color: '#c00', fontSize: 18, cursor: 'pointer', flexShrink: 0 }}
                    onClick={e => { e.stopPropagation(); onAnnotationDelete && onAnnotationDelete(annotation.id); }}
                  >×</button>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="annotation-main-area">
        <div className="viewer-toolbar">
          <button
            className={currentTool === 'select' ? 'active' : ''}
            onClick={() => setCurrentTool('select')}
            disabled={readOnly}
          >
            Select
          </button>
          <button
            className={currentTool === 'box' ? 'active' : ''}
            onClick={() => setCurrentTool('box')}
            disabled={readOnly}
          >
            Rectangle
          </button>
          {drawingRegion && (
            <button onClick={() => { setDrawingRegion(null); redrawAnnotations(); }}>
              Cancel (ESC)
            </button>
          )}
          <div className="zoom-controls">
            <button onClick={handleZoomOut} title="Zoom Out">−</button>
            <span className="zoom-level">{Math.round(scale * 100)}%</span>
            <button onClick={handleZoomIn} title="Zoom In">+</button>
            <button onClick={handleResetZoom} title="Reset View">Reset</button>
          </div>
          {readOnly && (
            <span className="tool-hint" style={{ color: '#ffc107', fontWeight: 600 }}>
              Read-Only Mode - Viewing only
            </span>
          )}
          {!readOnly && (
            <span className="tool-hint">Ctrl+drag or middle mouse to pan, scroll to zoom</span>
          )}
        </div>

        <div
          ref={imageContainerRef}
          className="viewer-canvas-container"
          onWheel={handleWheel}
          onMouseDown={handlePanMouseDown}
          onMouseMove={handlePanMouseMove}
          onMouseUp={handlePanMouseUp}
          onClick={handleCanvasClick}
          style={{
            cursor: isPanning ? 'grabbing' : (currentTool === 'select' ? 'default' : 'crosshair'),
            overflow: 'hidden',
            position: 'relative'
          }}
        >
          <div
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${scale})`,
              transformOrigin: '0 0',
              position: 'relative',
              display: 'inline-block'
            }}
          >
            <img
              ref={imageRef}
              src={imageSrc}
              alt={image.filename}
              onLoad={() => setImageLoaded(true)}
              style={{
                display: 'block',
                pointerEvents: 'none',
                userSelect: 'none'
              }}
            />
            <canvas
              ref={canvasRef}
              className="annotation-canvas"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                pointerEvents: 'none'
              }}
            />
          </div>
        </div>

        {/* Metadata form for new annotation */}
        {pendingRegion && (
          <div className="annotation-metadata-form">
            <form onSubmit={handleMetadataSubmit}>
              <div style={{ marginBottom: 8 }}>
                <label>Description:<br />
                  <textarea
                    ref={descriptionTextareaRef}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    onKeyDown={handleNewAnnotationKeyDown}
                    rows={3}
                    style={{ width: '100%' }}
                    required
                    placeholder="Enter description (Ctrl+Enter for new line, Enter to save)"
                  />
                </label>
              </div>
              <button type="submit">Save Annotation</button>
              <button type="button" style={{ marginLeft: 8 }} onClick={() => { setPendingRegion(null); setDescription(''); }}>Cancel</button>
            </form>
          </div>
        )}

        {/* Entity Suggestions UI */}
        {entitySuggestions.length > 0 && (
          <div className="entity-suggestions-panel" style={{
            background: '#2a2a2a',
            border: '2px solid #4a9eff',
            borderRadius: 8,
            padding: 16,
            margin: '16px 0'
          }}>
            <h3 style={{ marginTop: 0, color: '#4a9eff' }}>🔗 Link Entities to Annotation</h3>
            <p style={{ color: '#b0b0b0', fontSize: 14, marginBottom: 12 }}>
              We found entities that match your tags. Select which ones to link:
            </p>

            {entitySuggestions.map((suggestion, idx) => (
              <div key={idx} style={{ marginBottom: 16, padding: 12, background: '#1e1e1e', borderRadius: 6 }}>
                <div style={{ marginBottom: 8 }}>
                  <strong style={{ color: '#e0e0e0' }}>Tag: #{suggestion.tag}</strong>
                  <span style={{ marginLeft: 8, fontSize: 12, color: '#999' }}>
                    (Select one entity for this tag)
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: 6, background: '#2a2a2a', borderRadius: 4 }}>
                    <input
                      type="radio"
                      name={`entity-${idx}`}
                      value=""
                      defaultChecked
                      style={{ marginRight: 8 }}
                    />
                    <div style={{ color: '#999', fontStyle: 'italic' }}>Skip - Don't link any entity</div>
                  </label>
                  {suggestion.entities.map(entity => (
                    <label key={entity.id} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: 6, background: '#2a2a2a', borderRadius: 4 }}>
                      <input
                        type="radio"
                        name={`entity-${idx}`}
                        value={entity.id}
                        style={{ marginRight: 8 }}
                      />
                      <div>
                        <div style={{ color: '#e0e0e0', fontWeight: 500 }}>{entity.displayName}</div>
                        <div style={{ fontSize: 12, color: '#999' }}>
                          <span style={{ padding: '2px 6px', background: '#444', borderRadius: 3, marginRight: 6 }}>
                            {entity.entityType}
                          </span>
                          {entity.tags && entity.tags.slice(0, 2).map(tag => {
                            // Strip "general:" prefix for cleaner display
                            return tag.startsWith('general:') ? tag.substring(8) : tag;
                          }).join(', ')}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                onClick={() => {
                  const selectedIds = [];
                  // Get selected entity for each tag (radio button groups)
                  for (let i = 0; i < entitySuggestions.length; i++) {
                    const radio = document.querySelector(`.entity-suggestions-panel input[name="entity-${i}"]:checked`);
                    if (radio && radio.value) {
                      selectedIds.push(radio.value);
                    } else {
                      selectedIds.push(null); // No entity selected for this tag
                    }
                  }
                  handleSaveAnnotationWithEntities(selectedIds);
                }}
                style={{
                  background: '#4a9eff',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                Link Selected & Save
              </button>
              <button
                onClick={handleSkipEntitySuggestions}
                style={{
                  background: '#555',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                Skip & Save Without Linking
              </button>
              <button
                onClick={() => {
                  setEntitySuggestions([]);
                  setPendingAnnotationData(null);
                }}
                style={{
                  background: 'transparent',
                  color: '#999',
                  border: '1px solid #555',
                  padding: '8px 16px',
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {selectedRegion && editingDescription && !readOnly && (
          <div className="annotation-details">
            <h3>Edit Description</h3>
            <textarea
              value={editDescValue}
              onChange={e => setEditDescValue(e.target.value)}
              onKeyDown={handleEditAnnotationKeyDown}
              rows={3}
              style={{ width: '100%' }}
              autoFocus
              placeholder="Ctrl+Enter for new line, Enter to save, Esc to cancel"
            />
            <div style={{ marginTop: 8 }}>
              <button onClick={handleEditAnnotationSave}>
                Save
              </button>
              <button style={{ marginLeft: 8 }} onClick={() => {
                setEditingDescription(false);
              }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {selectedRegion && (!editingDescription || readOnly) && (
          <div className="annotation-details">
            <h3>{selectedRegion.title || 'Annotation'}</h3>
            <p>{selectedRegion.description}</p>
            {selectedRegion.tags && selectedRegion.tags.length > 0 && (
              <div className="annotation-tags">
                {selectedRegion.tags.map((tag, idx) => {
                  // Split tag into type and value if it contains a colon
                  const [tagType, tagValue] = tag.includes(':') ? tag.split(':', 2) : [tag, null];
                  return (
                    <span key={idx} className="tag">
                      <span className="tag-type">{tagType}</span>
                      {tagValue && <span className="tag-value">: {tagValue}</span>}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Entity Links Section */}
            <div className="annotation-entity-links" style={{ marginTop: 16 }}>
              <h4 style={{ marginBottom: 8, fontSize: 14, color: '#b0b0b0' }}>Linked Entities</h4>
              {selectedRegion.entityLinks && selectedRegion.entityLinks.length > 0 ? (
                <div style={{ marginBottom: 8 }}>
                  {selectedRegion.entityLinks.map(link => (
                    <div key={link.id} className="entity-link-item" style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      background: '#2a2a2a',
                      borderRadius: 4,
                      marginBottom: 4
                    }}>
                      <div>
                        <span style={{ fontWeight: 500, color: '#e0e0e0' }}>
                          {link.entity?.displayName || 'Unknown Entity'}
                        </span>
                        {link.relationType && (
                          <span style={{
                            marginLeft: 8,
                            padding: '2px 6px',
                            background: '#2a5a8a',
                            borderRadius: 3,
                            fontSize: 11,
                            color: '#aaf'
                          }}>
                            #{link.relationType}
                          </span>
                        )}
                        {link.entity?.entityType && (
                          <span style={{
                            marginLeft: 8,
                            padding: '2px 6px',
                            background: '#444',
                            borderRadius: 3,
                            fontSize: 11,
                            color: '#aaa'
                          }}>
                            [{link.entity.entityType}]
                          </span>
                        )}
                      </div>
                      {!readOnly && (
                        <button
                          onClick={() => handleUnlinkEntity(link.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#c00',
                            fontSize: 18,
                            cursor: 'pointer',
                            padding: '0 4px'
                          }}
                          title="Unlink entity"
                        >×</button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#999', fontSize: 13, fontStyle: 'italic' }}>No entities linked</p>
              )}

              {!readOnly && selectedRegion.entityLinks && selectedRegion.entityLinks.length === 0 && (
                <p style={{ color: '#999', fontSize: 12, fontStyle: 'italic', marginTop: 8 }}>
                  💡 Tip: Add entity tags like #person:John or #car:ABC-123 to link entities
                </p>
              )}
            </div>

            {!readOnly && (
              <div className="annotation-details-actions">
                <button
                  onClick={() => onAnnotationDelete && onAnnotationDelete(selectedRegion.id)}
                  style={{
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '500'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#c82333'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = '#dc3545'}
                >
                  Delete Annotation
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnnotationViewer;
