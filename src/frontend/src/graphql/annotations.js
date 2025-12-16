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

export const ANALYZE_ANNOTATION = gql`
  mutation AnalyzeAnnotation($annotationId: ID!, $regionId: ID, $model: String, $persist: Boolean) {
    analyzeAnnotation(annotationId: $annotationId, regionId: $regionId, model: $model, persist: $persist) {
      caption
      tags
      licensePlates
      model
      createdAt
      runId
      cropUrl
      cropDataUrl
      cropDebug
    }
  }
`;

export const ANALYZE_ANNOTATION_DRAFT = gql`
  mutation AnalyzeAnnotationDraft($assetId: ID!, $input: AddRegionInput!, $model: String) {
    analyzeAnnotationDraft(assetId: $assetId, input: $input, model: $model) {
      caption
      tags
      licensePlates
      model
      createdAt
      runId
      cropUrl
      cropDataUrl
      cropDebug
    }
  }
`;

export const GET_ANNOTATION_AI_ANALYSIS_RUNS = gql`
  query GetAnnotationAiAnalysisRuns($annotationId: ID, $limit: Int) {
    annotationAiAnalysisRuns(annotationId: $annotationId, limit: $limit) {
      id
      annotationId
      assetId
      assetFilename
      regionId
      createdAt
      createdBy
      model
      caption
      tags
      licensePlates
      cropUrl
      cropDebug
    }
  }
`;
