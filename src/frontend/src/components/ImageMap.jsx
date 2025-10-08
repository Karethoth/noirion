import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
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

const ImageMap = () => {
  const { loading, error, data } = useQuery(GET_IMAGES);
  const [center, setCenter] = useState([60.1699, 24.9384]); // Default to Helsinki
  const [zoom, setZoom] = useState(10);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Update map center when images are loaded
  useEffect(() => {
    if (data?.images?.length > 0) {
      const imagesWithLocation = data.images.filter(img => img.latitude && img.longitude);
      if (imagesWithLocation.length > 0) {
        // Center on first image with location
        const firstImage = imagesWithLocation[0];
        setCenter([firstImage.latitude, firstImage.longitude]);
        setZoom(13);
      }
    }
  }, [data]);

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
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

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
      />
    </div>
  );
};

export default ImageMap;
