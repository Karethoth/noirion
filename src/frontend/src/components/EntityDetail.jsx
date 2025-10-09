import React, { useState, useEffect } from 'react';
import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import Notification from './Notification';
import './EntityDetail.css';

const GET_ENTITY = gql`
  query GetEntity($id: ID!) {
    entity(id: $id) {
      id
      entityType
      displayName
      tags
      metadata
      createdAt
      updatedAt
      attributes {
        id
        attributeName
        attributeValue
        confidence
        createdAt
        updatedAt
      }
    }
  }
`;

const CREATE_ENTITY = gql`
  mutation CreateEntity($input: CreateEntityInput!) {
    createEntity(input: $input) {
      id
      entityType
      displayName
      tags
      metadata
      createdAt
      updatedAt
      attributes {
        id
        attributeName
        attributeValue
        confidence
      }
    }
  }
`;

const UPDATE_ENTITY = gql`
  mutation UpdateEntity($id: ID!, $input: UpdateEntityInput!) {
    updateEntity(id: $id, input: $input) {
      id
      entityType
      displayName
      tags
      metadata
      updatedAt
    }
  }
`;

const ADD_ENTITY_ATTRIBUTE = gql`
  mutation AddEntityAttribute($entityId: ID!, $input: AddEntityAttributeInput!) {
    addEntityAttribute(entityId: $entityId, input: $input) {
      id
      attributeName
      attributeValue
      confidence
      createdAt
      updatedAt
    }
  }
`;

const UPDATE_ENTITY_ATTRIBUTE = gql`
  mutation UpdateEntityAttribute($id: ID!, $input: UpdateEntityAttributeInput!) {
    updateEntityAttribute(id: $id, input: $input) {
      id
      attributeName
      attributeValue
      confidence
      updatedAt
    }
  }
`;

const DELETE_ENTITY_ATTRIBUTE = gql`
  mutation DeleteEntityAttribute($id: ID!) {
    deleteEntityAttribute(id: $id)
  }
`;

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
