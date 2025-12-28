import { gql } from '@apollo/client';

export const GET_ENTITY = gql`
  query GetEntity($id: ID!) {
    entity(id: $id) {
      id
      entityType
      displayName
      tags
      metadata
      createdAt
      updatedAt
      attributes {
        id
        attributeName
        attributeValue
        confidence
        createdAt
        updatedAt
      }
    }
  }
`;

export const GET_ENTITIES = gql`
  query GetEntities($entityType: String, $limit: Int, $offset: Int) {
    entities(entityType: $entityType, limit: $limit, offset: $offset) {
      id
      entityType
      displayName
      tags
      metadata
      createdAt
      updatedAt
      attributes {
        id
        attributeName
        attributeValue
        confidence
      }
    }
  }
`;

export const SEARCH_ENTITIES = gql`
  query SearchEntities($query: String!, $entityType: String, $limit: Int) {
    searchEntities(query: $query, entityType: $entityType, limit: $limit) {
      id
      entityType
      displayName
      tags
    }
  }
`;

export const GET_IMAGES_BY_ENTITY = gql`
  query GetImagesByEntity($entityId: ID!, $limit: Int, $offset: Int) {
    imagesByEntity(entityId: $entityId, limit: $limit, offset: $offset) {
      id
      filename
      displayName
      filePath
      fileSize
      width
      height
      uploadedAt
      captureTimestamp
      cameraMake
      cameraModel
      latitude
      longitude
      subjectLatitude
      subjectLongitude
      aiAnalysis {
        caption
        licensePlates
        model
        createdAt
      }
      annotations {
        id
        title
        tags
      }
    }
  }
`;

export const CREATE_ENTITY = gql`
  mutation CreateEntity($input: CreateEntityInput!) {
    createEntity(input: $input) {
      id
      entityType
      displayName
      tags
      metadata
      createdAt
      updatedAt
      attributes {
        id
        attributeName
        attributeValue
        confidence
      }
    }
  }
`;

export const UPDATE_ENTITY = gql`
  mutation UpdateEntity($id: ID!, $input: UpdateEntityInput!) {
    updateEntity(id: $id, input: $input) {
      id
      entityType
      displayName
      tags
      metadata
      updatedAt
    }
  }
`;

export const DELETE_ENTITY = gql`
  mutation DeleteEntity($id: ID!) {
    deleteEntity(id: $id)
  }
`;

export const ADD_ENTITY_ATTRIBUTE = gql`
  mutation AddEntityAttribute($entityId: ID!, $input: AddEntityAttributeInput!) {
    addEntityAttribute(entityId: $entityId, input: $input) {
      id
      attributeName
      attributeValue
      confidence
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_ENTITY_ATTRIBUTE = gql`
  mutation UpdateEntityAttribute($id: ID!, $input: UpdateEntityAttributeInput!) {
    updateEntityAttribute(id: $id, input: $input) {
      id
      attributeName
      attributeValue
      confidence
      updatedAt
    }
  }
`;

export const DELETE_ENTITY_ATTRIBUTE = gql`
  mutation DeleteEntityAttribute($id: ID!) {
    deleteEntityAttribute(id: $id)
  }
`;
