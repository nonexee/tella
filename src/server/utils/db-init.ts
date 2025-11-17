/**
 * Database Initialization
 * Automatically syncs schema and seeds database on startup
 *
 * PRODUCTION-SAFE:
 * - Development: Uses --accept-data-loss (fast iteration)
 * - Production: Safe db push (fails on destructive changes)
 * - Imports seed function (no subprocess, no disconnect!)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger.js';
import { prisma } from './prisma.js';
import { seedDatabase as runSeed } from '../db/seed.js';

const execAsync = promisify(exec);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Initialize database automatically
 * - Syncs Prisma schema (creates/updates tables)
 * - Seeds initial data if needed
 */
export async function initializeDatabase(): Promise<void> {
  try {
    logger.info('🔄 Initializing database...');

    // Check if database is accessible
    try {
      await prisma.$queryRaw`SELECT 1`;
      logger.info('✅ Database connection verified');
    } catch (error) {
      logger.error('❌ Cannot connect to database. Check DATABASE_URL in .env', { error });
      throw new Error('Database connection failed. Verify DATABASE_URL is correct.');
    }

    // Sync schema automatically
    logger.info('🔄 Syncing database schema...');
    try {
      if (IS_PRODUCTION) {
        // Production: Safe push without data loss
        // Will fail if destructive changes are needed (safer!)
        await execAsync('npx prisma db push --skip-generate', {
          env: process.env,
          cwd: process.cwd()
        });
        logger.info('✅ Database schema synced (production mode - safe)');
      } else {
        // Development: Accept data loss for rapid iteration
        await execAsync('npx prisma db push --accept-data-loss --skip-generate', {
          env: process.env,
          cwd: process.cwd()
        });
        logger.info('✅ Database schema synced (development mode)');
      }
    } catch (error: any) {
      logger.error('❌ Schema sync failed:', { error: error.message });
      if (IS_PRODUCTION) {
        logger.error('💡 In production, destructive schema changes require manual migration!');
      }
      throw new Error('Failed to sync database schema');
    }

    // Seed database by importing function (won't disconnect global client!)
    const adminExists = await prisma.user.findUnique({
      where: { email: 'admin@tella.ai' }
    });

    if (!adminExists) {
      logger.info('🌱 Seeding database with initial data...');
      try {
        await runSeed();
        logger.info('✅ Database seeded successfully');
      } catch (error: any) {
        logger.error('❌ Database seeding failed:', { error: error.message });
        throw error;
      }
    } else {
      logger.info('✅ Database already seeded (admin user exists)');
    }

    logger.info('🎉 Database initialization complete!');
  } catch (error) {
    logger.error('❌ Database initialization failed:', { error });
    throw error;
  }
}
