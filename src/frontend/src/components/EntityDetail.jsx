import React, { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import Notification from './Notification';
import EntitySearch from './EntitySearch';
import TagPickerModal from './TagPickerModal';
import './EntityDetail.css';
import './TimelineView.css';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { initLeafletDefaultMarkerIcons } from '../utils/leafletInit';
import { formatMGRS, parseMGRS } from '../utils/coordinates';
import MapStyleController from './MapStyleController';
import { MAP_STYLES, loadSavedMapStyle } from '../utils/mapStyles';
import { loadSavedMapView } from '../utils/mapViewStorage';
import { buildAssetUrl } from '../utils/assetUrls';
import {
  GET_ENTITY,
  GET_ENTITIES,
  GET_IMAGES_BY_ENTITY,
  CREATE_ENTITY,
  UPDATE_ENTITY,
  ADD_ENTITY_ATTRIBUTE,
  UPDATE_ENTITY_ATTRIBUTE,
  DELETE_ENTITY_ATTRIBUTE
} from '../graphql/entities';
import { GET_PRESENCES_BY_ENTITY } from '../graphql/presences';
import { GET_ENTITY_LINKS, CREATE_ENTITY_LINK, DELETE_ENTITY_LINK } from '../graphql/entityLinks';
import { GET_EVENTS_BY_ENTITY } from '../graphql/events';

initLeafletDefaultMarkerIcons();

const EntityDetail = ({ entity, onClose, onSaved, userRole }) => {
  const isNewEntity = !entity;
  const canWrite = userRole === 'admin' || userRole === 'investigator';

  const extractLatLngFromAttributes = (attrs) => {
    if (!Array.isArray(attrs)) return { lat: '', lng: '' };

    const byName = new Map();
    for (const a of attrs) {
      const key = String(a?.attributeName || '').trim().toLowerCase();
      if (!key) continue;
      byName.set(key, a);
    }

    const parseScalar = (v) => {
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      if (typeof v === 'string') {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };

    // Preferred explicit keys
    const latAttr = byName.get('latitude') || byName.get('lat');
    const lngAttr = byName.get('longitude') || byName.get('lng') || byName.get('lon');

    let lat = parseScalar(latAttr?.attributeValue);
    let lng = parseScalar(lngAttr?.attributeValue);

    // Optional combined object keys
    if (lat == null || lng == null) {
      const locAttr = byName.get('location') || byName.get('coords') || byName.get('coordinates');
      const obj = locAttr?.attributeValue;
      if (obj && typeof obj === 'object') {
        if (lat == null) lat = parseScalar(obj.lat ?? obj.latitude ?? obj.y);
        if (lng == null) lng = parseScalar(obj.lng ?? obj.lon ?? obj.longitude ?? obj.x);
      }
    }

    return {
      lat: lat != null ? String(lat) : '',
      lng: lng != null ? String(lng) : ''
    };
  };

  // Form state
  const [entityType, setEntityType] = useState(entity?.entityType || 'person');
  const [displayName, setDisplayName] = useState(entity?.displayName || '');
  const [tags, setTags] = useState(entity?.tags?.join(', ') || '');
  const [attributes, setAttributes] = useState(entity?.attributes || []);

  const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);

  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [locationLat, setLocationLat] = useState('');
  const [locationLng, setLocationLng] = useState('');
  const [locationMGRS, setLocationMGRS] = useState('');

  const mapStyle = loadSavedMapStyle('mapStyle');

  // New attribute form
  const [newAttrName, setNewAttrName] = useState('');
  const [newAttrValue, setNewAttrValue] = useState('');
  const [newAttrConfidence, setNewAttrConfidence] = useState(1.0);

  // Notification state
  const [notification, setNotification] = useState(null);

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
  };

  // Load entity data if editing existing entity
  const { data: entityData, refetch } = useQuery(GET_ENTITY, {
    variables: { id: entity?.id },
    skip: isNewEntity,
    onCompleted: (data) => {
      if (data?.entity) {
        setAttributes(data.entity.attributes || []);
      }
    }
  });

  const { data: allEntitiesData } = useQuery(GET_ENTITIES, {
    variables: {
      entityType: null,
      limit: 500,
      offset: 0,
    },
  });

  const tagCounts = React.useMemo(() => {
    const counts = new Map();
    const ents = allEntitiesData?.entities || [];
    for (const e of ents) {
      const uniq = new Set((e?.tags || []).filter(Boolean).map((t) => String(t)));
      for (const t of uniq) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    return counts;
  }, [allEntitiesData?.entities]);

  const topTags = React.useMemo(() => {
    const entries = Array.from(tagCounts.entries());
    entries.sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
    return entries.map(([tag, count]) => ({ tag, count }));
  }, [tagCounts]);

  const { data: presencesData } = useQuery(GET_PRESENCES_BY_ENTITY, {
    variables: {
      entityId: entity?.id,
      limit: 500,
      offset: 0
    },
    skip: isNewEntity
  });

  const { data: imagesByEntityData } = useQuery(GET_IMAGES_BY_ENTITY, {
    variables: {
      entityId: entity?.id,
      limit: 1000,
      offset: 0,
    },
    skip: isNewEntity,
    fetchPolicy: 'cache-and-network',
  });

  const assetPreviewUrl = (img) => {
    return buildAssetUrl(img?.filePath);
  };

  const { data: eventsByEntityData } = useQuery(GET_EVENTS_BY_ENTITY, {
    variables: {
      entityId: entity?.id,
      limit: 200,
      offset: 0
    },
    skip: isNewEntity
  });

  const { data: linksData, refetch: refetchLinks } = useQuery(GET_ENTITY_LINKS, {
    variables: {
      entityId: entity?.id,
      limit: 100,
      offset: 0
    },
    skip: isNewEntity
  });

  const [createEntityLink] = useMutation(CREATE_ENTITY_LINK, {
    onCompleted: () => {
      if (refetchLinks) refetchLinks();
    }
  });

  const [deleteEntityLink] = useMutation(DELETE_ENTITY_LINK, {
    onCompleted: () => {
      if (refetchLinks) refetchLinks();
    }
  });

  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [selectedTargetLabel, setSelectedTargetLabel] = useState('');
  const [relationType, setRelationType] = useState('associates_with');
  const [linkConfidence, setLinkConfidence] = useState(1.0);
  const [linkNotes, setLinkNotes] = useState('');

  const handleCreateLink = async () => {
    if (!canWrite) {
      showNotification('You do not have permission to modify relationships', 'error');
      return;
    }
    if (!entity?.id || !selectedTargetId) {
      showNotification('Select a target entity', 'error');
      return;
    }
    if (!relationType) {
      showNotification('Provide a relation type', 'error');
      return;
    }

    try {
      await createEntityLink({
        variables: {
          input: {
            fromEntityId: entity.id,
            toEntityId: selectedTargetId,
            relationType,
            confidence: parseFloat(linkConfidence),
            notes: linkNotes || null
          }
        }
      });
      setSelectedTargetId('');
      setSelectedTargetLabel('');
      setLinkNotes('');
      showNotification('Relationship created', 'success');
    } catch (err) {
      console.error('Error creating relationship:', err);
      showNotification(`Failed to create relationship: ${err.message}`, 'error');
    }
  };

  const handleDeleteLink = async (id) => {
    if (!canWrite) return;
    if (!window.confirm('Delete this relationship?')) return;
    try {
      await deleteEntityLink({ variables: { id } });
      showNotification('Relationship deleted', 'success');
    } catch (err) {
      console.error('Error deleting relationship:', err);
      showNotification(`Failed to delete relationship: ${err.message}`, 'error');
    }
  };

  useEffect(() => {
    if (entityData?.entity) {
      setEntityType(entityData.entity.entityType);
      setDisplayName(entityData.entity.displayName || '');
      setTags(entityData.entity.tags?.join(', ') || '');
      setAttributes(entityData.entity.attributes || []);

      const { lat, lng } = extractLatLngFromAttributes(entityData.entity.attributes || []);
      setLocationLat(lat);
      setLocationLng(lng);
      if (lat && lng) {
        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lng);
        if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
          setLocationMGRS(formatMGRS(lngNum, latNum));
        }
      }
    }
  }, [entityData]);

  useEffect(() => {
    // When opening the modal, we may have entity attributes from the parent list already;
    // prefill from those immediately while the GET_ENTITY query resolves.
    if (isNewEntity) return;
    const { lat, lng } = extractLatLngFromAttributes(entity?.attributes || []);
    if (lat) setLocationLat(lat);
    if (lng) setLocationLng(lng);
    if (lat && lng) {
      const latNum = parseFloat(lat);
      const lngNum = parseFloat(lng);
      if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
        setLocationMGRS(formatMGRS(lngNum, latNum));
      }
    }
  }, [isNewEntity, entity?.id, entity?.attributes]);

  const [createEntity, { loading: creating }] = useMutation(CREATE_ENTITY);
  const [updateEntity, { loading: updating }] = useMutation(UPDATE_ENTITY);
  const [addAttribute] = useMutation(ADD_ENTITY_ATTRIBUTE);
  const [updateAttribute] = useMutation(UPDATE_ENTITY_ATTRIBUTE);
  const [deleteAttribute] = useMutation(DELETE_ENTITY_ATTRIBUTE);

  const upsertAttributeByName = async (entityId, attributeName, attributeValue, confidence = 1.0) => {
    const existing = (attributes || []).find((a) => a.attributeName === attributeName);
    if (existing?.id) {
      const result = await updateAttribute({
        variables: {
          id: existing.id,
          input: {
            attributeValue,
            confidence: confidence != null ? parseFloat(confidence) : null
          }
        }
      });
      const updated = result?.data?.updateEntityAttribute;
      if (updated?.id) {
        setAttributes((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      }
      return;
    }

    const result = await addAttribute({
      variables: {
        entityId,
        input: {
          attributeName,
          attributeValue,
          confidence: confidence != null ? parseFloat(confidence) : null
        }
      }
    });
    const created = result?.data?.addEntityAttribute;
    if (created?.id) {
      setAttributes((prev) => [...prev, created]);
    }
  };

  const persistLocationAttributesIfNeeded = async (entityId) => {
    if (!entityId) return;
    if (entityType !== 'location') return;

    let lat = locationLat.trim() ? parseFloat(locationLat) : null;
    let lng = locationLng.trim() ? parseFloat(locationLng) : null;
    if ((lat == null || lng == null) && locationMGRS.trim()) {
      const parsed = parseMGRS(locationMGRS);
      if (!parsed) {
        throw new Error('Invalid MGRS coordinate');
      }
      lat = parsed.latitude;
      lng = parsed.longitude;
      setLocationLat(String(lat));
      setLocationLng(String(lng));
    }
    if (lat == null || lng == null) return;
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;

    await upsertAttributeByName(entityId, 'latitude', lat, 1.0);
    await upsertAttributeByName(entityId, 'longitude', lng, 1.0);
  };

  const handleSave = async () => {
    if (!canWrite) {
      showNotification('You do not have permission to modify entities', 'error');
      return;
    }

    try {
      const tagArray = tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      if (isNewEntity) {
        const result = await createEntity({
          variables: {
            input: {
              entityType,
              displayName,
              tags: tagArray
            }
          }
        });

        const createdEntityId = result?.data?.createEntity?.id;
        await persistLocationAttributesIfNeeded(createdEntityId);
        showNotification('Entity created successfully', 'success');
        onSaved(result.data.createEntity);
      } else {
        await updateEntity({
          variables: {
            id: entity.id,
            input: {
              displayName,
              tags: tagArray
            }
          }
        });

        await persistLocationAttributesIfNeeded(entity.id);
        showNotification('Entity updated successfully', 'success');
        refetch();
        onSaved();
      }
    } catch (err) {
      console.error('Error saving entity:', err);
      showNotification(`Failed to save entity: ${err.message}`, 'error');
    }
  };

  const LocationPicker = ({ valueLat, valueLng, onPick }) => {
    useMapEvents({
      click(e) {
        onPick(e.latlng.lat, e.latlng.lng);
      }
    });

    if (valueLat == null || valueLng == null) return null;
    return <Marker position={[valueLat, valueLng]} />;
  };

  const LocationPickerModal = ({ isOpen, title, valueLat, valueLng, onPick, onClose }) => {
    if (!isOpen) return null;

    const saved = loadSavedMapView('mapView');
    const fallbackCenter = saved?.center ? [saved.center.lat, saved.center.lng] : [60.1699, 24.9384];
    const fallbackZoom = typeof saved?.zoom === 'number' ? saved.zoom : 4;

    const hasValue = Number.isFinite(valueLat) && Number.isFinite(valueLng);
    const center = hasValue ? [valueLat, valueLng] : fallbackCenter;
    const zoom = hasValue ? 14 : fallbackZoom;
    const styleCfg = MAP_STYLES[mapStyle] || MAP_STYLES.day;

    return (
      <div className="timeline-modal-overlay" onClick={onClose}>
        <div className="timeline-modal" onClick={(e) => e.stopPropagation()}>
          <div className="timeline-modal-header">
            <div className="timeline-modal-title">{title}</div>
            <button className="timeline-modal-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
          <div className="timeline-modal-body">
            <div className="timeline-map-container">
              <MapContainer
                center={center}
                zoom={zoom}
                scrollWheelZoom={true}
                style={{ height: '340px', width: '100%' }}
              >
                <MapStyleController style={mapStyle} />
                <TileLayer attribution={styleCfg.attribution} url={styleCfg.url} />
                <LocationPicker
                  valueLat={hasValue ? valueLat : null}
                  valueLng={hasValue ? valueLng : null}
                  onPick={(lat, lng) => {
                    onPick(lat, lng);
                    onClose();
                  }}
                />
              </MapContainer>
            </div>
            <div className="timeline-muted">Click the map to set latitude/longitude.</div>
          </div>
        </div>
      </div>
    );
  };

  const handleAddAttribute = async () => {
    if (!canWrite) {
      showNotification('You do not have permission to modify entities', 'error');
      return;
    }

    if (!newAttrName || !newAttrValue) {
      showNotification('Please provide both attribute name and value', 'error');
      return;
    }

    if (isNewEntity) {
      showNotification('Please save the entity first before adding attributes', 'info');
      return;
    }

    try {
      let parsedValue;
      try {
        parsedValue = JSON.parse(newAttrValue);
      } catch {
        // If not valid JSON, treat as string
        parsedValue = newAttrValue;
      }

      const result = await addAttribute({
        variables: {
          entityId: entity.id,
          input: {
            attributeName: newAttrName,
            attributeValue: parsedValue,
            confidence: parseFloat(newAttrConfidence)
          }
        }
      });

      setAttributes([...attributes, result.data.addEntityAttribute]);
      setNewAttrName('');
      setNewAttrValue('');
      setNewAttrConfidence(1.0);
      showNotification('Attribute added successfully', 'success');
    } catch (err) {
      console.error('Error adding attribute:', err);
      showNotification(`Failed to add attribute: ${err.message}`, 'error');
    }
  };

  const handleDeleteAttribute = async (attrId) => {
    if (!canWrite) {
      showNotification('You do not have permission to modify entities', 'error');
      return;
    }

    if (window.confirm('Are you sure you want to delete this attribute?')) {
      try {
        await deleteAttribute({ variables: { id: attrId } });
        setAttributes(attributes.filter(a => a.id !== attrId));
        showNotification('Attribute deleted successfully', 'success');
      } catch (err) {
        console.error('Error deleting attribute:', err);
        showNotification(`Failed to delete attribute: ${err.message}`, 'error');
      }
    }
  };

  return (
    <>
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}
      <div className="entity-detail-overlay">
      <div className="entity-detail-modal">
        <div className="entity-detail-header">
          <h2>{isNewEntity ? 'Create New Entity' : 'Edit Entity'}</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="entity-detail-content">
          <div className="form-section">
            <h3>Basic Information</h3>

            <div className="form-group">
              <label>Entity Type *</label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                disabled={!isNewEntity || !canWrite}
                className="form-control"
              >
                <option value="person">Person</option>
                <option value="vehicle">Vehicle</option>
                <option value="item">Item</option>
                <option value="location">Location</option>
                <option value="organization">Organization</option>
              </select>
            </div>

            <div className="form-group">
              <label>Display Name *</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter entity name"
                disabled={!canWrite}
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label>Tags (comma-separated)</label>
              <input
                type="text"
                value={tags}
                readOnly
                onClick={() => {
                  if (!canWrite) return;
                  setIsTagsModalOpen(true);
                }}
                onFocus={() => {
                  if (!canWrite) return;
                  setIsTagsModalOpen(true);
                }}
                placeholder="tag1, tag2, category:value"
                disabled={!canWrite}
                className="form-control"
              />
              <TagPickerModal
                isOpen={isTagsModalOpen}
                title="Edit tags"
                value={tags}
                onChange={setTags}
                tagsWithCounts={topTags}
                placeholder="tag1, tag2, category:value"
                onClose={() => setIsTagsModalOpen(false)}
              />
              <small style={{ color: '#888', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                Use tags to categorize and add metadata. Examples: "color:blue", "status:active", "priority:high"
              </small>
            </div>
          </div>

          {entityType === 'location' && (
            <div className="form-section">
              <h3>Location</h3>

              <div className="form-group">
                <label>MGRS</label>
                <input
                  type="text"
                  value={locationMGRS}
                  onChange={(e) => {
                    const next = e.target.value;
                    setLocationMGRS(next);
                    const parsed = parseMGRS(next);
                    if (parsed) {
                      setLocationLat(String(parsed.latitude));
                      setLocationLng(String(parsed.longitude));
                    }
                  }}
                  placeholder="e.g. 35WLP 70743 01293"
                  disabled={!canWrite}
                  className="form-control"
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn-save"
                  onClick={() => setIsLocationModalOpen(true)}
                  disabled={!canWrite}
                >
                  Set place…
                </button>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => {
                    setLocationLat('');
                    setLocationLng('');
                    setLocationMGRS('');
                  }}
                  disabled={!canWrite}
                >
                  Clear place
                </button>
              </div>
            </div>
          )}

          <LocationPickerModal
            isOpen={isLocationModalOpen}
            title="Set entity location"
            valueLat={(() => {
              const v = locationLat.trim() ? parseFloat(locationLat) : null;
              return Number.isFinite(v) ? v : null;
            })()}
            valueLng={(() => {
              const v = locationLng.trim() ? parseFloat(locationLng) : null;
              return Number.isFinite(v) ? v : null;
            })()}
            onPick={(lat, lng) => {
              setLocationLat(String(lat));
              setLocationLng(String(lng));
              setLocationMGRS(formatMGRS(lng, lat));
            }}
            onClose={() => setIsLocationModalOpen(false)}
          />

          {!isNewEntity && (
            <div className="form-section">
              <h3>Attributes</h3>

              {attributes.length > 0 ? (
                <div className="attributes-list">
                  {attributes.map(attr => (
                    <div key={attr.id} className="attribute-item">
                      <div className="attribute-info">
                        <div className="attribute-name">{attr.attributeName}</div>
                        <div className="attribute-value">
                          {typeof attr.attributeValue === 'object'
                            ? JSON.stringify(attr.attributeValue)
                            : String(attr.attributeValue)}
                        </div>
                        <div className="attribute-meta">
                          Confidence: {(attr.confidence * 100).toFixed(0)}%
                        </div>
                      </div>
                      {canWrite && (
                        <button
                          className="btn-delete-attr"
                          onClick={() => handleDeleteAttribute(attr.id)}
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-attributes">No attributes yet</div>
              )}

              {canWrite && (
                <div className="add-attribute-form">
                  <h4>Add New Attribute</h4>
                  <div className="form-row">
                    <input
                      type="text"
                      placeholder="Attribute name"
                      value={newAttrName}
                      onChange={(e) => setNewAttrName(e.target.value)}
                      className="form-control"
                    />
                    <input
                      type="text"
                      placeholder="Value (text or JSON)"
                      value={newAttrValue}
                      onChange={(e) => setNewAttrValue(e.target.value)}
                      className="form-control"
                    />
                    <input
                      type="number"
                      placeholder="Confidence"
                      value={newAttrConfidence}
                      onChange={(e) => setNewAttrConfidence(e.target.value)}
                      min="0"
                      max="1"
                      step="0.1"
                      className="form-control form-control-small"
                    />
                    <button
                      className="btn-add-attr"
                      onClick={handleAddAttribute}
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!isNewEntity && (
            <div className="form-section">
              <h3>Assets</h3>

              {imagesByEntityData?.imagesByEntity?.length > 0 ? (
                <div className="attributes-list">
                  {imagesByEntityData.imagesByEntity.map((img) => (
                    <div key={img.id} className="attribute-item">
                      <div className="attribute-info" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        {img.filePath ? (
                          <img
                            src={assetPreviewUrl(img) || ''}
                            alt={img.displayName || img.filename || `Asset ${img.id}`}
                            loading="lazy"
                            style={{
                              width: 54,
                              height: 54,
                              borderRadius: 8,
                              objectFit: 'cover',
                              border: '1px solid rgba(255,255,255,0.12)',
                              background: 'rgba(0,0,0,0.25)',
                              flex: '0 0 auto',
                            }}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : null}
                        <div style={{ minWidth: 0 }}>
                          <div className="attribute-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {img.displayName || img.filename || `Asset ${img.id}`}
                          </div>
                          <div className="attribute-meta">
                            {img.captureTimestamp
                              ? `Captured: ${new Date(img.captureTimestamp).toLocaleString()}`
                              : img.uploadedAt
                                ? `Uploaded: ${new Date(img.uploadedAt).toLocaleString()}`
                                : 'Time: unknown'}
                          </div>
                          <div className="attribute-meta">
                            {img.latitude != null && img.longitude != null
                              ? `Coords: ${formatMGRS(Number(img.longitude), Number(img.latitude))}`
                              : 'Coords: —'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#888', fontSize: '14px' }}>
                  No linked assets yet.
                </div>
              )}
            </div>
          )}

          {!isNewEntity && (
            <div className="form-section">
              <h3>Presences</h3>

              {presencesData?.presencesByEntity?.length > 0 ? (
                <div className="attributes-list">
                  {presencesData.presencesByEntity.map((p) => (
                    <div key={p.id} className="attribute-item">
                      <div className="attribute-info" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        {p?.sourceAsset?.filePath ? (
                          <img
                            src={buildAssetUrl(p.sourceAsset.filePath)}
                            alt={p?.sourceAsset?.id ? `Asset ${p.sourceAsset.id}` : 'Asset'}
                            loading="lazy"
                            style={{
                              width: 54,
                              height: 54,
                              borderRadius: 8,
                              objectFit: 'cover',
                              border: '1px solid rgba(255,255,255,0.12)',
                              background: 'rgba(0,0,0,0.25)',
                              flex: '0 0 auto',
                            }}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : null}

                        <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="attribute-name">
                          {p.observedAt ? new Date(p.observedAt).toLocaleString() : 'Unknown time'}
                        </div>
                        <div className="attribute-value">
                          {p.latitude != null && p.longitude != null
                            ? formatMGRS(p.longitude, p.latitude)
                            : 'No GPS'}
                        </div>
                        <div className="attribute-meta">
                          {p.sourceType ? `Source: ${p.sourceType}` : 'Source: unknown'}
                        </div>
                        {p?.sourceAsset?.id && (
                          <div className="attribute-meta">
                            Asset: {p.sourceAsset.id}
                          </div>
                        )}
                        {p.notes && (
                          <div className="attribute-meta">
                            Notes: {p.notes}
                          </div>
                        )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#888', fontSize: '14px' }}>
                  No presences yet. Linking this entity to an annotation will create one.
                </div>
              )}
            </div>
          )}

          {!isNewEntity && (
            <div className="form-section">
              <h3>Events</h3>

              {eventsByEntityData?.eventsByEntity?.length > 0 ? (
                <div className="attributes-list">
                  {eventsByEntityData.eventsByEntity.map((evt) => (
                    <div key={evt.id} className="attribute-item">
                      <div className="attribute-info">
                        <div className="attribute-name">
                          {evt.title || 'Untitled event'}
                        </div>
                        <div className="attribute-value">
                          {evt.occurredAt ? new Date(evt.occurredAt).toLocaleString() : 'Unknown time'}
                        </div>
                        {evt.description && (
                          <div className="attribute-meta">
                            {evt.description}
                          </div>
                        )}
                        <div className="attribute-meta">
                          {evt.latitude != null && evt.longitude != null
                            ? formatMGRS(evt.longitude, evt.latitude)
                            : 'No GPS'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#888', fontSize: '14px' }}>
                  No events yet.
                </div>
              )}
            </div>
          )}

          {!isNewEntity && (
            <div className="form-section">
              <h3>Relationships</h3>

              {canWrite && (
                <div style={{ marginBottom: '12px' }}>
                  <div className="form-group">
                    <label>Target entity</label>
                    <EntitySearch
                      placeholder="Search entities..."
                      onSelect={(target) => {
                        if (!target?.id) return;
                        if (target.id === entity?.id) {
                          showNotification('You cannot link an entity to itself', 'error');
                          return;
                        }
                        setSelectedTargetId(target.id);
                        setSelectedTargetLabel(`${target.displayName || 'Unnamed'} (${target.entityType || 'unknown'})`);
                      }}
                    />

                    {selectedTargetId && (
                      <div style={{ marginTop: '8px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <div style={{ color: '#666', fontSize: '13px' }}>
                          Selected: <strong>{selectedTargetLabel || selectedTargetId}</strong>
                        </div>
                        <button
                          type="button"
                          className="btn-cancel"
                          onClick={() => {
                            setSelectedTargetId('');
                            setSelectedTargetLabel('');
                          }}
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Relation type</label>
                    <input
                      type="text"
                      value={relationType}
                      onChange={(e) => setRelationType(e.target.value)}
                      placeholder="e.g. knows, owns, drives, associates_with"
                      className="form-control"
                    />
                  </div>

                  <div className="form-group">
                    <label>Confidence (0-1)</label>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={linkConfidence}
                      onChange={(e) => setLinkConfidence(e.target.value)}
                      className="form-control"
                    />
                  </div>

                  <div className="form-group">
                    <label>Notes</label>
                    <input
                      type="text"
                      value={linkNotes}
                      onChange={(e) => setLinkNotes(e.target.value)}
                      placeholder="Optional"
                      className="form-control"
                    />
                  </div>

                  <button className="btn-save" onClick={handleCreateLink}>
                    + Add Relationship
                  </button>
                </div>
              )}

              {linksData?.entityLinks?.length > 0 ? (
                <div className="attributes-list">
                  {linksData.entityLinks.map((l) => {
                    const isOutgoing = l.fromEntityId === entity?.id;
                    const other = isOutgoing ? l.toEntity : l.fromEntity;
                    const directionLabel = isOutgoing ? '→' : '←';
                    return (
                      <div key={l.id} className="attribute-item">
                        <div className="attribute-info">
                          <div className="attribute-name">
                            {directionLabel} {l.relationType}
                          </div>
                          <div className="attribute-value">
                            {other?.displayName || 'Unnamed'} ({other?.entityType || 'unknown'})
                          </div>
                          <div className="attribute-meta">
                            Confidence: {l.confidence != null ? `${Math.round(l.confidence * 100)}%` : 'n/a'}
                          </div>
                          {l.notes && (
                            <div className="attribute-meta">
                              Notes: {l.notes}
                            </div>
                          )}
                        </div>
                        {canWrite && (
                          <button className="btn-delete-attr" onClick={() => handleDeleteLink(l.id)}>
                            🗑️
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ color: '#888', fontSize: '14px' }}>
                  No relationships yet.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="entity-detail-footer">
          <button className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          {canWrite && (
            <button
              className="btn-save"
              onClick={handleSave}
              disabled={creating || updating}
            >
              {creating || updating ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
    </>
  );
};

export default EntityDetail;
