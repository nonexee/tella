/**
 * Prisma Client with Middleware
 *
 * FIXES:
 * - Query logging for slow queries
 * - Centralized client instance
 * - Performance monitoring
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

const SLOW_QUERY_THRESHOLD = process.env.SLOW_QUERY_THRESHOLD
  ? parseInt(process.env.SLOW_QUERY_THRESHOLD, 10)
  : 1000; // 1 second default

// Create singleton Prisma client
export const prisma = new PrismaClient({
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'event',
      level: 'error',
    },
    {
      emit: 'event',
      level: 'warn',
    },
  ],
});

// Log slow queries
prisma.$on('query', (e) => {
  if (e.duration >= SLOW_QUERY_THRESHOLD) {
    logger.warn('Slow query detected', {
      query: e.query,
      duration: `${e.duration}ms`,
      params: e.params,
      target: e.target,
    });
  } else if (process.env.LOG_ALL_QUERIES === 'true') {
    logger.debug('Query executed', {
      query: e.query,
      duration: `${e.duration}ms`,
    });
  }
});

// Log errors
prisma.$on('error', (e) => {
  logger.error('Prisma error', {
    message: e.message,
    target: e.target,
  });
});

// Log warnings
prisma.$on('warn', (e) => {
  logger.warn('Prisma warning', {
    message: e.message,
    target: e.target,
  });
});

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;
