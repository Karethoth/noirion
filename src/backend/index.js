import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { gql } from 'graphql-tag';
import { pool, testConnection } from './src/db/connection.js';
import userResolvers from './src/graphql/resolvers/user.resolver.js';
import imageResolvers from './src/graphql/resolvers/image.resolver.js';
import annotationResolvers from './src/graphql/resolvers/annotation.resolver.js';
import { typeDefs } from './src/graphql/schemas/schema.js';
import GraphQLJSON from 'graphql-type-json';

const startTime = Date.now();

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
    ...imageResolvers.Query,
    ...annotationResolvers.Query
  },
  Mutation: {
    ...userResolvers.Mutation,
    ...imageResolvers.Mutation,
    ...annotationResolvers.Mutation
  },
  Annotation: annotationResolvers.Annotation
};

async function startServer() {
  await initializeDatabase();
  
  const app = express();
  const httpServer = http.createServer(app);
  
  const server = new ApolloServer({ 
    typeDefs: gql(typeDefs), 
    resolvers,
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })]
  });
  
  await server.start();
  
  // Apply CORS and JSON middleware
  app.use(cors());
  app.use(express.json());
  
  // Health check endpoints
  app.get('/health', async (req, res) => {
    try {
      const client = await pool.connect();
      const result = await client.query('SELECT NOW()');
      client.release();
      
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - startTime) / 1000),
        service: 'noirion-backend',
        version: '1.0.0',
        database: {
          connected: true,
          timestamp: result.rows[0].now
        }
      });
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - startTime) / 1000),
        service: 'noirion-backend',
        version: '1.0.0',
        database: {
          connected: false,
          error: error.message
        }
      });
    }
  });
  
  // Liveness probe - simple check that service is running
  app.get('/health/live', (req, res) => {
    res.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString()
    });
  });
  
  // Readiness probe - check if service is ready to accept traffic
  app.get('/health/ready', async (req, res) => {
    try {
      const client = await pool.connect();
      client.release();
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  });
  
  // Apply GraphQL middleware
  app.use('/graphql', expressMiddleware(server, {
    context: async () => {
      return {
        dbPool: pool
      };
    }
  }));
  
  const PORT = process.env.PORT || 4000;
  
  await new Promise((resolve) => httpServer.listen({ port: PORT }, resolve));
  
  console.log(`🚀 Server ready at http://localhost:${PORT}/graphql`);
  console.log(`❤️  Health check at http://localhost:${PORT}/health`);
}

startServer();