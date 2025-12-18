import { gql } from '@apollo/client';

export const GET_PROJECT_SETTINGS = gql`
  query GetProjectSettings {
    projectSettings {
      homeLat
      homeLng
      homeAutoUpdate
      aiEnabled
      lmStudioBaseUrl
      lmStudioModel
    }
  }
`;

export const UPDATE_PROJECT_SETTINGS = gql`
  mutation UpdateProjectSettings($input: UpdateProjectSettingsInput!) {
    updateProjectSettings(input: $input) {
      homeLat
      homeLng
      homeAutoUpdate
      aiEnabled
      lmStudioBaseUrl
      lmStudioModel
    }
  }
`;

export const RECALCULATE_PROJECT_HOME_LOCATION = gql`
  mutation RecalculateProjectHomeLocation {
    recalculateProjectHomeLocation {
      homeLat
      homeLng
      homeAutoUpdate
      aiEnabled
      lmStudioBaseUrl
      lmStudioModel
    }
  }
`;

export const GET_LM_STUDIO_MODELS = gql`
  query GetLmStudioModels($visionOnly: Boolean = false) {
    lmStudioModels(visionOnly: $visionOnly) {
      id
      isVision
    }
  }
`;

export const TEST_LM_STUDIO_VISION = gql`
  query TestLmStudioVision($modelId: String!) {
    lmStudioTestVision(modelId: $modelId) {
      ok
      isVision
      message
    }
  }
`;
