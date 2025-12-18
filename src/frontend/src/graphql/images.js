import { gql } from '@apollo/client';

export const GET_IMAGES = gql`
  query GetImages {
    images {
      id
      filename
      displayName
      filePath
      fileSize
      width
      height
      latitude
      longitude
      captureTimestamp
      cameraMake
      cameraModel
      uploadedAt
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

export const GET_IMAGE_IDS = gql`
  query GetImageIds {
    images {
      id
    }
  }
`;

export const GET_IMAGE = gql`
  query GetImage($id: ID!) {
    image(id: $id) {
      id
      filename
      displayName
      filePath
      fileSize
      mimeType
      width
      height
      latitude
      longitude
      altitude
      captureTimestamp
      uploadedAt
      cameraMake
      cameraModel
      metadata
      aiAnalysis {
        caption
        licensePlates
        model
        createdAt
      }
    }
  }
`;

export const SET_IMAGE_AUTO_PRESENCE_IGNORES = gql`
  mutation SetImageAutoPresenceIgnoredEntities($imageId: ID!, $ignoredEntityIds: [ID!]!) {
    setImageAutoPresenceIgnoredEntities(imageId: $imageId, ignoredEntityIds: $ignoredEntityIds) {
      id
      metadata
    }
  }
`;

export const UPDATE_IMAGE = gql`
  mutation UpdateImage($id: ID!, $input: UpdateImageInput!) {
    updateImage(id: $id, input: $input) {
      id
      filename
      displayName
      filePath
      fileSize
      latitude
      longitude
      altitude
      captureTimestamp
      uploadedAt
      aiAnalysis {
        caption
        licensePlates
        model
        createdAt
      }
    }
  }
`;

export const ANALYZE_IMAGE = gql`
  mutation AnalyzeImage($id: ID!, $model: String, $persist: Boolean = true) {
    analyzeImage(id: $id, model: $model, persist: $persist) {
      caption
      licensePlates
      model
      createdAt
    }
  }
`;

export const DELETE_IMAGE = gql`
  mutation DeleteImage($id: ID!) {
    deleteImage(id: $id)
  }
`;

export const UPLOAD_IMAGE = gql`
  mutation UploadImage($file: Upload!) {
    uploadImage(file: $file) {
      id
      filename
      filePath
      fileSize
      latitude
      longitude
      captureTimestamp
      uploadedAt
    }
  }
`;

export const UPLOAD_IMAGES = gql`
  mutation UploadImages($files: [Upload!]!) {
    uploadImages(files: $files) {
      id
      filename
      filePath
      fileSize
      latitude
      longitude
      captureTimestamp
      uploadedAt
    }
  }
`;
