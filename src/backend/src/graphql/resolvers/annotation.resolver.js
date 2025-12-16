import { AnnotationService } from '../../services/annotations.js';
import { AssetsService } from '../../services/assets.js';
import { ImageAnalysisService } from '../../services/image-analysis.js';
import { AnnotationAiAnalysisRunsService } from '../../services/annotation-ai-analysis-runs.js';
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
    },

    annotationAiAnalysisRuns: async (parent, args, context) => {
      requireAuth(context.user);
      const runs = new AnnotationAiAnalysisRunsService(context.dbPool);
      return await runs.listRuns({
        annotationId: args.annotationId || null,
        limit: args.limit ?? 20,
      });
    },
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
          notes: args.notes,
          observedBy: context.userId
        }
      );
    },

    unlinkEntityFromAnnotation: async (parent, args, context) => {
      requirePermission(context.user, 'write');
      const annotationService = new AnnotationService(context.dbPool);
      return await annotationService.unlinkEntityFromAnnotation(args.linkId);
    },

    analyzeAnnotation: async (parent, args, context) => {
      const persist = args.persist !== false;
      requirePermission(context.user, persist ? 'write' : 'read');

      const analysisService = new ImageAnalysisService(context.dbPool);
      return await analysisService.analyzeAnnotationById(args.annotationId, {
        regionId: args.regionId || null,
        model: args.model || null,
        persist,
        userId: context.userId,
      });
    },

    analyzeAnnotationDraft: async (parent, args, context) => {
      requirePermission(context.user, 'read');

      const analysisService = new ImageAnalysisService(context.dbPool);
      return await analysisService.analyzeAnnotationDraft(args.assetId, {
        shapeType: args.input?.shapeType,
        coordinates: args.input?.coordinates,
        model: args.model || null,
        userId: context.userId,
      });
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
    },

    aiAnalysis: async (parent) => {
      return parent?.metadata?.aiAnalysis || null;
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

// Field resolvers for analysis run rows (snake_case -> camelCase)
annotationResolvers.AnnotationAIAnalysisRun = {
  annotationId: (p) => p.annotation_id,
  assetId: (p) => p.asset_id,
  assetFilename: (p) => p.asset_filename,
  regionId: (p) => p.region_id,
  createdAt: (p) => (p.created_at instanceof Date ? p.created_at.toISOString() : p.created_at),
  createdBy: (p) => p.created_by,
  cropUrl: (p) => p.crop_path,
  cropDebug: (p) => p.crop_debug,
  caption: (p) => p.analysis?.caption ?? null,
  tags: (p) => (Array.isArray(p.analysis?.tags) ? p.analysis.tags : []),
  licensePlates: (p) => (Array.isArray(p.analysis?.licensePlates) ? p.analysis.licensePlates : []),
};

export default annotationResolvers;
