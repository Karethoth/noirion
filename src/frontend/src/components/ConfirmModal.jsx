import React from 'react';

const ConfirmModal = ({
  isOpen,
  title,
  message,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  confirmDisabled = false,
  confirmWorking = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="timeline-modal-overlay" onClick={onCancel}>
      <div className="timeline-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(640px, 95vw)' }}>
        <div className="timeline-modal-header">
          <div className="timeline-modal-title">{title || 'Confirm'}</div>
          <button className="timeline-modal-close" onClick={onCancel} aria-label="Close">×</button>
        </div>
        <div className="timeline-modal-body">
          {message && <div className="timeline-muted" style={{ marginBottom: 12 }}>{message}</div>}
          {children}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <button className="timeline-secondary" onClick={onCancel} disabled={confirmWorking}>
              {cancelLabel}
            </button>
            <button
              className={danger ? 'timeline-danger' : 'timeline-primary'}
              onClick={onConfirm}
              disabled={confirmWorking || confirmDisabled}
            >
              {confirmWorking ? 'Working…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
