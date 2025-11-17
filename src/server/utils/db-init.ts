/**
 * Database Initialization
 * Automatically syncs schema and seeds database on startup
 * NO MIGRATIONS NEEDED - Just start the app!
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger.js';
import { prisma } from './prisma.js';

const execAsync = promisify(exec);

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

    // Sync schema automatically (no migrations needed!)
    logger.info('🔄 Syncing database schema...');
    try {
      await execAsync('npx prisma db push --accept-data-loss --skip-generate', {
        env: process.env,
        cwd: process.cwd()
      });
      logger.info('✅ Database schema synced');
    } catch (error: any) {
      logger.error('❌ Schema sync failed:', { error: error.message });
      throw new Error('Failed to sync database schema');
    }

    // Check if we need to seed (if admin user doesn't exist)
    const adminExists = await prisma.user.findUnique({
      where: { email: 'admin@tella.ai' }
    });

    if (!adminExists) {
      logger.info('🌱 Seeding database with initial data...');
      try {
        await execAsync('npm run db:seed', {
          env: process.env,
          cwd: process.cwd()
        });
        logger.info('✅ Database seeded successfully');
      } catch (error: any) {
        logger.warn('⚠️  Database seeding failed (non-fatal):', { error: error.message });
        // Don't throw - seeding failure shouldn't prevent startup
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
