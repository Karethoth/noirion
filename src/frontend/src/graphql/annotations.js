import { gql } from '@apollo/client';

export const GET_ANNOTATIONS = gql`
  query GetAnnotations($assetId: ID!) {
    annotations(assetId: $assetId) {
      id
      title
      description
      tags
      regions {
        id
        shapeType
        coordinates
        style
      }
      entityLinks {
        id
        entityId
        entity {
          id
          displayName
          entityType
          tags
        }
        relationType
        confidence
        notes
      }
    }
  }
`;

export const CREATE_ANNOTATION = gql`
  mutation CreateAnnotation($input: CreateAnnotationInput!) {
    createAnnotation(input: $input) {
      id
      regions { id shapeType coordinates style }
    }
  }
`;

export const DELETE_ANNOTATION = gql`
  mutation DeleteAnnotation($id: ID!) {
    deleteAnnotation(id: $id)
  }
`;

export const ADD_ANNOTATION_REGION = gql`
  mutation AddAnnotationRegion($annotationId: ID!, $input: AddRegionInput!) {
    addAnnotationRegion(annotationId: $annotationId, input: $input) {
      id
      shapeType
      coordinates
      style
      createdAt
    }
  }
`;

export const UPDATE_ANNOTATION = gql`
  mutation UpdateAnnotation($id: ID!, $input: UpdateAnnotationInput!) {
    updateAnnotation(id: $id, input: $input) {
      id
      title
      description
      tags
      regions { id shapeType coordinates style }
    }
  }
`;

export const LINK_ENTITY_TO_ANNOTATION = gql`
  mutation LinkEntityToAnnotation(
    $annotationId: ID!
    $entityId: ID!
    $relationType: String
    $confidence: Float
    $notes: String
  ) {
    linkEntityToAnnotation(
      annotationId: $annotationId
      entityId: $entityId
      relationType: $relationType
      confidence: $confidence
      notes: $notes
    ) {
      id
      entityId
      entity {
        id
        displayName
        entityType
        tags
      }
      relationType
      confidence
      notes
    }
  }
`;

export const UNLINK_ENTITY_FROM_ANNOTATION = gql`
  mutation UnlinkEntityFromAnnotation($linkId: ID!) {
    unlinkEntityFromAnnotation(linkId: $linkId) {
      id
    }
  }
`;

export const SEARCH_ENTITIES_BY_TAG = gql`
  query SearchEntitiesByTag($query: String!, $limit: Int) {
    searchEntities(query: $query, limit: $limit) {
      id
      displayName
      entityType
      tags
    }
  }
`;
