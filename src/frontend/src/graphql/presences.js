import { gql } from '@apollo/client';

export const GET_PRESENCES = gql`
  query GetPresences($before: String, $after: String) {
    presences(before: $before, after: $after, limit: 500, offset: 0) {
      id
      observedAt
      latitude
      longitude
      notes
      sourceType
      entities {
        entityId
        role
        confidence
        entity {
          id
          entityType
          displayName
          tags
        }
      }
    }
  }
`;

export const GET_PRESENCES_BY_ENTITY = gql`
  query GetPresencesByEntity($entityId: ID!, $limit: Int, $offset: Int) {
    presencesByEntity(entityId: $entityId, limit: $limit, offset: $offset) {
      id
      observedAt
      latitude
      longitude
      notes
      sourceType
      entities {
        entityId
        role
        confidence
        entity {
          id
          entityType
          displayName
          tags
        }
      }
      sourceAsset {
        id
        filePath
      }
    }
  }
`;

export const CREATE_PRESENCE = gql`
  mutation CreatePresence($input: CreatePresenceInput!) {
    createPresence(input: $input) {
      id
    }
  }
`;

export const DELETE_PRESENCE = gql`
  mutation DeletePresence($id: ID!) {
    deletePresence(id: $id)
  }
`;
