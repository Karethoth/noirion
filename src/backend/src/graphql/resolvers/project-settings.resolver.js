import { requireAuth, requirePermission } from '../../utils/auth.js';
import { ProjectSettingsService } from '../../services/project-settings.js';

const projectSettingsResolvers = {
  Query: {
    projectSettings: async (parent, args, context) => {
      requireAuth(context.user);
      const svc = new ProjectSettingsService(context.dbPool);
      return await svc.getProjectSettings({ recomputeIfAutoUpdate: true });
    },
  },

  Mutation: {
    updateProjectSettings: async (parent, args, context) => {
      requirePermission(context.user, 'write');
      const svc = new ProjectSettingsService(context.dbPool);
      return await svc.updateProjectSettings(args.input || {}, context.userId);
    },

    recalculateProjectHomeLocation: async (parent, args, context) => {
      requirePermission(context.user, 'write');
      const svc = new ProjectSettingsService(context.dbPool);
      return await svc.recalculateProjectHomeLocation(context.userId);
    },
  },
};

export default projectSettingsResolvers;
