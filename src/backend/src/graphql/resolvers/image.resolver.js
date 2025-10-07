import { AssetsService } from '../../services/assets.js';
import GraphQLUpload from 'graphql-upload-minimal';

const imageResolvers = {
  Upload: GraphQLUpload.GraphQLUpload,
  
  Query: {
    images: async (parent, args, context) => {
      const assetsService = new AssetsService(context.dbPool);
      return await assetsService.getAllAssets();
    },
    
    image: async (parent, args, context) => {
      const assetsService = new AssetsService(context.dbPool);
      return await assetsService.getAssetById(args.id);
    },
    
    imagesInArea: async (parent, args, context) => {
      const assetsService = new AssetsService(context.dbPool);
      return await assetsService.getAssetsInArea(args.bounds);
    }
  },
  
  Mutation: {
    uploadImage: async (parent, args, context) => {
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
    }
  }
};

export default imageResolvers;