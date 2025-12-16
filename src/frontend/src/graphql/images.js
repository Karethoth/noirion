import { gql } from '@apollo/client';

export const GET_IMAGES = gql`
  query GetImages {
    images {
      id
      filename
      filePath
      fileSize
      latitude
      longitude
      captureTimestamp
      cameraMake
      cameraModel
      uploadedAt
      annotations {
        id
        tags
      }
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
