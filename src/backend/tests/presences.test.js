import { describe, test, expect, beforeEach, vi } from 'vitest';
import { PresenceService } from '../src/services/presences.js';

describe('PresenceService', () => {
  let presenceService;
  let mockDbPool;
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn()
    };

    mockDbPool = {
      connect: vi.fn().mockResolvedValue(mockClient)
    };

    presenceService = new PresenceService(mockDbPool);
  });

  test('createPresence validates input', async () => {
    await expect(
      presenceService.createPresence({
        observedAt: '2025-01-01T00:00:00.000Z',
        entities: []
      })
    ).rejects.toThrow('At least one entity is required');
  });

  test('createPresence inserts presence and presence_entities', async () => {
    const presenceId = '11111111-1111-1111-1111-111111111111';
    const now = new Date('2025-01-01T00:00:00.000Z');

    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: presenceId }] }) // INSERT presences
      .mockResolvedValueOnce({ rows: [] }) // INSERT presence_entities
      .mockResolvedValueOnce({ rows: [] }) // COMMIT
      .mockResolvedValueOnce({
        rows: [
          {
            id: presenceId,
            observed_at: now,
            observed_by: null,
            source_asset: null,
            source_type: 'manual',
            latitude: null,
            longitude: null,
            notes: null,
            metadata: {},
            created_at: now
          }
        ]
      }); // getPresenceById

    const result = await presenceService.createPresence({
      observedAt: now.toISOString(),
      sourceType: 'manual',
      entities: [{ entityId: 'e1', role: 'seen', confidence: 1.0 }]
    });

    expect(result).toBeDefined();
    expect(result.id).toBe(presenceId);
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });
});
