import { gql } from '@apollo/client';

export const GET_ENTITY_LINKS = gql`
  query GetEntityLinks($entityId: ID!, $limit: Int, $offset: Int) {
    entityLinks(entityId: $entityId, limit: $limit, offset: $offset) {
      id
      fromEntityId
      toEntityId
      relationType
      confidence
      notes
      fromEntity { id displayName entityType }
      toEntity { id displayName entityType }
      createdAt
    }
  }
`;

export const CREATE_ENTITY_LINK = gql`
  mutation CreateEntityLink($input: CreateEntityLinkInput!) {
    createEntityLink(input: $input) {
      id
    }
  }
`;

export const DELETE_ENTITY_LINK = gql`
  mutation DeleteEntityLink($id: ID!) {
    deleteEntityLink(id: $id)
  }
`;
