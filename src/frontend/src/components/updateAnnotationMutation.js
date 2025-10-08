import { gql } from '@apollo/client';

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
