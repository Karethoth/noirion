import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@apollo/client/react';
import { gql } from '@apollo/client';
import './EntitySearch.css';

const SEARCH_ENTITIES = gql`
  query SearchEntities($query: String!, $entityType: String, $limit: Int) {
    searchEntities(query: $query, entityType: $entityType, limit: $limit) {
      id
      entityType
      displayName
      tags
    }
  }
`;

/**
 * EntitySearch - Autocomplete component for searching and selecting entities
 * @param {Function} onSelect - Callback when an entity is selected (entity) => void
 * @param {String} placeholder - Placeholder text for the search input
 * @param {String} entityType - Optional filter by entity type
 */
const EntitySearch = ({ onSelect, placeholder = "Search entities...", entityType = null }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  const { data, loading } = useQuery(SEARCH_ENTITIES, {
    variables: {
      query: searchQuery || ' ',
      entityType,
      limit: 10
    },
    skip: searchQuery.length < 1
  });

  const entities = React.useMemo(() => data?.searchEntities || [], [data]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [entities]);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    setIsOpen(value.length > 0);
  };

  const handleSelect = (entity) => {
    onSelect(entity);
    setSearchQuery('');
    setIsOpen(false);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (!isOpen || entities.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev < entities.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && entities[selectedIndex]) {
          handleSelect(entities[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
      default:
        break;
    }
  };

  const getEntityTypeLabel = (type) => {
    const labels = {
      'person': '👤',
      'vehicle': '🚗',
      'object': '📦',
      'location': '📍',
      'organization': '🏢'
    };
    return labels[type] || '•';
  };

  return (
    <div className="entity-search" ref={dropdownRef}>
      <input
        ref={inputRef}
        type="text"
        className="entity-search-input"
        placeholder={placeholder}
        value={searchQuery}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => searchQuery.length > 0 && setIsOpen(true)}
      />

      {isOpen && (
        <div className="entity-search-dropdown">
          {loading && (
            <div className="entity-search-loading">Searching...</div>
          )}

          {!loading && entities.length === 0 && searchQuery.length > 0 && (
            <div className="entity-search-empty">No entities found</div>
          )}

          {!loading && entities.length > 0 && (
            <ul className="entity-search-results">
              {entities.map((entity, index) => (
                <li
                  key={entity.id}
                  className={`entity-search-result-item ${index === selectedIndex ? 'selected' : ''}`}
                  onClick={() => handleSelect(entity)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <span className="entity-type-icon">
                    {getEntityTypeLabel(entity.entityType)}
                  </span>
                  <div className="entity-info">
                    <div className="entity-name">{entity.displayName}</div>
                    <div className="entity-meta">
                      <span className="entity-type-badge">{entity.entityType}</span>
                      {entity.tags && entity.tags.length > 0 && (
                        <span className="entity-tags">
                          {entity.tags.slice(0, 3).map(tag => {
                            const displayTag = tag.startsWith('general:')
                              ? tag.substring(8)
                              : tag;
                            return displayTag;
                          }).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default EntitySearch;
