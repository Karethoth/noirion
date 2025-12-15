import { describe, test, expect, beforeEach, vi } from 'vitest';
import eventResolvers from '../src/graphql/resolvers/event.resolver.js';

describe('Event GraphQL Resolvers', () => {
  let mockContext;

  beforeEach(() => {
    mockContext = {
      dbPool: {},
      userId: 1,
      user: {
        userId: 1,
        username: 'testuser',
        email: 'test@example.com',
        role: 'investigator'
      }
    };
  });

  describe('Query resolvers', () => {
    test('events calls EventsService.getEvents with correct args', async () => {
      const mockEvents = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          occurredAt: '2025-01-01T00:00:00.000Z',
          latitude: null,
          longitude: null,
          title: 'Test Event',
          description: null,
          createdBy: 1,
          createdAt: '2025-01-01T00:00:00.000Z',
          metadata: {}
        }
      ];

      const { EventsService } = await import('../src/services/events.js');
      vi.spyOn(EventsService.prototype, 'getEvents').mockResolvedValue(mockEvents);

      const result = await eventResolvers.Query.events(
        null,
        { before: '2025-02-01T00:00:00.000Z', after: null, limit: 10, offset: 5 },
        mockContext
      );

      expect(result).toEqual(mockEvents);
      expect(EventsService.prototype.getEvents).toHaveBeenCalledWith({
        before: '2025-02-01T00:00:00.000Z',
        after: null,
        limit: 10,
        offset: 5
      });
    });

    test('events rejects unauthenticated requests', async () => {
      const unauthContext = { ...mockContext, user: null };
      await expect(
        eventResolvers.Query.events(null, { before: null, after: null, limit: 10, offset: 0 }, unauthContext)
      ).rejects.toThrow(/Authentication required/i);
    });
  });

  describe('Mutation resolvers', () => {
    test('createEvent passes createdBy from context.userId', async () => {
      const input = {
        occurredAt: '2025-01-01T00:00:00.000Z',
        latitude: 60.1699,
        longitude: 24.9384,
        title: 'New Event',
        description: 'Desc',
        metadata: { kind: 'test' }
      };

      const mockCreated = {
        id: '22222222-2222-2222-2222-222222222222',
        occurredAt: input.occurredAt,
        latitude: input.latitude,
        longitude: input.longitude,
        title: input.title,
        description: input.description,
        createdBy: 1,
        createdAt: '2025-01-01T00:00:00.000Z',
        metadata: input.metadata
      };

      const { EventsService } = await import('../src/services/events.js');
      vi.spyOn(EventsService.prototype, 'createEvent').mockResolvedValue(mockCreated);

      const result = await eventResolvers.Mutation.createEvent(null, { input }, mockContext);

      expect(result).toEqual(mockCreated);
      expect(EventsService.prototype.createEvent).toHaveBeenCalledWith({
        ...input,
        createdBy: 1
      });
    });

    test('createEvent rejects users without write permission', async () => {
      const readOnlyContext = {
        ...mockContext,
        user: { ...mockContext.user, role: 'analyst' }
      };

      const input = {
        occurredAt: '2025-01-01T00:00:00.000Z',
        latitude: null,
        longitude: null,
        title: 'New Event',
        description: null,
        metadata: {}
      };

      await expect(
        eventResolvers.Mutation.createEvent(null, { input }, readOnlyContext)
      ).rejects.toThrow(/requires 'write' permission/i);
    });

    test('deleteEvent calls EventsService.deleteEvent with id', async () => {
      const { EventsService } = await import('../src/services/events.js');
      vi.spyOn(EventsService.prototype, 'deleteEvent').mockResolvedValue(true);

      const result = await eventResolvers.Mutation.deleteEvent(
        null,
        { id: '33333333-3333-3333-3333-333333333333' },
        mockContext
      );

      expect(result).toBe(true);
      expect(EventsService.prototype.deleteEvent).toHaveBeenCalledWith('33333333-3333-3333-3333-333333333333');
    });
  });
});
