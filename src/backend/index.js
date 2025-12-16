import { ApolloServer } from '@apollo/server';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { gql } from 'graphql-tag';
import * as GraphQLUpload from 'graphql-upload-minimal';
import { pool, testConnection } from './src/db/connection.js';
import userResolvers from './src/graphql/resolvers/user.resolver.js';
import imageResolvers from './src/graphql/resolvers/image.resolver.js';
import annotationResolvers from './src/graphql/resolvers/annotation.resolver.js';
import entityResolvers from './src/graphql/resolvers/entity.resolver.js';
import presenceResolvers from './src/graphql/resolvers/presence.resolver.js';
import entityLinkResolvers from './src/graphql/resolvers/entity-link.resolver.js';
import eventResolvers from './src/graphql/resolvers/event.resolver.js';
import projectSettingsResolvers from './src/graphql/resolvers/project-settings.resolver.js';
import { typeDefs } from './src/graphql/schemas/schema.js';
import GraphQLJSON from 'graphql-type-json';
import { getUserFromAuthHeader } from './src/utils/auth.js';
import { runMigrations } from './scripts/run-migrations.js';

const startTime = Date.now();

async function initializeDatabase() {
  const connected = await testConnection();
  if (!connected) {
    console.error('Failed to connect to database');
    process.exit(1);
  }

  // Run database migrations
  console.log('Running database migrations...');
  await runMigrations();
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
    ...annotationResolvers.Query,
    ...entityResolvers.Query,
    ...presenceResolvers.Query,
    ...entityLinkResolvers.Query,
    ...eventResolvers.Query,
    ...projectSettingsResolvers.Query
  },
  Mutation: {
    ...userResolvers.Mutation,
    ...imageResolvers.Mutation,
    ...annotationResolvers.Mutation,
    ...entityResolvers.Mutation,
    ...presenceResolvers.Mutation,
    ...entityLinkResolvers.Mutation,
    ...eventResolvers.Mutation,
    ...projectSettingsResolvers.Mutation
  },
  Image: imageResolvers.Image,
  Annotation: annotationResolvers.Annotation,
  Entity: entityResolvers.Entity,
  Presence: presenceResolvers.Presence,
  PresenceEntity: presenceResolvers.PresenceEntity,
  EntityLink: entityLinkResolvers.EntityLink,
  Event: eventResolvers.Event,
  EventEntity: eventResolvers.EventEntity
};

async function startServer() {
  await initializeDatabase();

  const app = express();
  const httpServer = http.createServer(app);

  const server = new ApolloServer({
    typeDefs: gql(typeDefs),
    resolvers,
    csrfPrevention: false, // Disable CSRF for file uploads
  });

  await server.start();

  // Apply CORS with proper configuration
  app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'apollo-require-preflight', 'x-apollo-operation-name'],
  }));

  // Serve uploaded files statically
  app.use('/uploads', express.static('uploads'));

  // Parse JSON for non-file requests
  app.use(express.json());

  // Apply GraphQL Upload middleware BEFORE the GraphQL endpoint
  app.use(
    '/graphql',
    GraphQLUpload.graphqlUploadExpress({ maxFileSize: 100000000, maxFiles: 10 })
  );

  // Handle OPTIONS requests for CORS preflight
  app.options('/graphql', (req, res) => {
    res.status(200).end();
  });

  // Apply Apollo Server middleware manually
  app.post('/graphql', async (req, res) => {
    try {
      // Convert Express headers to Headers object
      const headers = new Headers();
      Object.entries(req.headers).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach(v => headers.append(key, v));
        } else if (value) {
          headers.set(key, value);
        }
      });

      const httpGraphQLRequest = {
        body: req.body,
        headers: headers,
        method: req.method,
      };

      const httpGraphQLResponse = await server.executeHTTPGraphQLRequest({
        httpGraphQLRequest,
        context: async () => {
          // Extract user from Authorization header
          const authHeader = req.headers.authorization;
          const user = getUserFromAuthHeader(authHeader);

          return {
            dbPool: pool,
            req,
            user,
            userId: user?.userId || null,
            userRole: user?.role || null
          };
        },
      });

      for (const [key, value] of httpGraphQLResponse.headers) {
        res.setHeader(key, value);
      }
      res.status(httpGraphQLResponse.status || 200);

      if (httpGraphQLResponse.body.kind === 'complete') {
        res.send(httpGraphQLResponse.body.string);
      } else {
        for await (const chunk of httpGraphQLResponse.body.asyncIterator) {
          res.write(chunk);
        }
        res.end();
      }
    } catch (error) {
      console.error('GraphQL error:', error);
      res.status(500).json({ errors: [{ message: error.message }] });
    }
  });

  // Health check endpoint
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

  const PORT = process.env.PORT || 4000;

  await new Promise((resolve) => httpServer.listen({ port: PORT }, resolve));

  console.log(`🚀 Server ready at http://localhost:${PORT}/graphql`);
  console.log(`❤️  Health check at http://localhost:${PORT}/health`);
}

startServer();
