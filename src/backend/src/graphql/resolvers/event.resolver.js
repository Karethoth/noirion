import { requireAuth, requirePermission } from '../../utils/auth.js';
import { EventsService } from '../../services/events.js';

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
  }
};

export default eventResolvers;
