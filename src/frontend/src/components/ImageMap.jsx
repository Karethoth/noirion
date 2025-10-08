import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { gql } from '@apollo/client';
import { useQuery, useMutation } from '@apollo/client/react';
import { formatMGRS } from '../utils/coordinates';
import ImageModal from './ImageModal';
import 'leaflet/dist/leaflet.css';
import './ImageMap.css';
import L from 'leaflet';

// Fix for default markers in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const GET_IMAGES = gql`
  query GetImages {
    images {
      id
      filename
      filePath
      latitude
      longitude
      captureTimestamp
      cameraMake
      cameraModel
      uploadedAt
      annotations {
        id
        tags
      }
    }
  }
`;

const DELETE_IMAGE = gql`
  mutation DeleteImage($id: ID!) {
    deleteImage(id: $id)
  }
`;

// Component to fit bounds to all markers on initial load only
function FitBounds({ images, hasInitialized }) {
  const map = useMap();

  useEffect(() => {
    if (images.length > 0 && !hasInitialized.current) {
      const bounds = L.latLngBounds(images.map(img => [img.latitude, img.longitude]));
      map.fitBounds(bounds, { padding: [50, 50] });
      hasInitialized.current = true;
    }
  }, [images, map, hasInitialized]);

  return null;
}

// Component to apply map style class to container
function MapStyleController({ style }) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();

    // Remove all style classes
    container.classList.remove('map-style-day', 'map-style-night', 'map-style-satellite');

    // Add the current style class
    if (style !== 'day') { // 'day' is the default, no need for extra class
      container.classList.add(`map-style-${style}`);
    }
  }, [style, map]);

  return null;
}

// Map style configurations
const MAP_STYLES = {
  day: {
    name: 'Day',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },
  night: {
    name: 'Night',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  },
  satellite: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri'
  }
};

const ImageMap = ({ userRole }) => {
  const { loading, error, data } = useQuery(GET_IMAGES);
  const [deleteImage] = useMutation(DELETE_IMAGE);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mapStyle, setMapStyle] = useState(() => {
    // Load saved map style from localStorage, default to 'day'
    return localStorage.getItem('mapStyle') || 'day';
  });
  const hasInitializedBounds = useRef(false);
  const mapRef = useRef(null);

  const canWrite = userRole === 'admin' || userRole === 'investigator';

  // Save map style to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('mapStyle', mapStyle);
  }, [mapStyle]);

  const handleDeleteImage = async (imageId) => {
    if (!confirm('Are you sure you want to delete this image? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteImage({
        variables: { id: imageId },
        update: (cache) => {
          // Read the current data from the cache
          const existingData = cache.readQuery({ query: GET_IMAGES });

          if (existingData) {
            // Filter out the deleted image
            const updatedImages = existingData.images.filter(img => img.id !== imageId);

            // Write the updated data back to the cache
            cache.writeQuery({
              query: GET_IMAGES,
              data: { images: updatedImages }
            });
          }
        }
      });
    } catch (err) {
      alert(`Failed to delete image: ${err.message}`);
    }
  };

  if (loading) return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      fontSize: '18px',
      color: '#666'
    }}>
      ⏳ Loading map and images...
    </div>
  );

  if (error) return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      fontSize: '18px',
      color: '#dc3545'
    }}>
      ⚠️ Error loading images: {error.message}
    </div>
  );

  const imagesWithLocation = data?.images?.filter(img => img.latitude && img.longitude) || [];
  const currentStyle = MAP_STYLES[mapStyle];

  // Debug: Log first image to check annotations
  if (imagesWithLocation.length > 0) {
    console.log('First image with annotations:', imagesWithLocation[0].annotations);
  }

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      {/* Map Style Toggle */}
      <div className="map-style-toggle">
        {Object.entries(MAP_STYLES).map(([key, style]) => (
          <button
            key={key}
            onClick={() => setMapStyle(key)}
            className={`map-style-button ${mapStyle === key ? 'active' : ''}`}
          >
            {style.name}
          </button>
        ))}
      </div>

      <MapContainer
        key="main-map"
        center={[60.1699, 24.9384]}
        zoom={10}
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
      >
        <TileLayer
          key={mapStyle}
          attribution={currentStyle.attribution}
          url={currentStyle.url}
        />
        <MapStyleController style={mapStyle} />
        <FitBounds images={imagesWithLocation} hasInitialized={hasInitializedBounds} />

        {imagesWithLocation.map((image) => (
          <Marker
            key={image.id}
            position={[image.latitude, image.longitude]}
          >
            <Popup maxWidth={280} minWidth={260}>
              <div style={{ padding: '4px' }}>
                {/* Image Preview */}
                <div style={{
                  position: 'relative',
                  width: '100%',
                  height: '180px',
                  overflow: 'hidden',
                  borderRadius: '6px',
                  marginBottom: '12px',
                  backgroundColor: '#f5f5f5',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  setSelectedImage(image);
                  setIsModalOpen(true);
                }}>
                  <img
                    src={`${import.meta.env.VITE_API_URL}${image.filePath}`}
                    alt={image.filename}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transition: 'transform 0.2s'
                    }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.parentElement.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #999;">Image not available</div>';
                    }}
                    onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                    onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                  />
                </div>

                {/* Metadata */}
                <div className="popup-metadata">
                  {image.captureTimestamp && (
                    <div className="popup-timestamp">
                      📅 {new Date(image.captureTimestamp).toLocaleString()}
                    </div>
                  )}
                  <div className="popup-coordinates">
                    📍 {formatMGRS(image.longitude, image.latitude)}
                  </div>

                  {/* Tags */}
                  {image.annotations && image.annotations.length > 0 && (
                    <div className="popup-tags">
                      {Array.from(new Set(image.annotations.flatMap(ann => ann.tags || []))).map((tag, idx) => (
                        <span key={idx} className="popup-tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => {
                      setSelectedImage(image);
                      setIsModalOpen(true);
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      backgroundColor: '#1a1a2e',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '500',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#2a2a4e'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = '#1a1a2e'}
                  >
                    View Details
                  </button>
                  {canWrite && (
                    <button
                      onClick={() => handleDeleteImage(image.id)}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '500',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = '#c82333'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = '#dc3545'}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Map Info Overlay */}
      <div className="map-info-overlay">
        <strong>{imagesWithLocation.length}</strong> image{imagesWithLocation.length !== 1 ? 's' : ''} with location data
        {data?.images?.length > imagesWithLocation.length && (
          <> · <span style={{ color: '#888' }}>{data.images.length - imagesWithLocation.length} without location</span></>
        )}
      </div>

      <ImageModal
        image={selectedImage}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedImage(null);
        }}
        readOnly={!canWrite}
      />
    </div>
  );
};

export default ImageMap;
