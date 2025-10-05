import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { gql } from 'graphql-tag';
import { pool, testConnection } from './src/db/connection.js';

async function initializeDatabase() {
  const connected = await testConnection();
  if (!connected) {
    console.error('Failed to connect to database');
    process.exit(1);
  }
}

const typeDefs = gql`
  type Query {
    hello: String
    health: String
  }
`;

const resolvers = {
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
    }
  }
};

async function startServer() {
  await initializeDatabase();
  
  const server = new ApolloServer({ typeDefs, resolvers });
  
  const { url } = await startStandaloneServer(server, { 
    listen: { port: 4000 }
  });
  
  console.log(`Server ready at ${url}`);
}

startServer();
