import { AssetsService } from '../../services/assets.js';
import { GraphQLUpload } from 'graphql-upload-minimal';
import { requireAuth, requirePermission } from '../../utils/auth.js';
import { ImageAnalysisService } from '../../services/image-analysis.js';

const imageResolvers = {
  Upload: GraphQLUpload,

  Image: {
    annotations: async (parent, args, context) => {
      try {
        requireAuth(context.user);

        // Fetch annotations for this image
        const annotationsResult = await context.dbPool.query(
          'SELECT * FROM annotations WHERE asset_id = $1 ORDER BY created_at DESC',
          [parent.id]
        );

        if (!annotationsResult || !annotationsResult.rows) {
          return [];
        }

        // For each annotation, fetch its tags
        const annotations = await Promise.all(
          annotationsResult.rows.map(async (row) => {
            const tagsResult = await context.dbPool.query(
              `SELECT t.type, t.value, t.name
               FROM tags t
               JOIN annotation_tags at ON t.id = at.tag_id
               WHERE at.annotation_id = $1`,
              [row.id]
            );

            const tags = tagsResult.rows.map(tag => tag.name || tag.value);

            return {
              id: row.id,
              assetId: row.asset_id,
              createdBy: row.created_by,
              title: row.title,
              description: row.description,
              tags: tags,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
              metadata: row.metadata
            };
          })
        );

        return annotations;
      } catch (error) {
        console.error('Error fetching annotations for image:', parent.id, error);
        return [];
      }
    }
    ,
    aiAnalysis: async (parent) => {
      // aiAnalysis is stored in assets.metadata.aiAnalysis and passed through in formatted assets.
      return parent.aiAnalysis || parent?.metadata?.aiAnalysis || null;
    }
  },

  Query: {
    images: async (parent, args, context) => {
      requireAuth(context.user);
      const assetsService = new AssetsService(context.dbPool);
      return await assetsService.getAllAssets();
    },

    image: async (parent, args, context) => {
      requireAuth(context.user);
      const assetsService = new AssetsService(context.dbPool);
      return await assetsService.getAssetById(args.id);
    },

    imagesInArea: async (parent, args, context) => {
      requireAuth(context.user);
      const assetsService = new AssetsService(context.dbPool);
      return await assetsService.getAssetsInArea(args.bounds);
    }
  },

  Mutation: {
    uploadImage: async (parent, args, context) => {
      requirePermission(context.user, 'write');

      const { file } = args;
      const { createReadStream, filename, mimetype } = await file;

      // Read file into buffer
      const stream = createReadStream();
      const chunks = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const buffer = Buffer.concat(chunks);

      // Validate file type
      if (!mimetype.startsWith('image/')) {
        throw new Error('File must be an image');
      }

      const assetsService = new AssetsService(context.dbPool);
      return await assetsService.processAsset(buffer, filename, mimetype, context.userId);
    },

    uploadImages: async (parent, args, context) => {
      requirePermission(context.user, 'write');

      const { files } = args;
      const assetsService = new AssetsService(context.dbPool);
      const results = [];

      for (const filePromise of files) {
        const file = await filePromise;
        const { createReadStream, filename, mimetype } = file;

        // Read file into buffer
        const stream = createReadStream();
        const chunks = [];

        for await (const chunk of stream) {
          chunks.push(chunk);
        }

        const buffer = Buffer.concat(chunks);

        // Validate file type
        if (!mimetype.startsWith('image/')) {
          throw new Error(`File ${filename} must be an image`);
        }

        const result = await assetsService.processAsset(buffer, filename, mimetype, context.userId);
        results.push(result);
      }

      return results;
    },

    deleteImage: async (parent, args, context) => {
      requirePermission(context.user, 'write');

      const assetsService = new AssetsService(context.dbPool);
      return await assetsService.deleteAsset(args.id);
    },

    updateImage: async (parent, args, context) => {
      requirePermission(context.user, 'write');

      const assetsService = new AssetsService(context.dbPool);
      const { id, input } = args;

      return await assetsService.updateAssetManualMetadata(
        id,
        {
          displayName: input.displayName,
          latitude: input.latitude,
          longitude: input.longitude,
          altitude: input.altitude,
          captureTimestamp: input.captureTimestamp,
        },
        context.userId
      );
    },

    analyzeImage: async (parent, args, context) => {
      const persist = args.persist !== false;
      requirePermission(context.user, persist ? 'write' : 'read');

      const analysisService = new ImageAnalysisService(context.dbPool);
      return await analysisService.analyzeImageByAssetId(args.id, {
        model: args.model || null,
        persist,
        userId: context.userId,
      });
    }
  }
};

export default imageResolvers;
