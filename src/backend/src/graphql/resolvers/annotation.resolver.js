import { AnnotationService } from '../../services/annotations.js';
import { AssetsService } from '../../services/assets.js';
import { requireAuth, requirePermission } from '../../utils/auth.js';

const annotationResolvers = {
  Query: {
    annotations: async (parent, args, context) => {
      requireAuth(context.user);
      const annotationService = new AnnotationService(context.dbPool);
      return await annotationService.getAnnotationsByAssetId(args.assetId);
    },

    annotation: async (parent, args, context) => {
      requireAuth(context.user);
      const annotationService = new AnnotationService(context.dbPool);
      return await annotationService.getAnnotationById(args.id);
    }
  },

  Mutation: {
    createAnnotation: async (parent, args, context) => {
      requirePermission(context.user, 'write');
      const annotationService = new AnnotationService(context.dbPool);
      return await annotationService.createAnnotation(
        args.input.assetId,
        context.userId,
        args.input
      );
    },

    updateAnnotation: async (parent, args, context) => {
      requirePermission(context.user, 'write');
      const annotationService = new AnnotationService(context.dbPool);
      return await annotationService.updateAnnotation(
        args.id,
        context.userId,
        args.input
      );
    },

    deleteAnnotation: async (parent, args, context) => {
      requirePermission(context.user, 'write');
      const annotationService = new AnnotationService(context.dbPool);
      return await annotationService.deleteAnnotation(args.id, context.userId);
    },

    addAnnotationRegion: async (parent, args, context) => {
      requirePermission(context.user, 'write');
      const annotationService = new AnnotationService(context.dbPool);
      return await annotationService.addRegion(args.annotationId, args.input);
    },

    updateAnnotationRegion: async (parent, args, context) => {
      requirePermission(context.user, 'write');
      const annotationService = new AnnotationService(context.dbPool);
      return await annotationService.updateRegion(args.id, args.input);
    },

    deleteAnnotationRegion: async (parent, args, context) => {
      requirePermission(context.user, 'write');
      const annotationService = new AnnotationService(context.dbPool);
      return await annotationService.deleteRegion(args.id);
    },

    linkEntityToAnnotation: async (parent, args, context) => {
      requirePermission(context.user, 'write');
      const annotationService = new AnnotationService(context.dbPool);
      return await annotationService.linkEntityToAnnotation(
        args.annotationId,
        args.entityId,
        {
          relationType: args.relationType,
          confidence: args.confidence,
          notes: args.notes
        }
      );
    },

    unlinkEntityFromAnnotation: async (parent, args, context) => {
      requirePermission(context.user, 'write');
      const annotationService = new AnnotationService(context.dbPool);
      return await annotationService.unlinkEntityFromAnnotation(args.linkId);
    }
  },

  Annotation: {
    asset: async (parent, args, context) => {
      const assetsService = new AssetsService(context.dbPool);
      return await assetsService.getAssetById(parent.assetId);
    },

    regions: async (parent, args, context) => {
      const annotationService = new AnnotationService(context.dbPool);
      return await annotationService.getRegionsByAnnotationId(parent.id);
    },

    entityLinks: async (parent, args, context) => {
      const annotationService = new AnnotationService(context.dbPool);
      return await annotationService.getEntityLinksByAnnotationId(parent.id);
    }
  },

  AnnotationEntityLink: {
    entity: async (parent, args, context) => {
      try {
        const { EntityService } = await import('../../services/entities.js');
        const entityService = new EntityService(context.dbPool);
        const entity = await entityService.getEntityById(parent.entityId);
        if (!entity) {
          console.warn(`Entity not found for ID: ${parent.entityId}`);
        }
        return entity;
      } catch (error) {
        console.error(`Error fetching entity ${parent.entityId}:`, error);
        return null;
      }
    }
  }
};

export default annotationResolvers;
