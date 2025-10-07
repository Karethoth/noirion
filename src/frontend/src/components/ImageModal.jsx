import React from 'react';

const ImageModal = ({ image, isOpen, onClose }) => {
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

        {/* Image */}
        <img
          src={`http://localhost:4000${image.filePath}`}
          alt={image.filename}
          style={{
            width: '100%',
            height: 'auto',
            display: 'block'
          }}
          onError={(e) => {
            e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBhdmFpbGFibGU8L3RleHQ+PC9zdmc+';
          }}
        />

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
                <>
                  <div><strong>Latitude:</strong> {image.latitude.toFixed(6)}</div>
                  <div><strong>Longitude:</strong> {image.longitude.toFixed(6)}</div>
                </>
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