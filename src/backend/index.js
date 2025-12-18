import { ApolloServer } from '@apollo/server';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { gql } from 'graphql-tag';
import * as GraphQLUpload from 'graphql-upload-minimal';
import { pool, testConnection, getPoolStats } from './src/db/connection.js';
import userResolvers from './src/graphql/resolvers/user.resolver.js';
import imageResolvers from './src/graphql/resolvers/image.resolver.js';
import annotationResolvers from './src/graphql/resolvers/annotation.resolver.js';
import entityResolvers from './src/graphql/resolvers/entity.resolver.js';
import presenceResolvers from './src/graphql/resolvers/presence.resolver.js';
import entityLinkResolvers from './src/graphql/resolvers/entity-link.resolver.js';
import eventResolvers from './src/graphql/resolvers/event.resolver.js';
import projectSettingsResolvers from './src/graphql/resolvers/project-settings.resolver.js';
import adminResolvers from './src/graphql/resolvers/admin.resolver.js';
import lmStudioResolvers from './src/graphql/resolvers/lmstudio.resolver.js';
import { typeDefs } from './src/graphql/schemas/schema.js';
import GraphQLJSON from 'graphql-type-json';
import { getUserFromAuthHeader } from './src/utils/auth.js';
import { runMigrations } from './scripts/run-migrations.js';
import { createLoaders } from './src/graphql/loaders.js';
import { EntityService } from './src/services/entities.js';

const startTime = Date.now();

const DEBUG_HTTP = ['1', 'true', 'yes', 'on'].includes(String(process.env.DEBUG_HTTP || '').toLowerCase());
const DEBUG_GRAPHQL = ['1', 'true', 'yes', 'on'].includes(String(process.env.DEBUG_GRAPHQL || '').toLowerCase());

function newRequestId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function summarizeGraphQLBody(body) {
  if (!body || typeof body !== 'object') return { operationName: null, hasQuery: false };
  const operationName = typeof body.operationName === 'string' ? body.operationName : null;
  const hasQuery = typeof body.query === 'string' ? body.query.length > 0 : !!body.query;
  return { operationName, hasQuery };
}

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
    ...projectSettingsResolvers.Query,
    ...lmStudioResolvers.Query
  },
  Mutation: {
    ...userResolvers.Mutation,
    ...imageResolvers.Mutation,
    ...annotationResolvers.Mutation,
    ...entityResolvers.Mutation,
    ...presenceResolvers.Mutation,
    ...entityLinkResolvers.Mutation,
    ...eventResolvers.Mutation,
    ...projectSettingsResolvers.Mutation,
    ...adminResolvers.Mutation
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
  // NOTE: Browsers reject `Access-Control-Allow-Origin: *` when `Access-Control-Allow-Credentials: true`.
  // Using `origin: true` reflects the request origin, keeping CORS compatible for local dev.
  app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'apollo-require-preflight',
      'x-apollo-operation-name',
    ],
  }));

  // Serve uploaded files statically
  app.use('/uploads', express.static('uploads'));

  // Parse JSON for non-file requests
  app.use(express.json());

  // Attach a request id for easier correlation in logs.
  app.use((req, res, next) => {
    req.__requestId = newRequestId();
    res.setHeader('x-request-id', req.__requestId);
    if (DEBUG_HTTP) {
      const start = Date.now();
      res.on('finish', () => {
        const ms = Date.now() - start;
        // eslint-disable-next-line no-console
        console.log(`[${req.__requestId}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
      });
    }
    next();
  });

  // Apply GraphQL Upload middleware BEFORE the GraphQL endpoint
  app.use(
    '/graphql',
    GraphQLUpload.graphqlUploadExpress({ maxFileSize: 2147483648, maxFiles: 100 })
  );

  // Handle OPTIONS requests for CORS preflight
  app.options('/graphql', (req, res) => {
    res.status(200).end();
  });

  // Apply Apollo Server middleware manually
  app.post('/graphql', async (req, res) => {
    const requestId = req.__requestId || newRequestId();
    const start = Date.now();
    const { operationName, hasQuery } = summarizeGraphQLBody(req.body);
    const hasAuthHeader = typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ');

    let watchdog = null;
    if (DEBUG_GRAPHQL) {
      try {
        const stats = await getPoolStats();
        // eslint-disable-next-line no-console
        console.log(`[${requestId}] dbPool stats total=${stats.total} idle=${stats.idle} waiting=${stats.waiting}`);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`[${requestId}] dbPool stats unavailable:`, e?.message || e);
      }

      // eslint-disable-next-line no-console
      console.log(
        `[${requestId}] GraphQL request start op=${operationName || 'unknown'} hasQuery=${hasQuery} auth=${hasAuthHeader}`
      );

      watchdog = setTimeout(() => {
        // eslint-disable-next-line no-console
        console.warn(
          `[${requestId}] GraphQL still running after 15s op=${operationName || 'unknown'} (possible DB wait/hang)`
        );
      }, 15000);
    }

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

          if (DEBUG_GRAPHQL) {
            // eslint-disable-next-line no-console
            console.log(
              `[${requestId}] GraphQL context userId=${user?.userId || 'null'} role=${user?.role || 'null'}`
            );
          }

          const entityService = new EntityService(pool);
          const loaders = createLoaders(pool, { entityService });

          return {
            dbPool: pool,
            req,
            user,
            userId: user?.userId || null,
            userRole: user?.role || null,
            loaders,
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

      if (DEBUG_GRAPHQL) {
        const ms = Date.now() - start;
        // eslint-disable-next-line no-console
        console.log(
          `[${requestId}] GraphQL request end op=${operationName || 'unknown'} status=${httpGraphQLResponse.status || 200} (${ms}ms)`
        );
      }
    } catch (error) {
      console.error('GraphQL error:', error);
      res.status(500).json({ errors: [{ message: error.message }] });
    } finally {
      if (watchdog) clearTimeout(watchdog);
    }
  });

  // Health check endpoint
  app.get('/health', async (req, res) => {
    try {
      if (DEBUG_HTTP) {
        try {
          const stats = await getPoolStats();
          // eslint-disable-next-line no-console
          console.log(`[${req.__requestId || 'health'}] /health dbPool total=${stats.total} idle=${stats.idle} waiting=${stats.waiting}`);
        } catch {
          // ignore
        }
      }

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
