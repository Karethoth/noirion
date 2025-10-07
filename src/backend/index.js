import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { gql } from 'graphql-tag';
import { pool, testConnection } from './src/db/connection.js';
import userResolvers from './src/graphql/resolvers/user.resolver.js';
import imageResolvers from './src/graphql/resolvers/image.resolver.js';
import { typeDefs } from './src/graphql/schemas/schema.js';
import GraphQLJSON from 'graphql-type-json';

async function initializeDatabase() {
  const connected = await testConnection();
  if (!connected) {
    console.error('Failed to connect to database');
    process.exit(1);
  }
}

const resolvers = {
  JSON: GraphQLJSON,
  Upload: imageResolvers.Upload,
  Query: {
    hello: () => 'Hello, World!',
    health: async () => {
      try {
        const client = await pool.connect();
        client.release();
        return 'Service is healthy and connected to database';
      } catch (err) {
        console.error('Database health check failed:', err);
        return 'Service is running but database connection failed';
      }
    },
    ...userResolvers.Query,
    ...imageResolvers.Query
  },
  Mutation: {
    ...userResolvers.Mutation,
    ...imageResolvers.Mutation
  }
};

async function startServer() {
  await initializeDatabase();
  
  const server = new ApolloServer({ 
    typeDefs: gql(typeDefs), 
    resolvers 
  });
  
  const { url } = await startStandaloneServer(server, { 
    listen: { port: 4000 },
    context: async () => {
      return {
        dbPool: pool
      };
    }
  });
  
  console.log(`Server ready at ${url}`);
}

startServer();