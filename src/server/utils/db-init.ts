/**
 * Database Initialization
 * Automatically syncs schema and seeds database on startup
 *
 * PRODUCTION-SAFE:
 * - Uses --force-reset in development only
 * - Uses safe migration-like push in production
 * - Inline seeding (no subprocess that disconnects Prisma)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger.js';
import { prisma } from './prisma.js';
import { hashPassword } from './auth.js';
import { v4 as uuidv4 } from 'uuid';

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

    // Seed database inline (no subprocess that disconnects Prisma!)
    await seedDatabase();

    logger.info('🎉 Database initialization complete!');
  } catch (error) {
    logger.error('❌ Database initialization failed:', { error });
    throw error;
  }
}

/**
 * Seed database with initial data
 * INLINE IMPLEMENTATION - doesn't disconnect Prisma client!
 */
async function seedDatabase(): Promise<void> {
  try {
    // Check if admin user exists
    const adminExists = await prisma.user.findUnique({
      where: { email: 'admin@tella.ai' }
    });

    if (adminExists) {
      logger.info('✅ Database already seeded (admin user exists)');
      return;
    }

    logger.info('🌱 Seeding database with initial data...');

    // Create admin user
    const adminPassword = await hashPassword('Admin123!@#');
    const admin = await prisma.user.upsert({
      where: { email: 'admin@tella.ai' },
      update: {},
      create: {
        id: uuidv4(),
        email: 'admin@tella.ai',
        password: adminPassword,
        name: 'Admin User',
        role: 'ADMIN'
      }
    });
    logger.info('✅ Created admin user:', admin.email);

    // Create sample tools
    const tools = [
      {
        name: 'nmap',
        description: 'Network mapper for port scanning and service detection',
        category: 'SCANNER',
        config: { timeout: 30000 }
      },
      {
        name: 'subfinder',
        description: 'Subdomain discovery tool',
        category: 'RECON',
        config: { sources: ['certificate', 'dns'] }
      },
      {
        name: 'nuclei',
        description: 'Fast vulnerability scanner',
        category: 'SCANNER',
        config: { templates: 'all' }
      },
      {
        name: 'sqlmap',
        description: 'SQL injection detection and exploitation',
        category: 'EXPLOIT',
        config: { risk: 1, level: 1 }
      }
    ];

    for (const tool of tools) {
      await prisma.tool.upsert({
        where: { name: tool.name },
        update: {},
        create: {
          id: uuidv4(),
          ...tool,
          enabled: true
        } as any
      });
    }
    logger.info(`✅ Created ${tools.length} security tools`);

    // Create knowledge base entries
    const knowledge = [
      {
        category: 'OWASP',
        title: 'SQL Injection Testing',
        content: 'SQL injection is a code injection technique that might destroy your database. Attackers can insert malicious SQL statements into entry fields for execution.',
        tags: ['sqli', 'injection', 'database']
      },
      {
        category: 'OWASP',
        title: 'Cross-Site Scripting (XSS)',
        content: 'XSS attacks enable attackers to inject client-side scripts into web pages viewed by other users. Test for reflected, stored, and DOM-based XSS.',
        tags: ['xss', 'injection', 'client-side']
      },
      {
        category: 'Reconnaissance',
        title: 'Subdomain Enumeration Techniques',
        content: 'Use DNS brute-forcing, certificate transparency logs, search engines, and APIs to discover subdomains. Tools: subfinder, amass, assetfinder.',
        tags: ['recon', 'subdomain', 'enumeration']
      },
      {
        category: 'Exploitation',
        title: 'SSRF Testing',
        content: 'Server-Side Request Forgery allows attackers to make requests from the server. Test URL parameters, upload functionality, and webhooks.',
        tags: ['ssrf', 'exploitation']
      }
    ];

    for (const item of knowledge) {
      await prisma.knowledgeBase.upsert({
        where: {
          category_title: {
            category: item.category,
            title: item.title
          }
        },
        update: {
          content: item.content,
          tags: item.tags
        },
        create: {
          id: uuidv4(),
          ...item,
          metadata: {}
        }
      });
    }
    logger.info(`✅ Upserted ${knowledge.length} knowledge base entries`);

    // Create sample target
    const target = await prisma.target.upsert({
      where: { url: 'https://demo.testfire.net' },
      update: {
        description: 'Sample vulnerable web application for testing',
        status: 'ACTIVE'
      },
      create: {
        id: uuidv4(),
        name: 'Demo Target',
        url: 'https://demo.testfire.net',
        type: 'WEB_APP',
        description: 'Sample vulnerable web application for testing',
        status: 'ACTIVE',
        metadata: {
          notes: 'This is a publicly available vulnerable web application for security testing practice.'
        }
      }
    });
    logger.info('✅ Upserted demo target:', target.name);

    logger.info('🎉 Database seeding completed!');
    logger.info('\n📝 Default credentials:');
    logger.info('   Email: admin@tella.ai');
    logger.info('   Password: Admin123!@#');
    logger.info('\n⚠️  IMPORTANT: CHANGE THESE CREDENTIALS IN PRODUCTION!');
  } catch (error) {
    logger.error('❌ Database seeding failed:', { error });
    throw error;
  }
}
