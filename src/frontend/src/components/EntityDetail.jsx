import React, { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import Notification from './Notification';
import EntitySearch from './EntitySearch';
import './EntityDetail.css';
import {
  GET_ENTITY,
  CREATE_ENTITY,
  UPDATE_ENTITY,
  ADD_ENTITY_ATTRIBUTE,
  UPDATE_ENTITY_ATTRIBUTE,
  DELETE_ENTITY_ATTRIBUTE
} from '../graphql/entities';
import { GET_PRESENCES_BY_ENTITY } from '../graphql/presences';
import { GET_ENTITY_LINKS, CREATE_ENTITY_LINK, DELETE_ENTITY_LINK } from '../graphql/entityLinks';

const EntityDetail = ({ entity, onClose, onSaved, userRole }) => {
  const isNewEntity = !entity;
  const canWrite = userRole === 'admin' || userRole === 'investigator';

  // Form state
  const [entityType, setEntityType] = useState(entity?.entityType || 'person');
  const [displayName, setDisplayName] = useState(entity?.displayName || '');
  const [tags, setTags] = useState(entity?.tags?.join(', ') || '');
  const [attributes, setAttributes] = useState(entity?.attributes || []);

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

  const { data: presencesData } = useQuery(GET_PRESENCES_BY_ENTITY, {
    variables: {
      entityId: entity?.id,
      limit: 50,
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
    }
  }, [entityData]);

  const [createEntity, { loading: creating }] = useMutation(CREATE_ENTITY);
  const [updateEntity, { loading: updating }] = useMutation(UPDATE_ENTITY);
  const [addAttribute] = useMutation(ADD_ENTITY_ATTRIBUTE);
  const [deleteAttribute] = useMutation(DELETE_ENTITY_ATTRIBUTE);

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
        showNotification('Entity updated successfully', 'success');
        refetch();
        onSaved();
      }
    } catch (err) {
      console.error('Error saving entity:', err);
      showNotification(`Failed to save entity: ${err.message}`, 'error');
    }
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
                onChange={(e) => setTags(e.target.value)}
                placeholder="tag1, tag2, category:value"
                disabled={!canWrite}
                className="form-control"
              />
              <small style={{ color: '#888', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                Use tags to categorize and add metadata. Examples: "color:blue", "status:active", "priority:high"
              </small>
            </div>
          </div>

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
              <h3>Presences</h3>

              {presencesData?.presencesByEntity?.length > 0 ? (
                <div className="attributes-list">
                  {presencesData.presencesByEntity.map((p) => (
                    <div key={p.id} className="attribute-item">
                      <div className="attribute-info">
                        <div className="attribute-name">
                          {p.observedAt ? new Date(p.observedAt).toLocaleString() : 'Unknown time'}
                        </div>
                        <div className="attribute-value">
                          {p.latitude != null && p.longitude != null
                            ? `${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}`
                            : 'No GPS'}
                        </div>
                        <div className="attribute-meta">
                          {p.sourceType ? `Source: ${p.sourceType}` : 'Source: unknown'}
                        </div>
                        {p.notes && (
                          <div className="attribute-meta">
                            Notes: {p.notes}
                          </div>
                        )}
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
