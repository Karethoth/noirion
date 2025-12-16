import React, { useMemo, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { GET_IMAGES } from '../graphql/images';

const AssetList = ({ readOnly = false, onEdit = null }) => {
  const { loading, error, data, refetch } = useQuery(GET_IMAGES, {
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
  });

  const [query, setQuery] = useState('');

  const assets = useMemo(() => data?.images || [], [data?.images]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assets;

    return assets.filter((img) => {
      const name = (img.displayName || img.filename || '').toLowerCase();
      const file = (img.filename || '').toLowerCase();

      const tagText = (img.annotations || [])
        .flatMap((a) => a?.tags || [])
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const aiCaption = (img.aiAnalysis?.caption || '').toLowerCase();
      const aiPlates = (img.aiAnalysis?.licensePlates || []).join(' ').toLowerCase();

      return (
        name.includes(q) ||
        file.includes(q) ||
        tagText.includes(q) ||
        aiCaption.includes(q) ||
        aiPlates.includes(q)
      );
    });
  }, [assets, query]);

  if (loading && assets.length === 0) {
    return <div style={{ padding: 16 }}>Loading…</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ color: '#b00020' }}>Error: {error.message}</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, color: '#e0e0e0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0 }}>Assets</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search filename, tags…"
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid #444',
              background: '#111',
              color: '#eee',
              width: 280,
            }}
          />
          <button
            onClick={() => refetch()}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #444', background: '#111', color: '#eee' }}
          >
            Refresh
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12, border: '1px solid #3a3a3a', borderRadius: 8, overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.5fr 1fr 1fr 120px',
            padding: '10px 12px',
            background: '#2a2a2a',
            borderBottom: '1px solid #3a3a3a',
            fontSize: 12,
            color: '#b0b0b0',
          }}
        >
          <div>Name</div>
          <div>Uploaded</div>
          <div>Location</div>
          <div style={{ textAlign: 'right' }}>Actions</div>
        </div>

        {filtered.map((img) => {
          const name = img.displayName || img.filename;
          const loc = (img.latitude != null && img.longitude != null)
            ? `${Number(img.latitude).toFixed(5)}, ${Number(img.longitude).toFixed(5)}`
            : '—';

          return (
            <div
              key={img.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.5fr 1fr 1fr 120px',
                padding: '10px 12px',
                borderBottom: '1px solid #262626',
                alignItems: 'center',
              }}
            >
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>
                {name}
              </div>
              <div style={{ color: '#b0b0b0', fontSize: 12 }}>
                {img.uploadedAt ? new Date(img.uploadedAt).toLocaleString() : '—'}
              </div>
              <div style={{ color: '#b0b0b0', fontSize: 12 }}>{loc}</div>
              <div style={{ textAlign: 'right' }}>
                <button
                  onClick={() => {
                    if (typeof onEdit === 'function') onEdit(img.id);
                  }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'rgba(23, 162, 184, 0.9)',
                    color: 'white',
                    cursor: 'pointer',
                  }}
                >
                  Edit
                </button>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div style={{ padding: 12, color: '#b0b0b0' }}>No assets yet.</div>
        )}
      </div>

      {readOnly && (
        <div style={{ marginTop: 10, color: '#b0b0b0', fontSize: 12 }}>
          Read-only role: editing disabled.
        </div>
      )}
    </div>
  );
};

export default AssetList;
