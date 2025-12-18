import React, { useEffect, useMemo, useState } from 'react';
import './TimelineView.css';

const normalizeToken = (t) => String(t || '').trim();

const addTagTokenToInput = (current, tag) => {
  const t = normalizeToken(tag);
  if (!t) return current || '';
  const cur = (current || '').trim();
  if (!cur) return t;
  const hasTrailingSep = /[\s,]$/.test(cur);
  return hasTrailingSep ? `${cur}${t}` : `${cur}, ${t}`;
};

const TagPickerModal = ({
  isOpen,
  title = 'Tags',
  value,
  onChange,
  tagsWithCounts = [], // [{ tag, count }]
  placeholder = 'tag1, tag2',
  onClose,
}) => {
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
  }, [isOpen]);

  const normalizedTags = useMemo(() => {
    const arr = Array.isArray(tagsWithCounts) ? tagsWithCounts : [];
    return arr
      .map((x) => ({
        tag: normalizeToken(x?.tag),
        count: Number.isFinite(Number(x?.count)) ? Number(x.count) : 0,
      }))
      .filter((x) => x.tag);
  }, [tagsWithCounts]);

  const filteredTags = useMemo(() => {
    const q = (search || '').trim().toLowerCase();
    if (!q) return normalizedTags;
    return normalizedTags.filter((x) => x.tag.toLowerCase().includes(q));
  }, [normalizedTags, search]);

  if (!isOpen) return null;

  return (
    <div className="timeline-modal-overlay" onClick={onClose}>
      <div className="timeline-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(720px, 95vw)' }}>
        <div className="timeline-modal-header">
          <div className="timeline-modal-title">{title}</div>
          <button className="timeline-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="timeline-modal-body">
          <div className="timeline-control" style={{ marginBottom: 12 }}>
            <label>Selected</label>
            <input
              type="text"
              value={value || ''}
              onChange={(e) => onChange?.(e.target.value)}
              placeholder={placeholder}
              autoFocus
            />
          </div>

          <div className="timeline-control" style={{ marginBottom: 12 }}>
            <label>Search existing tags</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
            />
          </div>

          {filteredTags.length === 0 ? (
            <div className="timeline-muted">No tags found.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {filteredTags.slice(0, 200).map((x) => (
                <button
                  key={x.tag}
                  type="button"
                  className="timeline-secondary"
                  onClick={() => onChange?.(addTagTokenToInput(value, x.tag))}
                  title={x.tag}
                  style={{ padding: '6px 10px' }}
                >
                  {x.tag} ({x.count})
                </button>
              ))}
            </div>
          )}

          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <button className="timeline-secondary" onClick={() => onChange?.('')}>
              Clear
            </button>
            <button className="timeline-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TagPickerModal;
