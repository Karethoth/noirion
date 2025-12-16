import React, { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client/react';
import Notification from './Notification';
import './EntityList.css';
import { GET_ENTITIES, DELETE_ENTITY } from '../graphql/entities';
import { formatMGRS } from '../utils/coordinates';

const EntityList = ({ onSelectEntity, userRole, onRefetchReady }) => {
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [notification, setNotification] = useState(null);

  const canWrite = userRole === 'admin' || userRole === 'investigator';

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
  };

  const { loading, error, data, refetch } = useQuery(GET_ENTITIES, {
    variables: {
      entityType: entityTypeFilter || null,
      limit: 100,
      offset: 0
    }
  });

  // Expose refetch function to parent
  React.useEffect(() => {
    if (onRefetchReady) {
      onRefetchReady(refetch);
    }
  }, [refetch, onRefetchReady]);

  const [deleteEntity] = useMutation(DELETE_ENTITY, {
    onCompleted: () => {
      refetch();
    }
  });

  const handleDelete = async (entityId, entityName) => {
    if (!canWrite) {
      showNotification('You do not have permission to delete entities', 'error');
      return;
    }

    if (window.confirm(`Are you sure you want to delete entity "${entityName}"?`)) {
      try {
        await deleteEntity({ variables: { id: entityId } });
        showNotification('Entity deleted successfully', 'success');
      } catch (err) {
        console.error('Error deleting entity:', err);
        showNotification(`Failed to delete entity: ${err.message}`, 'error');
      }
    }
  };

  if (loading) return <div className="entity-list-loading">Loading entities...</div>;
  if (error) return <div className="entity-list-error">Error loading entities: {error.message}</div>;

  const entities = data?.entities || [];

  const extractLatLngFromAttributes = (attrs) => {
    if (!Array.isArray(attrs)) return { lat: null, lng: null };
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

    const latAttr = byName.get('latitude') || byName.get('lat');
    const lngAttr = byName.get('longitude') || byName.get('lng') || byName.get('lon');
    const lat = parseScalar(latAttr?.attributeValue);
    const lng = parseScalar(lngAttr?.attributeValue);
    return { lat, lng };
  };

  // Filter entities based on search query
  const filteredEntities = entities.filter(entity => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      entity.displayName?.toLowerCase().includes(query) ||
      entity.entityType?.toLowerCase().includes(query) ||
      entity.tags?.some(tag => tag.toLowerCase().includes(query))
    );
  });

  // Get unique entity types for filter dropdown
  const entityTypes = [...new Set(entities.map(e => e.entityType))].sort();

  return (
    <>
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}
      <div className="entity-list-container">
      <div className="entity-list-header">
        <h2>Entities</h2>
        {canWrite && (
          <button
            className="btn-new-entity"
            onClick={() => onSelectEntity(null)}
          >
            + New Entity
          </button>
        )}
      </div>

      <div className="entity-list-filters">
        <input
          type="text"
          placeholder="Search entities..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="entity-search-input"
        />
        <select
          value={entityTypeFilter}
          onChange={(e) => setEntityTypeFilter(e.target.value)}
          className="entity-type-filter"
        >
          <option value="">All Types</option>
          {entityTypes.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>

      <div className="entity-list">
        {filteredEntities.length === 0 ? (
          <div className="entity-list-empty">
            {searchQuery || entityTypeFilter ? 'No entities match your filters' : 'No entities yet'}
          </div>
        ) : (
          filteredEntities.map(entity => (
            <div
              key={entity.id}
              className="entity-item"
              onClick={() => onSelectEntity(entity)}
            >
              <div className="entity-item-header">
                <div className="entity-item-name">
                  {entity.displayName || 'Unnamed Entity'}
                </div>
                <div className="entity-item-type">{entity.entityType}</div>
              </div>

              {entity.attributes && entity.attributes.length > 0 && (
                <div className="entity-item-attributes">
                  {(() => {
                    const { lat, lng } = extractLatLngFromAttributes(entity.attributes);
                    const hasCoord = lat != null && lng != null;
                    const filtered = entity.attributes.filter((a) => {
                      const name = String(a?.attributeName || '').trim().toLowerCase();
                      return name !== 'latitude' && name !== 'longitude' && name !== 'lat' && name !== 'lng' && name !== 'lon';
                    });
                    const previews = [];
                    if (hasCoord) {
                      previews.push(
                        <div key="mgrs" className="entity-attribute-preview">
                          <span className="attr-name">MGRS:</span>
                          <span className="attr-value">{formatMGRS(lng, lat)}</span>
                        </div>
                      );
                    }
                    for (const attr of filtered.slice(0, hasCoord ? 2 : 3)) {
                      previews.push(
                        <div key={attr.id} className="entity-attribute-preview">
                          <span className="attr-name">{attr.attributeName}:</span>
                          <span className="attr-value">
                            {typeof attr.attributeValue === 'object'
                              ? JSON.stringify(attr.attributeValue)
                              : String(attr.attributeValue)}
                          </span>
                        </div>
                      );
                    }
                    return previews;
                  })()}
                  {entity.attributes.length > 3 && (
                    <div className="entity-attribute-more">
                      +{entity.attributes.length - 3} more
                    </div>
                  )}
                </div>
              )}

              {entity.tags && entity.tags.length > 0 && (
                <div className="entity-item-tags">
                  {entity.tags.map((tag, idx) => {
                    // Strip "general:" prefix for display
                    const displayTag = tag.startsWith('general:') ? tag.substring(8) : tag;
                    return <span key={idx} className="entity-tag">{displayTag}</span>;
                  })}
                </div>
              )}

              {canWrite && (
                <div className="entity-item-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn-delete-entity"
                    onClick={() => handleDelete(entity.id, entity.displayName)}
                    title="Delete entity"
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
    </>
  );
};

export default EntityList;
