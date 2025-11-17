/**
 * Tella AI Security - Main Server
 *
 * GraphQL API server with WebSocket support for real-time updates
 */

import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { makeExecutableSchema } from '@graphql-tools/schema';
import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { resolvers } from './graphql/resolvers.js';
import { verifyToken } from './utils/auth.js';
import { logger } from './utils/logger.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load GraphQL schema
const typeDefs = readFileSync(
  join(__dirname, 'graphql', 'schema.graphql'),
  'utf-8'
);

// Create executable schema
const schema = makeExecutableSchema({ typeDefs, resolvers });

// Create Express app
const app = express();
const httpServer = createServer(app);

// Create WebSocket server for subscriptions
const wsServer = new WebSocketServer({
  server: httpServer,
  path: '/graphql'
});

// Set up WebSocket handler
const serverCleanup = useServer(
  {
    schema,
    context: async (ctx) => {
      // Authentication for WebSocket connections
      const token = ctx.connectionParams?.authorization?.replace('Bearer ', '');
      if (token) {
        try {
          const payload = verifyToken(token);
          return { user: payload };
        } catch (error) {
          logger.error('WS auth error:', error);
        }
      }
      return {};
    }
  },
  wsServer
);

// Create Apollo Server
const server = new ApolloServer({
  schema,
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await serverCleanup.dispose();
          }
        };
      }
    }
  ]
});

// Start server
async function startServer() {
  await server.start();

  app.use(
    '/graphql',
    cors<cors.CorsRequest>({
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true
    }),
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }) => {
        // Authentication middleware
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (token) {
          try {
            const payload = verifyToken(token);
            return { user: payload };
          } catch (error) {
            logger.error('Auth error:', error);
          }
        }
        return {};
      }
    })
  );

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Start listening
  const PORT = process.env.PORT || 4000;
  httpServer.listen(PORT, () => {
    logger.info(`🚀 Server ready at http://localhost:${PORT}/graphql`);
    logger.info(`🔌 WebSocket ready at ws://localhost:${PORT}/graphql`);
    logger.info(`🛡️  Tella AI Security Platform - Offensive Security Testing`);
  });
}

startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
