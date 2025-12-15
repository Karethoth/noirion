import { requireAuth, requirePermission } from '../../utils/auth.js';
import { EntityLinkService } from '../../services/entity-links.js';
import { EntityService } from '../../services/entities.js';

const entityLinkResolvers = {
  Query: {
    entityLinks: async (parent, args, context) => {
      requireAuth(context.user);
      const entityLinkService = new EntityLinkService(context.dbPool);
      return await entityLinkService.getEntityLinksByEntity(args.entityId, {
        limit: args.limit,
        offset: args.offset
      });
    }
  },

  Mutation: {
    createEntityLink: async (parent, args, context) => {
      requirePermission(context.user, 'write');
      const entityLinkService = new EntityLinkService(context.dbPool);
      return await entityLinkService.createEntityLink({
        ...args.input,
        createdBy: context.userId
      });
    },

    deleteEntityLink: async (parent, args, context) => {
      requirePermission(context.user, 'write');
      const entityLinkService = new EntityLinkService(context.dbPool);
      return await entityLinkService.deleteEntityLink(args.id);
    }
  },

  EntityLink: {
    fromEntity: async (parent, args, context) => {
      const entityService = new EntityService(context.dbPool);
      return await entityService.getEntityById(parent.fromEntityId);
    },

    toEntity: async (parent, args, context) => {
      const entityService = new EntityService(context.dbPool);
      return await entityService.getEntityById(parent.toEntityId);
    }
  }
};

export default entityLinkResolvers;
