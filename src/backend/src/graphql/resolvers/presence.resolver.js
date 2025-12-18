import { requireAuth, requirePermission } from '../../utils/auth.js';
import { PresenceService } from '../../services/presences.js';
import { AssetsService } from '../../services/assets.js';
import { EntityService } from '../../services/entities.js';

const presenceResolvers = {
  Query: {
    presencesByEntity: async (parent, args, context) => {
      requireAuth(context.user);
      const presenceService = new PresenceService(context.dbPool);
      return await presenceService.getPresencesByEntity(args.entityId, {
        limit: args.limit,
        offset: args.offset
      });
    },

    presences: async (parent, args, context) => {
      requireAuth(context.user);
      const presenceService = new PresenceService(context.dbPool);
      return await presenceService.getPresences({
        before: args.before,
        after: args.after,
        limit: args.limit,
        offset: args.offset
      });
    }
  },

  Mutation: {
    createPresence: async (parent, args, context) => {
      requirePermission(context.user, 'write');
      const presenceService = new PresenceService(context.dbPool);
      return await presenceService.createPresence({
        ...args.input,
        observedBy: context.userId
      });
    },

    deletePresence: async (parent, args, context) => {
      requirePermission(context.user, 'write');
      const presenceService = new PresenceService(context.dbPool);
      return await presenceService.deletePresence(args.id);
    }
  },

  Presence: {
    sourceAsset: async (parent, args, context) => {
      if (!parent.sourceAssetId) return null;
      const assetsService = new AssetsService(context.dbPool);
      return await assetsService.getAssetById(parent.sourceAssetId);
    },

    entities: async (parent, args, context) => {
      if (Array.isArray(parent?.entities)) {
        return parent.entities;
      }

      if (context?.loaders?.presenceEntitiesByPresenceId) {
        return await context.loaders.presenceEntitiesByPresenceId.load(parent.id);
      }

      const presenceService = new PresenceService(context.dbPool);
      return await presenceService.getPresenceEntities(parent.id);
    }
  },

  PresenceEntity: {
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

export default presenceResolvers;
