/**
 * Tella AI Security - Main Server
 *
 * FIXES:
 * - Async file reading (no blocking)
 * - Helmet for security headers
 * - Rate limiting middleware
 * - Proper CORS configuration
 * - Request size limits
 * - Graceful shutdown handling
 * - Request logging
 * - Better error handling
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
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { resolvers } from './graphql/resolvers.js';
import { authenticateUser } from './utils/auth.js';
import { logger } from './utils/logger.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================
// Configuration
// ============================================

const PORT = parseInt(process.env.PORT || '4000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// CORS configuration with wildcard protection
const CORS_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : IS_PRODUCTION
  ? [] // No origins in prod without explicit config
  : ['http://localhost:5173', 'http://localhost:3000'];

// CRITICAL SECURITY: Prevent wildcard CORS in production
if (IS_PRODUCTION && CORS_ORIGINS.includes('*')) {
  logger.error('FATAL: Wildcard CORS (*) is not allowed in production!');
  throw new Error('CORS_ORIGIN cannot contain wildcard (*) in production environment');
}

// ============================================
// Rate Limiting
// ============================================

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: IS_PRODUCTION ? 100 : 1000, // Requests per window
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // Only 5 login attempts per 15 minutes
  skipSuccessfulRequests: true,
  message: 'Too many authentication attempts, please try again later'
});

// ============================================
// Initialize Server
// ============================================

async function initializeServer() {
  try {
    // Load GraphQL schema asynchronously
    logger.info('Loading GraphQL schema...');
    const schemaPath = join(__dirname, 'graphql', 'schema.graphql');
    const typeDefs = await fs.readFile(schemaPath, 'utf-8');

    // Create executable schema
    const schema = makeExecutableSchema({ typeDefs, resolvers });

    // Create Express app
    const app = express();
    const httpServer = createServer(app);

    // Trust proxy in production (for rate limiting)
    if (IS_PRODUCTION) {
      app.set('trust proxy', 1);
    }

    // ============================================
    // Security Middleware
    // ============================================

    // Helmet - Security headers
    app.use(
      helmet({
        contentSecurityPolicy: IS_PRODUCTION ? undefined : false,
        crossOriginEmbedderPolicy: false
      })
    );

    // Request size limits
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    // Request logging
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info({
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration: `${duration}ms`,
          ip: req.ip
        });
      });
      next();
    });

    // Apply rate limiting
    app.use('/graphql', generalLimiter);

    // ============================================
    // WebSocket Server
    // ============================================

    const wsServer = new WebSocketServer({
      server: httpServer,
      path: '/graphql'
    });

    const serverCleanup = useServer(
      {
        schema,
        context: async (ctx) => {
          // Authentication for WebSocket connections
          const token = ctx.connectionParams?.authorization?.replace('Bearer ', '');
          if (token) {
            try {
              const user = await authenticateUser(token);
              return { user };
            } catch (error) {
              logger.error('WS auth error:', error);
              return {};
            }
          }
          return {};
        },
        onConnect: async (ctx) => {
          logger.info('WebSocket client connected');
        },
        onDisconnect: async (ctx) => {
          logger.info('WebSocket client disconnected');
        }
      },
      wsServer
    );

    // ============================================
    // Apollo Server
    // ============================================

    const apolloServer = new ApolloServer({
      schema,
      plugins: [
        ApolloServerPluginDrainHttpServer({ httpServer }),
        {
          async serverWillStart() {
            logger.info('Apollo Server starting...');
            return {
              async drainServer() {
                await serverCleanup.dispose();
                logger.info('WebSocket server disposed');
              }
            };
          }
        }
      ],
      formatError: (formattedError, error) => {
        // Don't expose internal errors in production
        if (IS_PRODUCTION && formattedError.extensions?.code === 'INTERNAL_SERVER_ERROR') {
          logger.error('Internal server error:', error);
          return {
            message: 'An internal error occurred',
            extensions: {
              code: 'INTERNAL_SERVER_ERROR'
            }
          };
        }
        return formattedError;
      }
    });

    await apolloServer.start();
    logger.info('Apollo Server started');

    // ============================================
    // Routes
    // ============================================

    // GraphQL endpoint
    app.use(
      '/graphql',
      cors<cors.CorsRequest>({
        origin: (origin, callback) => {
          // Allow requests with no origin (mobile apps, curl, etc.)
          if (!origin) return callback(null, true);

          if (CORS_ORIGINS.length === 0 && IS_PRODUCTION) {
            logger.warn(`CORS: Rejected origin ${origin} - no origins configured in production`);
            return callback(new Error('Not allowed by CORS'), false);
          }

          if (CORS_ORIGINS.includes(origin) || CORS_ORIGINS.includes('*')) {
            return callback(null, true);
          }

          logger.warn(`CORS: Rejected origin ${origin}`);
          return callback(new Error('Not allowed by CORS'), false);
        },
        credentials: true,
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'Authorization']
      }),
      expressMiddleware(apolloServer, {
        context: async ({ req }) => {
          // Authentication middleware
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (token) {
            try {
              const user = await authenticateUser(token);
              return { user };
            } catch (error) {
              logger.debug('Auth token invalid or expired');
              return {};
            }
          }
          return {};
        }
      })
    );

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: NODE_ENV
      });
    });

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.path}`,
        availableEndpoints: ['/graphql', '/health']
      });
    });

    // Error handler
    app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Express error:', err);
      res.status(500).json({
        error: 'Internal Server Error',
        message: IS_PRODUCTION ? 'An error occurred' : err.message
      });
    });

    // ============================================
    // Start Server
    // ============================================

    await new Promise<void>((resolve) => {
      httpServer.listen(PORT, () => {
        logger.info(`🚀 Server ready at http://localhost:${PORT}/graphql`);
        logger.info(`🔌 WebSocket ready at ws://localhost:${PORT}/graphql`);
        logger.info(`🛡️  Tella AI Security Platform`);
        logger.info(`📊 Environment: ${NODE_ENV}`);
        logger.info(`🔒 CORS Origins: ${CORS_ORIGINS.length > 0 ? CORS_ORIGINS.join(', ') : 'None configured'}`);
        resolve();
      });
    });

    // ============================================
    // Graceful Shutdown
    // ============================================

    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, starting graceful shutdown...`);

      // Stop accepting new connections
      httpServer.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Close WebSocket server
          await serverCleanup.dispose();
          logger.info('WebSocket connections closed');

          // Stop Apollo Server
          await apolloServer.stop();
          logger.info('Apollo Server stopped');

          logger.info('Graceful shutdown complete');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      shutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      shutdown('UNHANDLED_REJECTION');
    });

    return { app, httpServer, apolloServer };
  } catch (error) {
    logger.error('Failed to initialize server:', error);
    throw error;
  }
}

// ============================================
// Start Application
// ============================================

initializeServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
