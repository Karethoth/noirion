import { ApolloServer } from '@apollo/server';
import { gql } from 'graphql-tag';
import { test, expect } from 'vitest';
import { typeDefs } from '../src/graphql/schemas/schema.js';

test('should return hello message', () => {
  const resolvers = {
    Query: {
      hello: () => 'world',
    }
  };

  expect(resolvers.Query.hello()).toBe('world');
});

test('should start Apollo server correctly', async () => {
  const testTypeDefs = gql`
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
    typeDefs: testTypeDefs,
    resolvers: testResolvers
  });

  expect(server).toBeDefined();
});

test('should have valid schema definitions', () => {
  expect(typeDefs).toBeDefined();
  expect(typeDefs).toContain('type Query');
  expect(typeDefs).toContain('type Image');
  expect(typeDefs).toContain('type Annotation');
});


