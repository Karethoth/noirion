import React, { useState, useRef, useEffect, useCallback } from 'react';
import './AnnotationViewer.css';

/**
 * AnnotationViewer - A React component for viewing images with annotation support
 * Supports drawing boxes, polygons, and freehand shapes on images
 */
const AnnotationViewer = ({ image, annotations = [], onAnnotationCreate, onAnnotationDelete, readOnly = false, selectedAnnotationId, setSelectedAnnotationId }) => {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  // Ensure image src is absolute if needed
  const backendUrl = 'http://localhost:4000';
  const imageSrc = image?.filePath?.startsWith('http') ? image.filePath : `${backendUrl}${image.filePath || ''}`;
  const [currentTool, setCurrentTool] = useState('select');
  const [drawingRegion, setDrawingRegion] = useState(null);
  const [pendingRegion, setPendingRegion] = useState(null); // For region awaiting metadata
  const [description, setDescription] = useState('');
  const [selectedRegion, _setSelectedRegion] = useState(null);
  const [editingDescription, setEditingDescription] = useState(false);
  const [editDescValue, setEditDescValue] = useState('');
  const [imageLoaded, setImageLoaded] = useState(false);
  const [hoveredAnnotationId, setHoveredAnnotationId] = useState(null);
  const [annotationsVisible, setAnnotationsVisible] = useState(true);

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
    if (!canvas) return;

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

  useEffect(() => {
    if (imageLoaded && canvasRef.current && imageRef.current) {
      const canvas = canvasRef.current;
      const img = imageRef.current;
      const dpr = window.devicePixelRatio || 1;
      // Set canvas size in device pixels
      canvas.width = img.naturalWidth * dpr;
      canvas.height = img.naturalHeight * dpr;
      // Set CSS size in layout pixels
      canvas.style.width = img.naturalWidth + 'px';
      canvas.style.height = img.naturalHeight + 'px';
      // Scale context
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset
      ctx.scale(dpr, dpr);
      redrawAnnotations();
    }
  }, [imageLoaded, redrawAnnotations]);

  const getCanvasCoordinates = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  };

  const handleMouseDown = (event) => {
    if (readOnly || currentTool === 'select') return;

    const coords = getCanvasCoordinates(event);

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
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;
      // Find hovered annotation
      let found = null;
      for (const annotation of annotations) {
        for (const region of annotation.regions || []) {
          if (region.shapeType === 'BOX') {
            const { x: rx, y: ry, width, height } = region.coordinates;
            if (x >= rx && x <= rx + width && y >= ry && y <= ry + height) {
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

    const coords = getCanvasCoordinates(event);

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
    // Show metadata form for the drawn region
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

  function extractTags(desc) {
    return (desc.match(/#\w+/g) || []).map(t => t.slice(1));
  }

  const handleMetadataSubmit = (e) => {
    e.preventDefault();
    if (pendingRegion && onAnnotationCreate) {
      onAnnotationCreate({
        ...pendingRegion,
        description,
        tags: extractTags(description)
      });
    }
    setPendingRegion(null);
    setDescription('');
  };

    // Helper to find annotation by canvas click
    const handleCanvasClick = (event) => {
      if (readOnly) return;
      const coords = getCanvasCoordinates(event);
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

    return (
      <div className="annotation-viewer" style={{ display: 'flex', flexDirection: 'row' }}>
        {/* Sidebar annotation list */}
        <div className="annotation-sidebar" style={{ width: 220, minWidth: 180, background: '#f7f7f7', borderRight: '1px solid #ddd', padding: 12 }}>
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
                    background: isSelected || isHovered ? '#b3e5fc' : '#f7f7f7',
                    border: isSelected || isHovered ? '2px solid #0288d1' : '1px solid #ddd',
                    borderRadius: 4,
                    padding: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
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
                  <span
                    style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSelected ? 'bold' : 'normal' }}
                    title={annotation.description}
                  >
                    {annotation.description?.slice(0, 32) || 'Untitled'}
                  </span>
                  {!readOnly && (
                    <button
                      title="Delete annotation"
                      style={{ marginLeft: 8, background: 'none', border: 'none', color: '#c00', fontSize: 18, cursor: 'pointer' }}
                      onClick={e => { e.stopPropagation(); onAnnotationDelete && onAnnotationDelete(annotation.id); }}
                    >🗑️</button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div style={{ flex: 1, position: 'relative' }}>
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
      </div>

  <div className="viewer-canvas-container">
        <img
          ref={imageRef}
          src={imageSrc}
          alt={image.filename}
          onLoad={() => setImageLoaded(true)}
          style={{ maxWidth: '100%', display: 'block' }}
        />
        <canvas
          ref={canvasRef}
          className="annotation-canvas"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleCanvasClick}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: imageRef.current?.naturalWidth || 'auto',
            height: imageRef.current?.naturalHeight || 'auto',
            cursor: currentTool === 'select' ? 'default' : 'crosshair'
          }}
        />
      </div>

      {/* Metadata form for new annotation */}
      {pendingRegion && (
        <div className="annotation-metadata-form" style={{ position: 'absolute', top: 20, left: 20, background: '#fff', padding: 16, borderRadius: 8, boxShadow: '0 2px 8px #0002', zIndex: 10 }}>
          <form onSubmit={handleMetadataSubmit}>
            <div style={{ marginBottom: 8 }}>
              <label>Description:<br />
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ width: '100%' }} required />
              </label>
            </div>
            <button type="submit">Save Annotation</button>
            <button type="button" style={{ marginLeft: 8 }} onClick={() => { setPendingRegion(null); setDescription(''); }}>Cancel</button>
          </form>
        </div>
      )}

      {selectedRegion && editingDescription && !readOnly && (
        <div className="annotation-details">
          <h3>Edit Description</h3>
          <textarea
            value={editDescValue}
            onChange={e => setEditDescValue(e.target.value)}
            rows={3}
            style={{ width: '100%' }}
            autoFocus
          />
          <div style={{ marginTop: 8 }}>
            <button onClick={() => {
              if (!selectedRegion) return;
              // Update annotation description in state and propagate
              const updated = { ...selectedRegion, description: editDescValue };
              _setSelectedRegion(updated);
              setEditingDescription(false);
              // Propagate change to parent if possible
              if (typeof onAnnotationCreate === 'function') {
                onAnnotationCreate(updated, { edit: true });
              }
            }}>
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
              {selectedRegion.tags.map((tag, idx) => (
                <span key={idx} className="tag">{tag}</span>
              ))}
            </div>
          )}
          {!readOnly && (
            <div className="annotation-details-actions">
              <button onClick={() => onAnnotationDelete && onAnnotationDelete(selectedRegion.id)}>
                Delete
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
