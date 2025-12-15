import { describe, test, expect, vi, beforeEach } from 'vitest';
import { EventsService } from '../src/services/events.js';

function makeDbMock() {
  const client = {
    query: vi.fn(),
    release: vi.fn()
  };
  const dbPool = {
    connect: vi.fn().mockResolvedValue(client)
  };
  return { dbPool, client };
}

describe('EventsService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('createEvent', () => {
    test('throws when occurredAt is missing', async () => {
      const { dbPool } = makeDbMock();
      const service = new EventsService(dbPool);

      await expect(
        service.createEvent({ occurredAt: null, latitude: null, longitude: null, title: 'X' })
      ).rejects.toThrow(/occurredAt is required/i);
    });

    test('throws when title is missing', async () => {
      const { dbPool } = makeDbMock();
      const service = new EventsService(dbPool);

      await expect(
        service.createEvent({ occurredAt: '2025-01-01T00:00:00.000Z', latitude: null, longitude: null, title: '' })
      ).rejects.toThrow(/title is required/i);
    });

    test('creates event with location (geom)', async () => {
      const { dbPool, client } = makeDbMock();
      const service = new EventsService(dbPool);

      client.query.mockResolvedValue({
        rows: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            occurred_at: new Date('2025-01-01T00:00:00.000Z'),
            title: 'Test',
            description: 'Desc',
            created_by: 7,
            created_at: new Date('2025-01-02T00:00:00.000Z'),
            latitude: '60.1699',
            longitude: '24.9384',
            metadata: { kind: 'unit' }
          }
        ]
      });

      const result = await service.createEvent({
        occurredAt: '2025-01-01T00:00:00.000Z',
        latitude: 60.1699,
        longitude: 24.9384,
        title: 'Test',
        description: 'Desc',
        createdBy: 7,
        metadata: { kind: 'unit' }
      });

      expect(dbPool.connect).toHaveBeenCalledTimes(1);
      expect(client.query).toHaveBeenCalledTimes(1);

      const [sql, params] = client.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO events');
      expect(sql).toContain('ST_SetSRID');
      expect(params).toHaveLength(7);
      expect(params[0]).toBeInstanceOf(Date);
      expect(params[1]).toBe(24.9384);
      expect(params[2]).toBe(60.1699);
      expect(params[3]).toBe('Test');
      expect(params[4]).toBe('Desc');
      expect(params[5]).toBe(7);
      expect(params[6]).toBe(JSON.stringify({ kind: 'unit' }));
      expect(client.release).toHaveBeenCalledTimes(1);

      expect(result).toEqual({
        id: '11111111-1111-1111-1111-111111111111',
        occurredAt: '2025-01-01T00:00:00.000Z',
        latitude: 60.1699,
        longitude: 24.9384,
        title: 'Test',
        description: 'Desc',
        createdBy: 7,
        createdAt: '2025-01-02T00:00:00.000Z',
        metadata: { kind: 'unit' }
      });
    });

    test('creates event without location (geom NULL)', async () => {
      const { dbPool, client } = makeDbMock();
      const service = new EventsService(dbPool);

      client.query.mockResolvedValue({
        rows: [
          {
            id: '22222222-2222-2222-2222-222222222222',
            occurred_at: new Date('2025-01-01T00:00:00.000Z'),
            title: 'No Location',
            description: null,
            created_by: null,
            created_at: new Date('2025-01-01T01:00:00.000Z'),
            latitude: null,
            longitude: null,
            metadata: {}
          }
        ]
      });

      const result = await service.createEvent({
        occurredAt: '2025-01-01T00:00:00.000Z',
        latitude: null,
        longitude: null,
        title: 'No Location',
        description: null,
        createdBy: null,
        metadata: null
      });

      const [sql, params] = client.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO events');
      expect(sql).toContain('geom');
      expect(sql).toContain('NULL');
      expect(params).toHaveLength(7);
      expect(params[1]).toBeNull();
      expect(params[2]).toBeNull();
      expect(params[4]).toBeNull();
      expect(params[6]).toBe(JSON.stringify({}));

      expect(result.latitude).toBeNull();
      expect(result.longitude).toBeNull();
    });
  });

  describe('deleteEvent', () => {
    test('returns true when a row is deleted', async () => {
      const { dbPool, client } = makeDbMock();
      const service = new EventsService(dbPool);

      client.query.mockResolvedValue({ rows: [{ id: 'x' }] });
      const ok = await service.deleteEvent('x');

      expect(ok).toBe(true);
      expect(client.query).toHaveBeenCalledWith('DELETE FROM events WHERE id = $1 RETURNING id', ['x']);
      expect(client.release).toHaveBeenCalledTimes(1);
    });

    test('returns false when no row matches', async () => {
      const { dbPool, client } = makeDbMock();
      const service = new EventsService(dbPool);

      client.query.mockResolvedValue({ rows: [] });
      const ok = await service.deleteEvent('missing');
      expect(ok).toBe(false);
    });
  });

  describe('getEvents', () => {
    test('queries with before filter and formats results', async () => {
      const { dbPool, client } = makeDbMock();
      const service = new EventsService(dbPool);

      client.query.mockResolvedValue({
        rows: [
          {
            id: 'e1',
            occurred_at: new Date('2025-01-05T00:00:00.000Z'),
            title: 'A',
            description: null,
            created_by: 1,
            created_at: new Date('2025-01-06T00:00:00.000Z'),
            latitude: '10.5',
            longitude: '20.25',
            metadata: { a: 1 }
          }
        ]
      });

      const result = await service.getEvents({ before: '2025-02-01T00:00:00.000Z', limit: 5, offset: 0 });

      const [sql, params] = client.query.mock.calls[0];
      expect(sql).toContain('FROM events');
      expect(sql).toContain('WHERE occurred_at <= $1');
      expect(sql).toContain('ORDER BY occurred_at DESC');
      expect(params).toHaveLength(3);
      expect(params[0]).toBeInstanceOf(Date);
      expect(params[1]).toBe(5);
      expect(params[2]).toBe(0);

      expect(result).toEqual([
        {
          id: 'e1',
          occurredAt: '2025-01-05T00:00:00.000Z',
          latitude: 10.5,
          longitude: 20.25,
          title: 'A',
          description: null,
          createdBy: 1,
          createdAt: '2025-01-06T00:00:00.000Z',
          metadata: { a: 1 }
        }
      ]);
    });
  });
});
