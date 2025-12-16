import { gql } from '@apollo/client';

export const GET_EVENTS = gql`
  query GetEvents($before: String, $after: String) {
    events(before: $before, after: $after, limit: 500, offset: 0) {
      id
      occurredAt
      latitude
      longitude
      title
      description
      entities {
        eventId
        entityId
        role
        confidence
        entity {
          id
          entityType
          displayName
        }
      }
    }
  }
`;

export const GET_EVENTS_BY_ENTITY = gql`
  query GetEventsByEntity($entityId: ID!, $before: String, $after: String, $limit: Int, $offset: Int) {
    eventsByEntity(entityId: $entityId, before: $before, after: $after, limit: $limit, offset: $offset) {
      id
      title
      description
      occurredAt
      latitude
      longitude
    }
  }
`;

export const CREATE_EVENT = gql`
  mutation CreateEvent($input: CreateEventInput!) {
    createEvent(input: $input) {
      id
      entities {
        eventId
        entityId
      }
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
      entities {
        eventId
        entityId
        role
        confidence
        entity {
          id
          entityType
          displayName
        }
      }
    }
  }
`;
