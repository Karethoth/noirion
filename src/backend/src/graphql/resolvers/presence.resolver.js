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
    }
  },

  Presence: {
    sourceAsset: async (parent, args, context) => {
      if (!parent.sourceAssetId) return null;
      const assetsService = new AssetsService(context.dbPool);
      return await assetsService.getAssetById(parent.sourceAssetId);
    },

    entities: async (parent, args, context) => {
      const presenceService = new PresenceService(context.dbPool);
      return await presenceService.getPresenceEntities(parent.id);
    }
  },

  PresenceEntity: {
    entity: async (parent, args, context) => {
      const entityService = new EntityService(context.dbPool);
      return await entityService.getEntityById(parent.entityId);
    }
  }
};

export default presenceResolvers;
