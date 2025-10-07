import React, { useState, useRef, useEffect, useCallback } from 'react';
import './AnnotationViewer.css';

/**
 * AnnotationViewer - A React component for viewing images with annotation support
 * Supports drawing boxes, polygons, and freehand shapes on images
 */
const AnnotationViewer = ({ image, annotations = [], onAnnotationCreate, onAnnotationDelete, readOnly = false }) => {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const [currentTool, setCurrentTool] = useState('select');
  const [drawingRegion, setDrawingRegion] = useState(null);
  const [selectedAnnotation, _setSelectedAnnotation] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  const drawBox = useCallback((ctx, coords) => {
    const { x, y, width, height } = coords;
    ctx.strokeRect(x, y, width, height);
    ctx.fillRect(x, y, width, height);
  }, []);

  const drawPoint = useCallback((ctx, coords) => {
    ctx.beginPath();
    ctx.arc(coords.x, coords.y, 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }, []);

  const drawRegion = useCallback((ctx, region, isSelected) => {
    const style = region.style || { color: '#ff0000', strokeWidth: 2 };
    
    ctx.strokeStyle = isSelected ? '#00ff00' : style.color;
    ctx.lineWidth = style.strokeWidth;
    ctx.fillStyle = `${style.color}33`;

    switch (region.shapeType) {
      case 'BOX':
        drawBox(ctx, region.coordinates);
        break;
      case 'POINT':
        drawPoint(ctx, region.coordinates);
        break;
      default:
        break;
    }
  }, [drawBox, drawPoint]);

  const redrawAnnotations = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    annotations.forEach(annotation => {
      annotation.regions?.forEach(region => {
        drawRegion(ctx, region, annotation.id === selectedAnnotation?.id);
      });
    });
    
    if (drawingRegion) {
      drawRegion(ctx, drawingRegion, true);
    }
  }, [annotations, selectedAnnotation, drawingRegion, drawRegion]);

  useEffect(() => {
    if (imageLoaded && canvasRef.current && imageRef.current) {
      const canvas = canvasRef.current;
      const img = imageRef.current;
      
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      
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
      case 'point': {
        const pointRegion = {
          shapeType: 'POINT',
          coordinates: coords,
          style: { color: '#ff0000', strokeWidth: 2 }
        };
        if (onAnnotationCreate) {
          onAnnotationCreate(pointRegion);
        }
        break;
      }
      default:
        break;
    }
  };

  const handleMouseMove = (event) => {
    if (!drawingRegion || drawingRegion.shapeType !== 'BOX') return;
    
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
    
    if (onAnnotationCreate) {
      onAnnotationCreate(drawingRegion);
    }
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

  return (
    <div className="annotation-viewer">
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
        <button 
          className={currentTool === 'point' ? 'active' : ''}
          onClick={() => setCurrentTool('point')}
          disabled={readOnly}
        >
          Point
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
          src={image.filePath}
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
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            maxWidth: '100%',
            cursor: currentTool === 'select' ? 'default' : 'crosshair'
          }}
        />
      </div>
      
      {selectedAnnotation && (
        <div className="annotation-details">
          <h3>{selectedAnnotation.title || 'Annotation'}</h3>
          <p>{selectedAnnotation.description}</p>
          {selectedAnnotation.tags && selectedAnnotation.tags.length > 0 && (
            <div className="annotation-tags">
              {selectedAnnotation.tags.map((tag, idx) => (
                <span key={idx} className="tag">{tag}</span>
              ))}
            </div>
          )}
          {!readOnly && (
            <div className="annotation-details-actions">
              <button onClick={() => onAnnotationDelete && onAnnotationDelete(selectedAnnotation.id)}>
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AnnotationViewer;
