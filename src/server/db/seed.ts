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

  // Create a sample COMPLETED scan with agents, tasks, and findings
  // This shows users what a completed scan looks like
  const scan = await prisma.scan.upsert({
    where: { id: 'demo-scan-001' },
    update: {},
    create: {
      id: 'demo-scan-001',
      name: 'Demo Security Scan',
      targetId: target.id,
      userId: admin.id,
      status: 'COMPLETED',
      progress: 100,
      config: {
        scanType: 'full',
        depth: 2,
        aggressiveMode: false
      },
      startedAt: new Date(Date.now() - 300000), // 5 minutes ago
      completedAt: new Date(Date.now() - 60000), // 1 minute ago
      createdAt: new Date(Date.now() - 360000) // 6 minutes ago
    }
  });

  console.log('✅ Created demo scan:', scan.name);

  // Create sample agents for the demo scan
  const agentTypes = [
    {
      id: 'agent-orchestrator-001',
      name: 'Orchestrator Agent',
      type: 'ORCHESTRATOR',
      role: 'Coordinates all security testing activities',
      status: 'IDLE',
      capabilities: { coordination: true, planning: true }
    },
    {
      id: 'agent-recon-001',
      name: 'Reconnaissance Agent',
      type: 'RECON',
      role: 'Discovers attack surface and gathers intelligence',
      status: 'IDLE',
      capabilities: { subdomain_enum: true, port_scan: true, tech_detection: true }
    },
    {
      id: 'agent-scanner-001',
      name: 'Vulnerability Scanner',
      type: 'SCANNER',
      role: 'Identifies security vulnerabilities',
      status: 'IDLE',
      capabilities: { web_scan: true, api_scan: true, ssl_check: true }
    },
    {
      id: 'agent-analyst-001',
      name: 'Security Analyst',
      type: 'ANALYST',
      role: 'Analyzes findings and prioritizes risks',
      status: 'IDLE',
      capabilities: { risk_assessment: true, impact_analysis: true }
    }
  ];

  for (const agentData of agentTypes) {
    await prisma.agent.upsert({
      where: { id: agentData.id },
      update: {},
      create: {
        id: agentData.id,
        name: agentData.name,
        type: agentData.type as any,
        role: agentData.role,
        status: agentData.status as any,
        scanId: scan.id,
        capabilities: agentData.capabilities,
        config: {},
        memory: {}
      }
    });
  }

  console.log(`✅ Created ${agentTypes.length} demo agents`);

  // Create sample tasks
  const tasks = [
    {
      id: 'task-001',
      agentId: 'agent-recon-001',
      scanId: scan.id,
      type: 'PORT_SCAN',
      description: 'Scan for open ports and services',
      input: { target: target.url, ports: 'common' },
      output: { openPorts: [80, 443, 8080], services: ['http', 'https', 'http-proxy'] },
      status: 'COMPLETED',
      priority: 1
    },
    {
      id: 'task-002',
      agentId: 'agent-scanner-001',
      scanId: scan.id,
      type: 'VULN_SCAN',
      description: 'Scan web application for vulnerabilities',
      input: { url: target.url, scan_types: ['xss', 'sqli'] },
      output: { vulnerabilities: 3, highSeverity: 1 },
      status: 'COMPLETED',
      priority: 2
    },
    {
      id: 'task-003',
      agentId: 'agent-recon-001',
      scanId: scan.id,
      type: 'ENUMERATE',
      description: 'Enumerate subdomains',
      input: { domain: 'testfire.net' },
      output: { subdomains: ['demo', 'www', 'mail'] },
      status: 'COMPLETED',
      priority: 1
    }
  ];

  for (const taskData of tasks) {
    await prisma.task.upsert({
      where: { id: taskData.id },
      update: {},
      create: {
        id: taskData.id,
        agentId: taskData.agentId,
        scanId: taskData.scanId,
        type: taskData.type as any,
        description: taskData.description,
        input: taskData.input,
        output: taskData.output,
        status: taskData.status as any,
        priority: taskData.priority,
        startedAt: new Date(Date.now() - 240000),
        completedAt: new Date(Date.now() - 180000)
      }
    });
  }

  console.log(`✅ Created ${tasks.length} demo tasks`);

  // Create sample findings
  const findings = [
    {
      id: 'finding-001',
      scanId: scan.id,
      targetId: target.id,
      title: 'SQL Injection Vulnerability',
      description: 'The login form is vulnerable to SQL injection attacks. An attacker can bypass authentication by injecting malicious SQL code.',
      severity: 'CRITICAL',
      status: 'CONFIRMED',
      category: 'INJECTION',
      cvss: 9.8,
      cve: 'CVE-2023-XXXX',
      remediation: 'Use parameterized queries or prepared statements. Never concatenate user input directly into SQL queries.',
      references: ['https://owasp.org/www-community/attacks/SQL_Injection'],
      evidence: {
        affectedComponent: '/login.php',
        request: "POST /login.php\nusername=admin' OR '1'='1&password=anything",
        response: 'Login successful',
        payload: "admin' OR '1'='1"
      }
    },
    {
      id: 'finding-002',
      scanId: scan.id,
      targetId: target.id,
      title: 'Cross-Site Scripting (XSS)',
      description: 'The search functionality does not properly sanitize user input, allowing stored XSS attacks.',
      severity: 'HIGH',
      status: 'CONFIRMED',
      category: 'XSS',
      cvss: 7.2,
      remediation: 'Implement proper input validation and output encoding. Use Content Security Policy headers.',
      references: ['https://owasp.org/www-community/attacks/xss/'],
      evidence: {
        affectedComponent: '/search.php',
        payload: '<script>alert(document.cookie)</script>',
        location: 'search parameter'
      }
    },
    {
      id: 'finding-003',
      scanId: scan.id,
      targetId: target.id,
      title: 'Missing Security Headers',
      description: 'The application does not implement important security headers like X-Frame-Options, X-Content-Type-Options, and Strict-Transport-Security.',
      severity: 'MEDIUM',
      status: 'CONFIRMED',
      category: 'MISCONFIGURATION',
      cvss: 5.3,
      remediation: 'Add security headers to all HTTP responses. Use a security header middleware.',
      references: ['https://owasp.org/www-project-secure-headers/'],
      evidence: {
        affectedComponent: 'All pages',
        missingHeaders: ['X-Frame-Options', 'X-Content-Type-Options', 'Strict-Transport-Security']
      }
    },
    {
      id: 'finding-004',
      scanId: scan.id,
      targetId: target.id,
      title: 'Outdated Software Version',
      description: 'The web server is running an outdated version with known security vulnerabilities.',
      severity: 'MEDIUM',
      status: 'CONFIRMED',
      category: 'MISCONFIGURATION',
      cvss: 6.1,
      remediation: 'Update to the latest stable version of the web server software.',
      references: [],
      evidence: {
        affectedComponent: 'Web server',
        currentVersion: 'Apache/2.4.41',
        latestVersion: 'Apache/2.4.58'
      }
    },
    {
      id: 'finding-005',
      scanId: scan.id,
      targetId: target.id,
      title: 'Information Disclosure in Error Messages',
      description: 'Detailed error messages expose sensitive information about the application structure.',
      severity: 'LOW',
      status: 'CONFIRMED',
      category: 'INFO_DISCLOSURE',
      cvss: 3.7,
      remediation: 'Implement generic error messages for users and log detailed errors server-side.',
      references: ['https://owasp.org/www-project-top-ten/2017/A3_2017-Sensitive_Data_Exposure'],
      evidence: {
        affectedComponent: '/error',
        errorMessage: 'MySQL Error: Table users not found in database testfire_db'
      }
    }
  ];

  for (const findingData of findings) {
    await prisma.finding.upsert({
      where: { id: findingData.id },
      update: {},
      create: {
        ...findingData,
        severity: findingData.severity as any,
        status: findingData.status as any,
        category: findingData.category as any
      }
    });
  }

  console.log(`✅ Created ${findings.length} demo findings`);

  console.log('🎉 Database seeding completed!');
  console.log('\n📝 Default credentials:');
  console.log('   Email: admin@tella.ai');
  console.log('   Password: Admin123!@#');
  console.log('\n📊 Demo Data Created:');
  console.log(`   - ${agentTypes.length} AI Agents`);
  console.log(`   - ${tools.length} Security Tools`);
  console.log(`   - ${tasks.length} Completed Tasks`);
  console.log(`   - ${findings.length} Security Findings`);
  console.log(`   - 1 Completed Demo Scan`);
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
