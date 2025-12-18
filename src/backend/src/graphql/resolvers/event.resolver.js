import { requireAuth, requirePermission } from '../../utils/auth.js';
import { EventsService } from '../../services/events.js';
import { EntityService } from '../../services/entities.js';

const eventResolvers = {
  Query: {
    events: async (parent, args, context) => {
      requireAuth(context.user);
      const eventsService = new EventsService(context.dbPool);
      return await eventsService.getEvents({
        before: args.before,
        after: args.after,
        limit: args.limit,
        offset: args.offset
      });
    },

    eventsByEntity: async (parent, args, context) => {
      requireAuth(context.user);
      const eventsService = new EventsService(context.dbPool);
      return await eventsService.getEventsByEntity(args.entityId, {
        before: args.before,
        after: args.after,
        limit: args.limit,
        offset: args.offset
      });
    }
  },

  Mutation: {
    createEvent: async (parent, args, context) => {
      requirePermission(context.user, 'write');
      const eventsService = new EventsService(context.dbPool);
      return await eventsService.createEvent({
        ...args.input,
        createdBy: context.userId
      });
    },

    updateEvent: async (parent, args, context) => {
      requirePermission(context.user, 'write');
      const eventsService = new EventsService(context.dbPool);
      return await eventsService.updateEvent(args.id, args.input);
    },

    deleteEvent: async (parent, args, context) => {
      requirePermission(context.user, 'write');
      const eventsService = new EventsService(context.dbPool);
      return await eventsService.deleteEvent(args.id);
    }
  },

  Event: {
    entities: async (parent, args, context) => {
      if (Array.isArray(parent?.entities)) {
        return parent.entities;
      }

      if (context?.loaders?.eventEntitiesByEventId) {
        return await context.loaders.eventEntitiesByEventId.load(parent.id);
      }

      const eventsService = new EventsService(context.dbPool);
      return await eventsService.getEventEntities(parent.id);
    }
  },

  EventEntity: {
    entity: async (parent, args, context) => {
      if (parent?.entity) {
        return parent.entity;
      }

      if (context?.loaders?.entitiesById) {
        return await context.loaders.entitiesById.load(parent.entityId);
      }

      const entityService = new EntityService(context.dbPool);
      return await entityService.getEntityById(parent.entityId);
    }
  }
};

export default eventResolvers;
