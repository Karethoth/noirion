import React, { useState } from 'react';
import EntityList from './EntityList';
import EntityDetail from './EntityDetail';
import './EntityManager.css';

const EntityManager = ({ userRole }) => {
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [refetchEntities, setRefetchEntities] = useState(null);

  const handleSelectEntity = (entity) => {
    setSelectedEntity(entity);
    setShowDetail(true);
  };

  const handleCloseDetail = () => {
    setShowDetail(false);
    setSelectedEntity(null);
  };

  const handleSaved = () => {
    // Refetch the entity list to show the updated data
    if (refetchEntities) {
      refetchEntities();
    }
    handleCloseDetail();
  };

  return (
    <div className="entity-manager">
      <EntityList
        onSelectEntity={handleSelectEntity}
        userRole={userRole}
        onRefetchReady={(refetch) => setRefetchEntities(() => refetch)}
      />

      {showDetail && (
        <EntityDetail
          entity={selectedEntity}
          onClose={handleCloseDetail}
          onSaved={handleSaved}
          userRole={userRole}
        />
      )}
    </div>
  );
};

export default EntityManager;
