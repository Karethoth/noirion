import React, { useEffect, useState, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { gql } from '@apollo/client';
import { useQuery, useMutation } from '@apollo/client/react';
import { formatMGRS } from '../utils/coordinates';
import ImageModal from './ImageModal';
import 'leaflet/dist/leaflet.css';
import './ImageMap.css';
import L from 'leaflet';

// Save/restore map position across component remounts
// Store both in module scope and localStorage for persistence
let savedMapView = null;

// Load from localStorage on module load
try {
  const stored = localStorage.getItem('mapView');
  if (stored) {
    savedMapView = JSON.parse(stored);
  }
} catch (e) {
  console.error('Failed to load saved map view:', e);
}

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

// Component to restore saved view or fit bounds to markers
function MapInitializer({ images, hasInitialized }) {
  const map = useMap();

  useEffect(() => {
    if (hasInitialized.current) return;

    // If we have a saved view, restore it
    if (savedMapView?.center) {
      map.setView(savedMapView.center, savedMapView.zoom, { animate: false });
      hasInitialized.current = true;
    }
    // Otherwise, fit bounds to markers if we have images
    else if (images.length > 0) {
      const bounds = L.latLngBounds(images.map(img => [img.latitude, img.longitude]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      hasInitialized.current = true;
    }
    // Only run on mount by excluding images from dependencies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return null;
}

// Component to save map view across remounts
function ViewPersistence() {
  const map = useMap();

  useEffect(() => {
    // Save view on any change
    const saveView = () => {
      const view = {
        center: map.getCenter(),
        zoom: map.getZoom()
      };
      savedMapView = view;

      // Also persist to localStorage
      try {
        localStorage.setItem('mapView', JSON.stringify(view));
      } catch (e) {
        console.error('Failed to save map view:', e);
      }
    };

    map.on('moveend', saveView);
    map.on('zoomend', saveView);

    return () => {
      map.off('moveend', saveView);
      map.off('zoomend', saveView);
    };
  }, [map]);

  return null;
}// Component to apply map style class to container
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
  const { loading, error, data } = useQuery(GET_IMAGES, {
    fetchPolicy: 'cache-and-network', // Use cache first, then update in background
    nextFetchPolicy: 'cache-first', // After first fetch, prefer cache
  });
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

  // Memoize images with location to avoid recreating on every render
  const imagesWithLocation = useMemo(() => {
    return data?.images?.filter(img => img.latitude && img.longitude) || [];
  }, [data?.images]);

  // Calculate distance between two coordinates in meters (Haversine formula)
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  };

  // Group images by proximity (within 50 meters)
  const imageGroups = useMemo(() => {
    const groups = [];
    const processed = new Set();
    const CLUSTER_DISTANCE = 50; // meters

    imagesWithLocation.forEach((image, idx) => {
      if (processed.has(idx)) return;

      const group = {
        lat: image.latitude,
        lng: image.longitude,
        images: [image]
      };
      processed.add(idx);

      // Find all other images within CLUSTER_DISTANCE
      imagesWithLocation.forEach((otherImage, otherIdx) => {
        if (processed.has(otherIdx)) return;

        const distance = calculateDistance(
          image.latitude,
          image.longitude,
          otherImage.latitude,
          otherImage.longitude
        );

        if (distance <= CLUSTER_DISTANCE) {
          group.images.push(otherImage);
          processed.add(otherIdx);
        }
      });

      // Calculate center of group (average position)
      if (group.images.length > 1) {
        const latSum = group.images.reduce((sum, img) => sum + img.latitude, 0);
        const lngSum = group.images.reduce((sum, img) => sum + img.longitude, 0);
        group.lat = latSum / group.images.length;
        group.lng = lngSum / group.images.length;
      }

      groups.push(group);
    });

    return groups;
  }, [imagesWithLocation]);

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

  const currentStyle = MAP_STYLES[mapStyle];

  // Create custom numbered marker icon
  const createNumberedIcon = (count) => {
    return L.divIcon({
      className: 'custom-marker-cluster',
      html: `<div class="marker-cluster-inner">${count}</div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      popupAnchor: [0, -40]
    });
  };

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
        center={savedMapView?.center || [60.1699, 24.9384]}
        zoom={savedMapView?.zoom || 10}
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
      >
        <TileLayer
          key={mapStyle}
          attribution={currentStyle.attribution}
          url={currentStyle.url}
        />
        <MapStyleController style={mapStyle} />
        {!hasInitializedBounds.current && (
          <MapInitializer images={imagesWithLocation} hasInitialized={hasInitializedBounds} />
        )}
        <ViewPersistence />

        {imageGroups.flatMap((group, groupIdx) => {
          const count = group.images.length;
          const markers = [];

          // Add numbered marker at center if multiple images
          if (count > 1) {
            markers.push(
              <Marker
                key={`group-${groupIdx}`}
                position={[group.lat, group.lng]}
                icon={createNumberedIcon(count)}
                eventHandlers={{
                  click: () => {
                    // Click will show popup, but marker is not interactive
                  }
                }}
              />
            );
          }

          // Add individual image markers
          group.images.forEach((image, imgIdx) => {
            let lat = image.latitude;
            let lng = image.longitude;

            if (count > 1) {
              const radius = 0.0003; // ~33 meters - increased for better clickability
              const angle = (imgIdx / count) * 2 * Math.PI;
              lat += radius * Math.cos(angle);
              lng += radius * Math.sin(angle);
            }

            markers.push(
            <Marker
              key={`marker-${groupIdx}-${image.id}`}
              position={[lat, lng]}
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
            );
          });

          return markers;
        })}
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

export default React.memo(ImageMap);
