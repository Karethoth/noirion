import { requireAuth } from '../../utils/auth.js';
import { ImageAnalysisService } from '../../services/image-analysis.js';
import { ProjectSettingsService } from '../../services/project-settings.js';

const lmStudioResolvers = {
  Query: {
    lmStudioModels: async (parent, args, context) => {
      requireAuth(context.user);

      const projectSettings = new ProjectSettingsService(context.dbPool);
      const settings = await projectSettings.getProjectSettings({ recomputeIfAutoUpdate: false });

      const svc = new ImageAnalysisService(context.dbPool, {
        baseUrl: settings?.lmStudioBaseUrl || null,
        defaultModel: settings?.lmStudioModel || null,
      });

      const visionOnly = !!args?.visionOnly;
      return await svc.listLmStudioModels({ visionOnly });
    },

    lmStudioTestVision: async (parent, args, context) => {
      requireAuth(context.user);

      const modelId = String(args?.modelId || '').trim();
      if (!modelId) return { ok: false, isVision: false, message: 'Missing modelId' };

      const projectSettings = new ProjectSettingsService(context.dbPool);
      const settings = await projectSettings.getProjectSettings({ recomputeIfAutoUpdate: false });

      const svc = new ImageAnalysisService(context.dbPool, {
        baseUrl: settings?.lmStudioBaseUrl || null,
        defaultModel: settings?.lmStudioModel || null,
      });

      return await svc.testLmStudioVisionModel({ model: modelId });
    },
  },
};

export default lmStudioResolvers;
