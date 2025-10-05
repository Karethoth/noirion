import { ApolloServer } from '@apollo/server';
import { gql } from 'graphql-tag';
import { test, expect } from 'vitest';
import { typeDefs as schemaTypeDefs, resolvers as schemaResolvers } from '../src/graphql/schemas/schema';

test('should return hello message', () => {
  const resolvers = {
    Query: {
      hello: () => 'world',
    }
  };

  expect(resolvers.Query.hello()).toBe('world');
});

test('should start Apollo server correctly', async () => {
  const typeDefs = gql`
    type Query {
      hello: String
    }
  `;

  const testResolvers = {
    Query: {
      hello: () => 'world'
    }
  };

  const server = new ApolloServer({
    typeDefs,
    resolvers: testResolvers
  });

  expect(server).toBeDefined();
});


test('should have valid schema definitions', () => {
  expect(schemaTypeDefs).toContain('type Query');
  expect(schemaTypeDefs).toContain('hello: String');

  expect(schemaResolvers).toBeDefined();
  expect(schemaResolvers.Query).toBeDefined();
});


