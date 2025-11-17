/**
 * Database Seeder
 * Creates initial data for development and testing
 */

import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../utils/auth.js';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create admin user
  const adminPassword = await hashPassword('admin123');
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
    await prisma.knowledgeBase.create({
      data: {
        id: uuidv4(),
        ...item,
        metadata: {}
      }
    });
  }

  console.log(`✅ Created ${knowledge.length} knowledge base entries`);

  // Create sample target
  const target = await prisma.target.create({
    data: {
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

  console.log('✅ Created demo target:', target.name);

  console.log('🎉 Database seeding completed!');
  console.log('\n📝 Default credentials:');
  console.log('   Email: admin@tella.ai');
  console.log('   Password: admin123');
  console.log('\n⚠️  CHANGE THESE CREDENTIALS IN PRODUCTION!\n');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
