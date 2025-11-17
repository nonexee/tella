/**
 * Database Seeder
 * Creates initial data for development and testing
 *
 * IDEMPOTENT: Can be run multiple times without errors
 */

import { prisma } from '../utils/prisma.js';
import { hashPassword } from '../utils/auth.js';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  console.log('🌱 Seeding database...');
  console.log('ℹ️  This script is idempotent and safe to run multiple times\n');

  // Create admin user
  // Password meets requirements: 8+ chars, uppercase, lowercase, number, special char
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

  console.log('✅ Created admin user:', admin.email);

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

  console.log(`✅ Created ${tools.length} security tools`);

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
        // Composite unique key: category + title
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

  console.log(`✅ Upserted ${knowledge.length} knowledge base entries`);

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

  console.log('✅ Upserted demo target:', target.name);

  console.log('🎉 Database seeding completed!');
  console.log('\n📝 Default credentials:');
  console.log('   Email: admin@tella.ai');
  console.log('   Password: Admin123!@#');
  console.log('\n⚠️  IMPORTANT SECURITY NOTES:');
  console.log('   - CHANGE THESE CREDENTIALS IN PRODUCTION!');
  console.log('   - Password requirements: 8+ chars, uppercase, lowercase, number, special char');
  console.log('   - Login attempts limited to 5 per 15 minutes');
  console.log('   - Access tokens expire after 15 minutes\n');
}

// Only run main() if this file is executed directly (not imported)
const isMain = import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  main()
    .catch((e) => {
      console.error('❌ Seeding failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      // Only disconnect when running standalone
      // When imported by db-init.ts, this won't run
      await prisma.$disconnect();
    });
}

// Export for use in db-init.ts (imported, won't disconnect)
export { main as seedDatabase };
