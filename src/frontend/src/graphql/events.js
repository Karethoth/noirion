import { gql } from '@apollo/client';

export const GET_EVENTS = gql`
  query GetEvents($before: String) {
    events(before: $before, limit: 500, offset: 0) {
      id
      occurredAt
      latitude
      longitude
      title
      description
    }
  }
`;

export const CREATE_EVENT = gql`
  mutation CreateEvent($input: CreateEventInput!) {
    createEvent(input: $input) {
      id
    }
  }
`;

export const DELETE_EVENT = gql`
  mutation DeleteEvent($id: ID!) {
    deleteEvent(id: $id)
  }
`;

export const UPDATE_EVENT = gql`
  mutation UpdateEvent($id: ID!, $input: UpdateEventInput!) {
    updateEvent(id: $id, input: $input) {
      id
      occurredAt
      latitude
      longitude
      title
      description
    }
  }
`;
