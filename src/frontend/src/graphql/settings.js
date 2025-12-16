import { gql } from '@apollo/client';

export const GET_PROJECT_SETTINGS = gql`
  query GetProjectSettings {
    projectSettings {
      homeLat
      homeLng
      homeAutoUpdate
    }
  }
`;

export const UPDATE_PROJECT_SETTINGS = gql`
  mutation UpdateProjectSettings($input: UpdateProjectSettingsInput!) {
    updateProjectSettings(input: $input) {
      homeLat
      homeLng
      homeAutoUpdate
    }
  }
`;

export const RECALCULATE_PROJECT_HOME_LOCATION = gql`
  mutation RecalculateProjectHomeLocation {
    recalculateProjectHomeLocation {
      homeLat
      homeLng
      homeAutoUpdate
    }
  }
`;
