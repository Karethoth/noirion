import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { gql } from '@apollo/client';
import { useQuery, useMutation } from '@apollo/client/react';
import { formatMGRS } from '../utils/coordinates';
import ImageModal from './ImageModal';
import 'leaflet/dist/leaflet.css';
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

const ImageMap = ({ userRole }) => {
  const { loading, error, data } = useQuery(GET_IMAGES);
  const [deleteImage] = useMutation(DELETE_IMAGE);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const hasInitializedBounds = useRef(false);
  const mapRef = useRef(null);
  
  const canWrite = userRole === 'admin' || userRole === 'investigator';

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

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <MapContainer
        key="main-map"
        center={[60.1699, 24.9384]}
        zoom={10}
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds images={imagesWithLocation} hasInitialized={hasInitializedBounds} />

        {imagesWithLocation.map((image) => (
          <Marker
            key={image.id}
            position={[image.latitude, image.longitude]}
          >
            <Popup>
              <div style={{ minWidth: '200px' }}>
                <img
                  src={`http://localhost:4000${image.filePath}`}
                  alt={image.filename}
                  style={{ width: '100%', maxWidth: '200px', height: 'auto', cursor: 'pointer' }}
                  onClick={() => {
                    setSelectedImage(image);
                    setIsModalOpen(true);
                  }}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'block';
                  }}
                />
                <div style={{ display: 'none', padding: '10px', textAlign: 'center', background: '#f0f0f0' }}>
                  Image not available
                </div>
                <div style={{ marginTop: '10px' }}>
                  {image.captureTimestamp && (
                    <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                      📅 {new Date(image.captureTimestamp).toLocaleString()}
                    </div>
                  )}
                  <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px', fontFamily: 'monospace' }}>
                    📍 {formatMGRS(image.longitude, image.latitude)}
                  </div>
                  <button
                    onClick={() => {
                      setSelectedImage(image);
                      setIsModalOpen(true);
                    }}
                    style={{
                      marginTop: '5px',
                      padding: '5px 10px',
                      backgroundColor: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    View Full Size
                  </button>
                  {canWrite && (
                    <button
                      onClick={() => handleDeleteImage(image.id)}
                      style={{
                        marginTop: '5px',
                        marginLeft: '5px',
                        padding: '5px 10px',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
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

      <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
        Showing {imagesWithLocation.length} image(s) with location data
        {data?.images?.length > imagesWithLocation.length && (
          <> ({data.images.length - imagesWithLocation.length} without location)</>
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
