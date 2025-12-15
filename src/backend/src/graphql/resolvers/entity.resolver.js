import { EntityService } from '../../services/entities.js';
import { requireAuth, requirePermission } from '../../utils/auth.js';

const entityResolvers = {
  Query: {
    entities: async (parent, args, context) => {
      requireAuth(context.user);
      const entityService = new EntityService(context.dbPool);
      return await entityService.getEntities({
        entityType: args.entityType,
        limit: args.limit,
        offset: args.offset
      });
    },

    entity: async (parent, args, context) => {
      requireAuth(context.user);
      const entityService = new EntityService(context.dbPool);
      return await entityService.getEntityById(args.id);
    },

    searchEntities: async (parent, args, context) => {
      requireAuth(context.user);
      const entityService = new EntityService(context.dbPool);
      return await entityService.searchEntities(args.query, {
        entityType: args.entityType,
        limit: args.limit
      });
    }
  },

  Mutation: {
    createEntity: async (parent, args, context) => {
      requirePermission(context.user, 'write');
      const entityService = new EntityService(context.dbPool);
      return await entityService.createEntity(args.input);
    },

    updateEntity: async (parent, args, context) => {
      requirePermission(context.user, 'write');
      const entityService = new EntityService(context.dbPool);
      return await entityService.updateEntity(args.id, args.input);
    },

    deleteEntity: async (parent, args, context) => {
      requirePermission(context.user, 'write');
      const entityService = new EntityService(context.dbPool);
      return await entityService.deleteEntity(args.id);
    },

    addEntityAttribute: async (parent, args, context) => {
      requirePermission(context.user, 'write');
      const entityService = new EntityService(context.dbPool);
      return await entityService.addEntityAttribute(args.entityId, args.input);
    },

    updateEntityAttribute: async (parent, args, context) => {
      requirePermission(context.user, 'write');
      const entityService = new EntityService(context.dbPool);
      return await entityService.updateEntityAttribute(args.id, args.input);
    },

    deleteEntityAttribute: async (parent, args, context) => {
      requirePermission(context.user, 'write');
      const entityService = new EntityService(context.dbPool);
      return await entityService.deleteEntityAttribute(args.id);
    }
  },

  Entity: {
    attributes: async (parent, args, context) => {
      // Attributes are already loaded in the service, so just return them
      return parent.attributes || [];
    },

    tags: async (parent, args, context) => {
      // Tags are already loaded in the service, so just return them
      return parent.tags || [];
    }
  }
};

export default entityResolvers;
