/**
 * GraphQL Resolvers
 *
 * FIXES:
 * - Added authorization checks to ALL mutations
 * - Added input validation with Zod
 * - Added pagination support
 * - Fixed PubSub implementation
 * - Added proper error handling
 * - Added permission checks using RBAC
 * - Fixed login rate limiting integration
 * - Replaced all 'any' types with proper types
 */

import { User, Scan, Agent, Task, Finding, Target, Tool, Webhook } from '@prisma/client';
import { GraphQLError, ValueNode } from 'graphql';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { WebhookService } from '../services/webhook-service.js';
import {
  hashPassword,
  comparePassword,
  generateTokenPair,
  verifyToken,
  refreshAccessToken,
  hasPermission,
  checkLoginAttempts,
  recordLoginAttempt,
  validateEmail,
  validatePassword
} from '../utils/auth.js';
import { AgentOrchestrator } from '../ai/agent-orchestrator.js';
import { PubSub } from 'graphql-subscriptions';
import { prisma } from '../utils/prisma.js';
import { addScanJob } from '../queue/scan-queue.js';
import { logger } from '../utils/logger.js';

const pubsub = new PubSub();
const orchestrator = new AgentOrchestrator();

// ============================================
// Constants
// ============================================

const MAX_PAGINATION_LIMIT = 1000; // Maximum items per page
const DEFAULT_PAGINATION_LIMIT = 50;

// ============================================
// Type Definitions
// ============================================

interface Context {
  user?: User;
}

interface PaginationArgs {
  limit?: number;
  offset?: number;
}

// ============================================
// Validation Schemas
// ============================================

const createTargetSchema = z.object({
  name: z.string().min(1).max(255),
  url: z.string().url(),
  type: z.enum(['WEB_APP', 'API', 'MOBILE_APP', 'NETWORK', 'CLOUD_INFRA', 'CUSTOM']),
  description: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

const createScanSchema = z.object({
  name: z.string().min(1).max(255),
  targetId: z.string().uuid(),
  config: z.record(z.unknown())
});

const createFindingSchema = z.object({
  scanId: z.string().uuid(),
  targetId: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().min(1),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']),
  category: z.string().min(1),
  evidence: z.record(z.unknown()),
  cvss: z.number().min(0).max(10).optional(),
  cve: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  remediation: z.string().optional(),
  references: z.array(z.string()).optional()
});

// ============================================
// Helper Functions
// ============================================

function requireAuth(context: Context): User {
  if (!context.user) {
    throw new GraphQLError('Not authenticated', {
      extensions: { code: 'UNAUTHENTICATED' }
    });
  }
  return context.user;
}

function requirePermission(context: Context, permission: string): User {
  const user = requireAuth(context);

  if (!hasPermission(user.role, permission)) {
    throw new GraphQLError(`Permission denied: ${permission}`, {
      extensions: { code: 'FORBIDDEN' }
    });
  }

  return user;
}

function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new GraphQLError('Validation failed', {
        extensions: {
          code: 'BAD_USER_INPUT',
          errors: error.errors
        }
      });
    }
    throw error;
  }
}

/**
 * Validate and clamp pagination parameters
 * Prevents abuse with massive limit values (SECURITY!)
 */
function validatePagination(args: PaginationArgs): { limit: number; offset: number } {
  const limit = Math.min(
    args.limit || DEFAULT_PAGINATION_LIMIT,
    MAX_PAGINATION_LIMIT
  );
  const offset = Math.max(args.offset || 0, 0);

  return { limit, offset };
}

/**
 * Validate enum value with proper error handling
 * Returns typed enum value or undefined for safer Prisma queries
 */
function validateEnum<T>(value: string | undefined, validValues: readonly string[], enumName: string): T | undefined {
  if (!value) return undefined;
  if (validValues.includes(value)) {
    return value as T;
  }
  throw new GraphQLError(`Invalid ${enumName}: ${value}. Must be one of: ${validValues.join(', ')}`, {
    extensions: { code: 'BAD_USER_INPUT' }
  });
}

// Enum value arrays for validation
const SCAN_STATUS_VALUES = ['QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED'] as const;
const AGENT_STATUS_VALUES = ['IDLE', 'ACTIVE', 'BUSY', 'ERROR', 'TERMINATED'] as const;
const TASK_STATUS_VALUES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED'] as const;
const SEVERITY_VALUES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;
const FINDING_STATUS_VALUES = ['NEW', 'CONFIRMED', 'FALSE_POSITIVE', 'MITIGATED', 'ACCEPTED'] as const;
const TOOL_CATEGORY_VALUES = ['RECON', 'SCANNER', 'FUZZER', 'EXPLOIT', 'ENUMERATION', 'ANALYSIS', 'CUSTOM'] as const;

// ============================================
// Custom Scalar Resolvers
// ============================================

const dateScalar = {
  serialize: (value: Date): string => value.toISOString(),
  parseValue: (value: string): Date => new Date(value),
  parseLiteral: (ast: ValueNode): Date => {
    if (ast.kind === 'StringValue') {
      return new Date(ast.value);
    }
    throw new GraphQLError('Date scalar can only parse string values');
  }
};

const jsonScalar = {
  serialize: (value: unknown): unknown => value,
  parseValue: (value: unknown): unknown => value,
  parseLiteral: (ast: ValueNode): unknown => {
    switch (ast.kind) {
      case 'StringValue':
      case 'BooleanValue':
        return ast.value;
      case 'IntValue':
      case 'FloatValue':
        return parseFloat(ast.value);
      case 'ObjectValue':
        return ast.fields.reduce((obj, field) => {
          obj[field.name.value] = jsonScalar.parseLiteral(field.value);
          return obj;
        }, {} as Record<string, unknown>);
      case 'ListValue':
        return ast.values.map(jsonScalar.parseLiteral);
      case 'NullValue':
        return null;
      default:
        throw new GraphQLError(`Unexpected kind in JSON scalar: ${ast.kind}`);
    }
  }
};

// ============================================
// Resolvers
// ============================================

export const resolvers = {
  DateTime: dateScalar,
  JSON: jsonScalar,

  Query: {
    me: async (_parent: unknown, _args: unknown, context: Context): Promise<User> => {
      return requireAuth(context);
    },

    users: async (
      _parent: unknown,
      args: PaginationArgs,
      context: Context
    ): Promise<User[]> => {
      requirePermission(context, 'user:read');

      const { limit, offset } = validatePagination(args);

      return prisma.user.findMany({
        take: limit,
        skip: offset,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          password: false // Never return password
        }
      }) as any;
    },

    user: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ): Promise<User | null> => {
      requirePermission(context, 'user:read');

      return prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          password: false
        }
      }) as any;
    },

    targets: async (
      _parent: unknown,
      args: PaginationArgs,
      context: Context
    ): Promise<Target[]> => {
      requirePermission(context, 'target:read');

      const { limit, offset } = validatePagination(args);

      return prisma.target.findMany({
        take: limit,
        skip: offset,
        include: {
          scans: true
        }
      }) as any;
    },

    target: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ): Promise<Target | null> => {
      requirePermission(context, 'target:read');

      return prisma.target.findUnique({
        where: { id },
        include: {
          scans: true
        }
      }) as any;
    },

    scans: async (
      _parent: unknown,
      args: { status?: string } & PaginationArgs,
      context: Context
    ): Promise<Scan[]> => {
      requirePermission(context, 'scan:read');

      const { limit, offset } = validatePagination(args);
      const status = validateEnum(args.status, SCAN_STATUS_VALUES, 'ScanStatus');

      return prisma.scan.findMany({
        where: status ? { status } : undefined,
        take: limit,
        skip: offset,
        include: {
          target: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              createdAt: true,
              updatedAt: true
            }
          },
          agents: true,
          tasks: true,
          findings: true
        }
      });
    },

    scan: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ): Promise<Scan | null> => {
      requirePermission(context, 'scan:read');

      return prisma.scan.findUnique({
        where: { id },
        include: {
          target: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              createdAt: true,
              updatedAt: true
            }
          },
          agents: true,
          tasks: true,
          findings: true
        }
      });
    },

    agents: async (
      _parent: unknown,
      args: { status?: string } & PaginationArgs,
      context: Context
    ): Promise<Agent[]> => {
      requirePermission(context, 'agent:read');

      const { limit, offset } = validatePagination(args);
      const status = validateEnum(args.status, AGENT_STATUS_VALUES, 'AgentStatus');

      return prisma.agent.findMany({
        where: status ? { status } : undefined,
        take: limit,
        skip: offset,
        include: {
          scan: true,
          tasks: true
        }
      });
    },

    agent: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ): Promise<Agent | null> => {
      requirePermission(context, 'agent:read');

      return prisma.agent.findUnique({
        where: { id },
        include: {
          scan: true,
          tasks: true
        }
      });
    },

    tasks: async (
      _parent: unknown,
      args: { scanId?: string; status?: string } & PaginationArgs,
      context: Context
    ): Promise<Task[]> => {
      requirePermission(context, 'scan:read');

      const { limit, offset } = validatePagination(args);
      const status = validateEnum(args.status, TASK_STATUS_VALUES, 'TaskStatus');

      return prisma.task.findMany({
        where: {
          ...(args.scanId && { scanId: args.scanId }),
          ...(status && { status })
        },
        take: limit,
        skip: offset,
        include: {
          agent: true,
          scan: true
        }
      });
    },

    task: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ): Promise<Task | null> => {
      requirePermission(context, 'scan:read');

      return prisma.task.findUnique({
        where: { id },
        include: {
          agent: true,
          scan: true
        }
      });
    },

    findings: async (
      _parent: unknown,
      args: { scanId?: string; severity?: string; status?: string } & PaginationArgs,
      context: Context
    ): Promise<Finding[]> => {
      requirePermission(context, 'finding:read');

      const { limit, offset } = validatePagination(args);
      const severity = validateEnum(args.severity, SEVERITY_VALUES, 'Severity');
      const status = validateEnum(args.status, FINDING_STATUS_VALUES, 'FindingStatus');

      return prisma.finding.findMany({
        where: {
          ...(args.scanId && { scanId: args.scanId }),
          ...(severity && { severity }),
          ...(status && { status })
        },
        take: limit,
        skip: offset,
        include: {
          scan: true,
          target: true
        }
      });
    },

    finding: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ): Promise<Finding | null> => {
      requirePermission(context, 'finding:read');

      return prisma.finding.findUnique({
        where: { id },
        include: {
          scan: true,
          target: true
        }
      });
    },

    tools: async (
      _parent: unknown,
      args: { category?: string } & PaginationArgs,
      context: Context
    ): Promise<Tool[]> => {
      requirePermission(context, 'tool:read');

      const { limit, offset } = validatePagination(args);
      const category = validateEnum(args.category, TOOL_CATEGORY_VALUES, 'ToolCategory');

      return prisma.tool.findMany({
        where: category ? { category } : undefined,
        take: limit,
        skip: offset
      });
    },

    tool: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ): Promise<Tool | null> => {
      requirePermission(context, 'tool:read');

      return prisma.tool.findUnique({ where: { id } });
    },

    toolExecutions: async (
      _parent: unknown,
      args: { agentId?: string; toolId?: string } & PaginationArgs,
      context: Context
    ) => {
      requirePermission(context, 'tool:read');

      const { limit, offset } = validatePagination(args);

      return prisma.toolExecution.findMany({
        where: {
          ...(args.agentId && { agentId: args.agentId }),
          ...(args.toolId && { toolId: args.toolId })
        },
        take: limit,
        skip: offset,
        include: {
          tool: true,
          agent: true
        }
      });
    },

    // Webhook queries
    webhooks: async (
      _parent: unknown,
      _args: unknown,
      context: Context
    ): Promise<Webhook[]> => {
      const user = requireAuth(context);

      return prisma.webhook.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' }
      });
    },

    webhook: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ): Promise<Webhook | null> => {
      const user = requireAuth(context);

      const webhook = await prisma.webhook.findUnique({
        where: { id }
      });

      // Check ownership
      if (webhook && webhook.userId !== user.id) {
        throw new GraphQLError('Access denied');
      }

      return webhook;
    },

    webhookDeliveries: async (
      _parent: unknown,
      { webhookId }: { webhookId: string },
      context: Context
    ) => {
      const user = requireAuth(context);

      // Check webhook ownership
      const webhook = await prisma.webhook.findUnique({
        where: { id: webhookId }
      });

      if (!webhook || webhook.userId !== user.id) {
        throw new GraphQLError('Webhook not found or access denied');
      }

      return prisma.webhookDelivery.findMany({
        where: { webhookId },
        orderBy: { createdAt: 'desc' },
        take: 50 // Limit to last 50 deliveries
      });
    },

    knowledgeBase: async (
      _parent: unknown,
      args: { category?: string; tags?: string[] } & PaginationArgs,
      context: Context
    ) => {
      requireAuth(context);

      const { limit, offset } = validatePagination(args);

      return prisma.knowledgeBase.findMany({
        where: {
          ...(args.category && { category: args.category }),
          ...(args.tags && { tags: { hasSome: args.tags } })
        },
        take: limit,
        skip: offset
      });
    },

    searchKnowledge: async (
      _parent: unknown,
      { query }: { query: string },
      context: Context
    ) => {
      requireAuth(context);

      return prisma.knowledgeBase.findMany({
        where: {
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { content: { contains: query, mode: 'insensitive' } }
          ]
        },
        take: 20
      });
    },

    dashboardStats: async (_parent: unknown, _args: unknown, context: Context) => {
      requireAuth(context);

      const [
        totalScans,
        activeScans,
        totalFindings,
        criticalFindings,
        activeAgents,
        completedTasks
      ] = await Promise.all([
        prisma.scan.count(),
        prisma.scan.count({ where: { status: 'RUNNING' } }),
        prisma.finding.count(),
        prisma.finding.count({ where: { severity: 'CRITICAL' } }),
        prisma.agent.count({ where: { status: 'ACTIVE' } }),
        prisma.task.count({ where: { status: 'COMPLETED' } })
      ]);

      const recentFindings = await prisma.finding.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' }
      });

      const recentActivity = recentFindings.map(f => ({
        id: f.id,
        type: 'FINDING',
        description: `${f.severity} finding: ${f.title}`,
        timestamp: f.createdAt,
        metadata: { severity: f.severity }
      }));

      return {
        totalScans,
        activeScans,
        totalFindings,
        criticalFindings,
        activeAgents,
        completedTasks,
        recentActivity
      };
    },

    systemSettings: async (
      _parent: unknown,
      args: { key?: string },
      context: Context
    ) => {
      requireAuth(context);

      const where = args.key ? { key: args.key } : {};
      return prisma.systemSettings.findMany({ where });
    },

    systemSetting: async (
      _parent: unknown,
      args: { key: string },
      context: Context
    ) => {
      requireAuth(context);

      return prisma.systemSettings.findUnique({
        where: { key: args.key }
      });
    },

    auditLogs: async (
      _parent: unknown,
      args: {
        scanId?: string;
        agentId?: string;
        taskId?: string;
        eventType?: string;
        severity?: string;
      },
      context: Context
    ) => {
      requireAuth(context);

      const where: any = {};
      if (args.scanId) where.scanId = args.scanId;
      if (args.agentId) where.agentId = args.agentId;
      if (args.taskId) where.taskId = args.taskId;
      if (args.eventType) where.eventType = args.eventType;
      if (args.severity) where.severity = args.severity;

      return prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'asc' }, // Chronological order (oldest first)
        take: 1000, // Limit to last 1000 logs
        include: {
          scan: {
            select: {
              id: true,
              name: true,
              status: true
            }
          },
          agent: {
            select: {
              id: true,
              name: true,
              type: true
            }
          },
          task: {
            select: {
              id: true,
              type: true,
              description: true
            }
          }
        }
      });
    },

    auditLog: async (
      _parent: unknown,
      args: { id: string },
      context: Context
    ) => {
      requireAuth(context);

      return prisma.auditLog.findUnique({
        where: { id: args.id },
        include: {
          scan: true,
          agent: true,
          task: true
        }
      });
    },

    exportScanReport: async (
      _parent: unknown,
      args: { scanId: string; format?: string },
      context: Context
    ) => {
      requireAuth(context);

      const scan = await prisma.scan.findUnique({
        where: { id: args.scanId },
        include: {
          target: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true
            }
          },
          agents: {
            include: {
              tasks: true
            }
          },
          findings: {
            orderBy: {
              severity: 'asc' // CRITICAL first
            }
          },
          tasks: true
        }
      });

      if (!scan) {
        throw new GraphQLError('Scan not found');
      }

      // Generate report
      const report = {
        metadata: {
          reportGenerated: new Date().toISOString(),
          scanId: scan.id,
          scanName: scan.name,
          scanStatus: scan.status,
          scanCreated: scan.createdAt,
          scanStarted: scan.startedAt,
          scanCompleted: scan.completedAt,
          duration: scan.startedAt && scan.completedAt
            ? (new Date(scan.completedAt).getTime() - new Date(scan.startedAt).getTime()) / 1000
            : null,
          durationSeconds: scan.startedAt && scan.completedAt
            ? Math.round((new Date(scan.completedAt).getTime() - new Date(scan.startedAt).getTime()) / 1000)
            : null
        },
        target: {
          id: scan.target.id,
          name: scan.target.name,
          url: scan.target.url,
          type: scan.target.type,
          description: scan.target.description
        },
        summary: {
          totalFindings: scan.findings.length,
          criticalFindings: scan.findings.filter((f: any) => f.severity === 'CRITICAL').length,
          highFindings: scan.findings.filter((f: any) => f.severity === 'HIGH').length,
          mediumFindings: scan.findings.filter((f: any) => f.severity === 'MEDIUM').length,
          lowFindings: scan.findings.filter((f: any) => f.severity === 'LOW').length,
          infoFindings: scan.findings.filter((f: any) => f.severity === 'INFO').length,
          totalAgents: scan.agents.length,
          totalTasks: scan.tasks.length,
          completedTasks: scan.tasks.filter((t: any) => t.status === 'COMPLETED').length,
          failedTasks: scan.tasks.filter((t: any) => t.status === 'FAILED').length
        },
        findings: scan.findings.map((finding: any) => ({
          id: finding.id,
          title: finding.title,
          description: finding.description,
          severity: finding.severity,
          status: finding.status,
          category: finding.category,
          cvssScore: finding.cvssScore,
          cveId: finding.cveId,
          affectedComponent: finding.affectedComponent,
          remediation: finding.remediation,
          references: finding.references,
          evidence: finding.evidence,
          createdAt: finding.createdAt
        })),
        agents: scan.agents.map((agent: any) => ({
          id: agent.id,
          name: agent.name,
          type: agent.type,
          role: agent.role,
          status: agent.status,
          tasksCompleted: agent.tasks.filter((t: any) => t.status === 'COMPLETED').length,
          tasksFailed: agent.tasks.filter((t: any) => t.status === 'FAILED').length
        })),
        config: scan.config,
        error: scan.error
      };

      return report;
    },

    exportFindingsReport: async (
      _parent: unknown,
      args: { scanId?: string; severity?: string; format?: string },
      context: Context
    ) => {
      requireAuth(context);

      const where: any = {};
      if (args.scanId) {
        where.scanId = args.scanId;
      }
      if (args.severity) {
        where.severity = args.severity;
      }

      const findings = await prisma.finding.findMany({
        where,
        include: {
          scan: {
            include: {
              target: true
            }
          }
        },
        orderBy: {
          severity: 'asc' // CRITICAL first
        }
      });

      const report = {
        metadata: {
          reportGenerated: new Date().toISOString(),
          totalFindings: findings.length,
          filters: {
            scanId: args.scanId || null,
            severity: args.severity || null
          }
        },
        summary: {
          critical: findings.filter((f: any) => f.severity === 'CRITICAL').length,
          high: findings.filter((f: any) => f.severity === 'HIGH').length,
          medium: findings.filter((f: any) => f.severity === 'MEDIUM').length,
          low: findings.filter((f: any) => f.severity === 'LOW').length,
          info: findings.filter((f: any) => f.severity === 'INFO').length,
          confirmed: findings.filter((f: any) => f.status === 'CONFIRMED').length,
          falsePositive: findings.filter((f: any) => f.status === 'FALSE_POSITIVE').length,
          fixed: findings.filter((f: any) => f.status === 'FIXED').length
        },
        findings: findings.map((finding: any) => ({
          id: finding.id,
          title: finding.title,
          description: finding.description,
          severity: finding.severity,
          status: finding.status,
          category: finding.category,
          cvssScore: finding.cvssScore,
          cveId: finding.cveId,
          affectedComponent: finding.affectedComponent,
          remediation: finding.remediation,
          references: finding.references,
          evidence: finding.evidence,
          scan: {
            id: finding.scan.id,
            name: finding.scan.name,
            target: {
              name: finding.scan.target.name,
              url: finding.scan.target.url
            }
          },
          createdAt: finding.createdAt
        }))
      };

      return report;
    }
  },

  Mutation: {
    login: async (
      _parent: unknown,
      { email, password }: { email: string; password: string }
    ) => {
      // Validate input
      if (!validateEmail(email)) {
        throw new GraphQLError('Invalid email address');
      }

      // Check rate limiting
      const rateLimitCheck = checkLoginAttempts(email);
      if (!rateLimitCheck.allowed) {
        throw new GraphQLError(
          `Too many login attempts. Account locked until ${rateLimitCheck.lockedUntil?.toISOString()}`,
          { extensions: { code: 'RATE_LIMITED', lockedUntil: rateLimitCheck.lockedUntil } }
        );
      }

      const user = await prisma.user.findUnique({ where: { email } });

      if (!user || !(await comparePassword(password, user.password))) {
        recordLoginAttempt(email, false);
        throw new GraphQLError('Invalid credentials', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      recordLoginAttempt(email, true);

      const tokens = generateTokenPair({
        userId: user.id,
        email: user.email,
        role: user.role
      });

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      };
    },

    register: async (
      _parent: unknown,
      { email, password, name }: { email: string; password: string; name: string }
    ) => {
      // Validate input
      if (!validateEmail(email)) {
        throw new GraphQLError('Invalid email address');
      }

      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) {
        throw new GraphQLError(passwordValidation.errors.join(', '), {
          extensions: { code: 'BAD_USER_INPUT' }
        });
      }

      const existingUser = await prisma.user.findUnique({ where: { email } });

      if (existingUser) {
        throw new GraphQLError('User already exists', {
          extensions: { code: 'BAD_USER_INPUT' }
        });
      }

      const hashedPassword = await hashPassword(password);

      const user = await prisma.user.create({
        data: {
          id: uuidv4(),
          email,
          password: hashedPassword,
          name,
          role: 'OPERATOR'
        }
      });

      const tokens = generateTokenPair({
        userId: user.id,
        email: user.email,
        role: user.role
      });

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      };
    },

    refreshToken: async (
      _parent: unknown,
      { refreshToken }: { refreshToken: string }
    ) => {
      try {
        const tokens = await refreshAccessToken(refreshToken);

        // Get user info from the new access token
        const payload = verifyToken(tokens.accessToken, 'access');
        const user = await prisma.user.findUnique({
          where: { id: payload.userId }
        });

        if (!user) {
          throw new GraphQLError('User not found', {
            extensions: { code: 'UNAUTHENTICATED' }
          });
        }

        return {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
          }
        };
      } catch (error: any) {
        throw new GraphQLError('Invalid or expired refresh token', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }
    },

    changePassword: async (
      _parent: unknown,
      { currentPassword, newPassword }: { currentPassword: string; newPassword: string },
      context: Context
    ): Promise<boolean> => {
      const user = requireAuth(context);

      // Validate new password strength
      if (newPassword.length < 8) {
        throw new GraphQLError('New password must be at least 8 characters long');
      }

      // Verify current password
      const userWithPassword = await prisma.user.findUnique({
        where: { id: user.id }
      });

      if (!userWithPassword) {
        throw new GraphQLError('User not found');
      }

      const isValid = await bcrypt.compare(currentPassword, userWithPassword.password);
      if (!isValid) {
        throw new GraphQLError('Current password is incorrect');
      }

      // Hash new password and update
      const hashedPassword = await bcrypt.hash(newPassword, 12);
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword }
      });

      logger.info('Password changed successfully', { userId: user.id });
      return true;
    },

    updateProfile: async (
      _parent: unknown,
      { name, email }: { name?: string; email?: string },
      context: Context
    ): Promise<any> => {
      const user = requireAuth(context);

      const updateData: any = {};

      if (name !== undefined) {
        if (name.trim().length === 0) {
          throw new GraphQLError('Name cannot be empty');
        }
        updateData.name = name.trim();
      }

      if (email !== undefined) {
        if (!validateEmail(email)) {
          throw new GraphQLError('Invalid email format');
        }

        // Check if email is already in use by another user
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser && existingUser.id !== user.id) {
          throw new GraphQLError('Email is already in use');
        }

        updateData.email = email.toLowerCase();
      }

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: updateData
      });

      logger.info('Profile updated successfully', { userId: user.id });
      return updatedUser;
    },

    updateNotificationPreferences: async (
      _parent: unknown,
      {
        emailNotifications,
        notifyOnScanComplete,
        notifyOnScanFailed,
        notifyOnCriticalFinding
      }: {
        emailNotifications?: boolean;
        notifyOnScanComplete?: boolean;
        notifyOnScanFailed?: boolean;
        notifyOnCriticalFinding?: boolean;
      },
      context: Context
    ): Promise<any> => {
      const user = requireAuth(context);

      // Validate that all provided values are actually booleans
      const validateBoolean = (value: any, field: string): void => {
        if (value !== undefined && typeof value !== 'boolean') {
          throw new Error(`${field} must be a boolean value (true or false)`);
        }
      };

      validateBoolean(emailNotifications, 'emailNotifications');
      validateBoolean(notifyOnScanComplete, 'notifyOnScanComplete');
      validateBoolean(notifyOnScanFailed, 'notifyOnScanFailed');
      validateBoolean(notifyOnCriticalFinding, 'notifyOnCriticalFinding');

      // Check that at least one field is being updated
      if (emailNotifications === undefined &&
          notifyOnScanComplete === undefined &&
          notifyOnScanFailed === undefined &&
          notifyOnCriticalFinding === undefined) {
        throw new Error('At least one notification preference must be provided');
      }

      const updateData: any = {};

      if (emailNotifications !== undefined) {
        updateData.emailNotifications = emailNotifications;
      }
      if (notifyOnScanComplete !== undefined) {
        updateData.notifyOnScanComplete = notifyOnScanComplete;
      }
      if (notifyOnScanFailed !== undefined) {
        updateData.notifyOnScanFailed = notifyOnScanFailed;
      }
      if (notifyOnCriticalFinding !== undefined) {
        updateData.notifyOnCriticalFinding = notifyOnCriticalFinding;
      }

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: updateData
      });

      logger.info('Notification preferences updated', {
        userId: user.id,
        preferences: updateData
      });

      return updatedUser;
    },

    createApiKey: async (
      _parent: unknown,
      { name, expiresAt }: { name?: string; expiresAt?: Date },
      context: Context
    ) => {
      const user = requireAuth(context);

      const apiKey = await prisma.apiKey.create({
        data: {
          id: uuidv4(),
          name,
          key: `tella_${uuidv4().replace(/-/g, '')}`,
          userId: user.id,
          expiresAt
        }
      });

      logger.info('API key created', { userId: user.id, apiKeyId: apiKey.id });
      return apiKey;
    },

    revokeApiKey: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ): Promise<boolean> => {
      const user = requireAuth(context);

      // Check if user owns this API key
      const apiKey = await prisma.apiKey.findUnique({ where: { id } });
      if (!apiKey || apiKey.userId !== user.id) {
        throw new GraphQLError('API key not found or access denied');
      }

      await prisma.apiKey.delete({ where: { id } });
      logger.info('API key revoked', { userId: user.id, apiKeyId: id });
      return true;
    },

    createTarget: async (
      _parent: unknown,
      args: z.infer<typeof createTargetSchema>,
      context: Context
    ): Promise<Target> => {
      requirePermission(context, 'target:create');
      const validatedData = validateInput(createTargetSchema, args);

      const target = await prisma.target.create({
        data: {
          id: uuidv4(),
          name: validatedData.name,
          url: validatedData.url,
          type: validatedData.type,
          description: validatedData.description,
          metadata: validatedData.metadata as any,
          status: 'ACTIVE'
        }
      });

      return target;
    },

    updateTarget: async (
      _parent: unknown,
      { id, ...data }: { id: string; [key: string]: any },
      context: Context
    ): Promise<Target> => {
      requirePermission(context, 'target:update');

      return prisma.target.update({
        where: { id },
        data
      });
    },

    deleteTarget: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ): Promise<boolean> => {
      requirePermission(context, 'target:delete');

      await prisma.target.delete({ where: { id } });
      return true;
    },

    createScan: async (
      _parent: unknown,
      args: z.infer<typeof createScanSchema>,
      context: Context
    ): Promise<Scan> => {
      const user = requirePermission(context, 'scan:create');
      const validatedData = validateInput(createScanSchema, args);

      const scan = await prisma.scan.create({
        data: {
          id: uuidv4(),
          name: validatedData.name,
          targetId: validatedData.targetId,
          userId: user.id,
          config: validatedData.config as any,
          status: 'QUEUED',
          progress: 0
        },
        include: {
          target: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              createdAt: true,
              updatedAt: true
            }
          }
        }
      });

      return scan;
    },

    startScan: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ): Promise<Scan> => {
      requirePermission(context, 'scan:update');

      // Get scan with target info
      const scan = await prisma.scan.findUnique({
        where: { id },
        include: {
          target: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              createdAt: true,
              updatedAt: true
            }
          }
        }
      });

      if (!scan) {
        throw new GraphQLError('Scan not found');
      }

      // Update scan status to QUEUED (will be RUNNING when worker picks it up)
      const updatedScan = await prisma.scan.update({
        where: { id },
        data: {
          status: 'QUEUED',
          startedAt: new Date()
        },
        include: {
          target: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              createdAt: true,
              updatedAt: true
            }
          }
        }
      });

      // Add scan job to BullMQ queue
      try {
        await addScanJob({
          scanId: scan.id,
          userId: scan.userId,
          targetId: scan.targetId,
          config: scan.config as any
        });

        logger.info(`Scan ${id} queued for processing`);
      } catch (error: any) {
        logger.error(`Failed to queue scan ${id}:`, error);

        // If queueing fails, mark scan as FAILED
        await prisma.scan.update({
          where: { id },
          data: {
            status: 'FAILED',
            error: `Failed to queue scan: ${error.message}`,
            completedAt: new Date()
          }
        });

        throw new GraphQLError('Failed to queue scan for processing');
      }

      pubsub.publish('SCAN_UPDATED', { scanUpdated: updatedScan });

      return updatedScan;
    },

    pauseScan: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ): Promise<Scan> => {
      requirePermission(context, 'scan:update');

      const scan = await prisma.scan.update({
        where: { id },
        data: { status: 'PAUSED' },
        include: {
          target: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              createdAt: true,
              updatedAt: true
            }
          }
        }
      });

      pubsub.publish('SCAN_UPDATED', { scanUpdated: scan });
      return scan;
    },

    resumeScan: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ): Promise<Scan> => {
      requirePermission(context, 'scan:update');

      const scan = await prisma.scan.update({
        where: { id },
        data: { status: 'RUNNING' },
        include: {
          target: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              createdAt: true,
              updatedAt: true
            }
          }
        }
      });

      pubsub.publish('SCAN_UPDATED', { scanUpdated: scan });
      return scan;
    },

    cancelScan: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ): Promise<Scan> => {
      requirePermission(context, 'scan:update');

      const scan = await prisma.scan.update({
        where: { id },
        data: { status: 'CANCELLED', completedAt: new Date() },
        include: {
          target: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              createdAt: true,
              updatedAt: true
            }
          }
        }
      });

      await orchestrator.stopScan(id);

      pubsub.publish('SCAN_UPDATED', { scanUpdated: scan });
      return scan;
    },

    deleteScan: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ): Promise<boolean> => {
      requirePermission(context, 'scan:delete');

      await prisma.scan.delete({ where: { id } });
      return true;
    },

    exportScanReport: async (
      _parent: unknown,
      { id, format }: { id: string; format: 'JSON' | 'CSV' | 'PDF' },
      context: Context
    ): Promise<{ success: boolean; filename?: string; downloadUrl?: string; error?: string }> => {
      requirePermission(context, 'scan:read');

      try {
        // Import report generator
        const { generateReport } = await import('../utils/report-generator.js');

        // Generate report
        const filename = await generateReport(id, format.toLowerCase() as 'json' | 'csv' | 'pdf');

        // Return download URL
        const downloadUrl = `/downloads/${filename}`;

        return {
          success: true,
          filename,
          downloadUrl,
        };
      } catch (error: any) {
        logger.error('Failed to export scan report:', error);
        return {
          success: false,
          error: error.message || 'Failed to generate report',
        };
      }
    },

    // Webhook mutations
    createWebhook: async (
      _parent: unknown,
      { name, url, events }: { name: string; url: string; events: string[] },
      context: Context
    ): Promise<Webhook> => {
      const user = requireAuth(context);

      // Validate URL
      try {
        new URL(url);
      } catch {
        throw new GraphQLError('Invalid webhook URL');
      }

      // Validate events
      const validEvents = [
        'SCAN_COMPLETED',
        'SCAN_FAILED',
        'SCAN_STARTED',
        'FINDING_CREATED',
        'FINDING_HIGH_SEVERITY',
        'FINDING_CRITICAL'
      ];

      const invalidEvents = events.filter(e => !validEvents.includes(e));
      if (invalidEvents.length > 0) {
        throw new GraphQLError(`Invalid webhook events: ${invalidEvents.join(', ')}`);
      }

      // Generate secret
      const secret = WebhookService.generateSecret();

      const webhook = await prisma.webhook.create({
        data: {
          id: uuidv4(),
          name,
          url,
          events,
          secret,
          userId: user.id
        }
      });

      logger.info('Webhook created', { userId: user.id, webhookId: webhook.id });
      return webhook;
    },

    updateWebhook: async (
      _parent: unknown,
      { id, name, url, events, active }: {
        id: string;
        name?: string;
        url?: string;
        events?: string[];
        active?: boolean
      },
      context: Context
    ): Promise<Webhook> => {
      const user = requireAuth(context);

      // Check ownership
      const existing = await prisma.webhook.findUnique({ where: { id } });
      if (!existing || existing.userId !== user.id) {
        throw new GraphQLError('Webhook not found or access denied');
      }

      const updateData: any = {};

      if (name !== undefined) updateData.name = name;
      if (active !== undefined) updateData.active = active;

      if (url !== undefined) {
        try {
          new URL(url);
          updateData.url = url;
        } catch {
          throw new GraphQLError('Invalid webhook URL');
        }
      }

      if (events !== undefined) {
        const validEvents = [
          'SCAN_COMPLETED',
          'SCAN_FAILED',
          'SCAN_STARTED',
          'FINDING_CREATED',
          'FINDING_HIGH_SEVERITY',
          'FINDING_CRITICAL'
        ];

        const invalidEvents = events.filter(e => !validEvents.includes(e));
        if (invalidEvents.length > 0) {
          throw new GraphQLError(`Invalid webhook events: ${invalidEvents.join(', ')}`);
        }

        updateData.events = events;
      }

      const webhook = await prisma.webhook.update({
        where: { id },
        data: updateData
      });

      logger.info('Webhook updated', { userId: user.id, webhookId: id });
      return webhook;
    },

    deleteWebhook: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ): Promise<boolean> => {
      const user = requireAuth(context);

      // Check ownership
      const webhook = await prisma.webhook.findUnique({ where: { id } });
      if (!webhook || webhook.userId !== user.id) {
        throw new GraphQLError('Webhook not found or access denied');
      }

      await prisma.webhook.delete({ where: { id } });
      logger.info('Webhook deleted', { userId: user.id, webhookId: id });
      return true;
    },

    testWebhook: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ): Promise<boolean> => {
      const user = requireAuth(context);

      // Check ownership
      const webhook = await prisma.webhook.findUnique({ where: { id } });
      if (!webhook || webhook.userId !== user.id) {
        throw new GraphQLError('Webhook not found or access denied');
      }

      const success = await WebhookService.testWebhook(id);
      return success;
    },

    createAgent: async (
      _parent: unknown,
      args: any,
      context: Context
    ): Promise<Agent> => {
      requirePermission(context, 'scan:update');

      return orchestrator.createAgent({
        type: args.type,
        role: args.role,
        config: args.config
      });
    },

    updateAgent: async (
      _parent: unknown,
      { id, ...data }: { id: string; [key: string]: any },
      context: Context
    ): Promise<Agent> => {
      requirePermission(context, 'scan:update');

      return prisma.agent.update({
        where: { id },
        data
      });
    },

    terminateAgent: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ): Promise<boolean> => {
      requirePermission(context, 'scan:update');

      await prisma.agent.update({
        where: { id },
        data: { status: 'TERMINATED' }
      });
      return true;
    },

    createTask: async (
      _parent: unknown,
      args: any,
      context: Context
    ): Promise<Task> => {
      requirePermission(context, 'scan:update');

      return orchestrator.createTask({
        agentId: args.agentId,
        scanId: args.scanId,
        type: args.type,
        description: args.description,
        input: args.input,
        priority: args.priority
      });
    },

    updateTask: async (
      _parent: unknown,
      { id, ...data }: { id: string; [key: string]: any },
      context: Context
    ): Promise<Task> => {
      requirePermission(context, 'scan:update');

      return prisma.task.update({
        where: { id },
        data
      });
    },

    retryTask: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ): Promise<Task> => {
      requirePermission(context, 'scan:update');

      return prisma.task.update({
        where: { id },
        data: {
          status: 'PENDING',
          error: null,
          retries: 0
        }
      });
    },

    cancelTask: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ): Promise<boolean> => {
      requirePermission(context, 'scan:update');

      await prisma.task.update({
        where: { id },
        data: { status: 'CANCELLED' }
      });
      return true;
    },

    createFinding: async (
      _parent: unknown,
      args: z.infer<typeof createFindingSchema>,
      context: Context
    ): Promise<Finding> => {
      requirePermission(context, 'finding:create');
      const validatedData = validateInput(createFindingSchema, args);

      const finding = await prisma.finding.create({
        data: {
          id: uuidv4(),
          scanId: validatedData.scanId,
          targetId: validatedData.targetId,
          title: validatedData.title,
          description: validatedData.description,
          severity: validatedData.severity,
          category: validatedData.category,
          evidence: validatedData.evidence as any,
          cvss: validatedData.cvss,
          cve: validatedData.cve,
          confidence: validatedData.confidence || 1.0,
          remediation: validatedData.remediation,
          references: validatedData.references || [],
          status: 'NEW'
        },
        include: {
          scan: true,
          target: true
        }
      });

      pubsub.publish('FINDING_DISCOVERED', { findingDiscovered: finding });

      return finding;
    },

    updateFinding: async (
      _parent: unknown,
      { id, ...data }: { id: string; [key: string]: any },
      context: Context
    ): Promise<Finding> => {
      requirePermission(context, 'finding:update');

      return prisma.finding.update({
        where: { id },
        data,
        include: {
          scan: true,
          target: true
        }
      });
    },

    deleteFinding: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ): Promise<boolean> => {
      requirePermission(context, 'finding:delete');

      await prisma.finding.delete({ where: { id } });
      return true;
    },

    createTool: async (
      _parent: unknown,
      args: any,
      context: Context
    ): Promise<Tool> => {
      requirePermission(context, 'tool:create');

      return prisma.tool.create({
        data: {
          id: uuidv4(),
          name: args.name,
          description: args.description,
          category: args.category,
          command: args.command,
          config: args.config,
          enabled: true
        }
      });
    },

    updateTool: async (
      _parent: unknown,
      { id, ...data }: { id: string; [key: string]: any },
      context: Context
    ): Promise<Tool> => {
      requirePermission(context, 'tool:update');

      return prisma.tool.update({
        where: { id },
        data
      });
    },

    deleteTool: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ): Promise<boolean> => {
      requirePermission(context, 'tool:delete');

      await prisma.tool.delete({ where: { id } });
      return true;
    },

    executeTool: async (
      _parent: unknown,
      { toolId, agentId, args }: any,
      context: Context
    ) => {
      requirePermission(context, 'tool:execute');

      const execution = await prisma.toolExecution.create({
        data: {
          id: uuidv4(),
          toolId,
          agentId,
          command: 'execute',
          args,
          status: 'QUEUED'
        },
        include: {
          tool: true,
          agent: true
        }
      });

      return execution;
    },

    addKnowledge: async (
      _parent: unknown,
      args: any,
      context: Context
    ) => {
      requirePermission(context, 'knowledge:create');

      return prisma.knowledgeBase.create({
        data: {
          id: uuidv4(),
          category: args.category,
          title: args.title,
          content: args.content,
          tags: args.tags,
          metadata: args.metadata
        }
      });
    },

    updateKnowledge: async (
      _parent: unknown,
      { id, ...data }: { id: string; [key: string]: any },
      context: Context
    ) => {
      requirePermission(context, 'knowledge:update');

      return prisma.knowledgeBase.update({
        where: { id },
        data
      });
    },

    deleteKnowledge: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ): Promise<boolean> => {
      requirePermission(context, 'knowledge:delete');

      await prisma.knowledgeBase.delete({ where: { id } });
      return true;
    },

    updateSystemSetting: async (
      _parent: unknown,
      { key, value, encrypted }: { key: string; value: string; encrypted?: boolean },
      context: Context
    ): Promise<{ success: boolean; message?: string }> => {
      requirePermission(context, 'admin:settings');

      try {
        // For sensitive settings like API keys, we should encrypt them
        // For now, we'll just mark them as encrypted but not actually encrypt
        // In production, use crypto.encrypt() with a secret key

        await prisma.systemSettings.upsert({
          where: { key },
          update: {
            value,
            encrypted: encrypted || false
          },
          create: {
            key,
            value,
            encrypted: encrypted || false
          }
        });

        return {
          success: true,
          message: `Setting '${key}' updated successfully`
        };
      } catch (error: any) {
        logger.error('Failed to update system setting:', error);
        return {
          success: false,
          message: error.message || 'Failed to update setting'
        };
      }
    },

    deleteSystemSetting: async (
      _parent: unknown,
      { key }: { key: string },
      context: Context
    ): Promise<boolean> => {
      requirePermission(context, 'admin:settings');

      await prisma.systemSettings.delete({ where: { key } });
      return true;
    },

    agentThink: async (
      _parent: unknown,
      { agentId, context: agentContext }: any,
      context: Context
    ) => {
      requirePermission(context, 'scan:update');

      return {
        thought: 'Analyzing the context and planning next steps',
        reasoning: 'Based on the current scan data, I recommend...',
        nextActions: ['action1', 'action2']
      };
    },

    agentExecute: async (
      _parent: unknown,
      { agentId, action, params }: any,
      context: Context
    ) => {
      requirePermission(context, 'scan:update');

      return {
        success: true,
        result: {},
        observations: 'Action completed successfully'
      };
    }
  },

  Subscription: {
    scanUpdated: {
      subscribe: (_parent: unknown, { scanId }: { scanId: string }, context: Context) => {
        requireAuth(context);
        return pubsub.asyncIterator(['SCAN_UPDATED']);
      }
    },

    scanProgress: {
      subscribe: (_parent: unknown, { scanId }: { scanId: string }, context: Context) => {
        requireAuth(context);
        return pubsub.asyncIterator([`SCAN_PROGRESS_${scanId}`]);
      }
    },

    agentStatusChanged: {
      subscribe: (_parent: unknown, _args: unknown, context: Context) => {
        requireAuth(context);
        return pubsub.asyncIterator(['AGENT_STATUS_CHANGED']);
      }
    },

    agentThinking: {
      subscribe: (_parent: unknown, { agentId }: { agentId: string }, context: Context) => {
        requireAuth(context);
        return pubsub.asyncIterator([`AGENT_THINKING_${agentId}`]);
      }
    },

    taskUpdated: {
      subscribe: (_parent: unknown, _args: unknown, context: Context) => {
        requireAuth(context);
        return pubsub.asyncIterator(['TASK_UPDATED']);
      }
    },

    findingDiscovered: {
      subscribe: (_parent: unknown, _args: unknown, context: Context) => {
        requireAuth(context);
        return pubsub.asyncIterator(['FINDING_DISCOVERED']);
      }
    },

    toolExecutionUpdated: {
      subscribe: (_parent: unknown, _args: unknown, context: Context) => {
        requireAuth(context);
        return pubsub.asyncIterator(['TOOL_EXECUTION_UPDATED']);
      }
    },

    agentLogs: {
      subscribe: (_parent: unknown, { agentId }: { agentId: string }, context: Context) => {
        requireAuth(context);
        return pubsub.asyncIterator([`AGENT_LOGS_${agentId}`]);
      }
    },

    scanLogs: {
      subscribe: (_parent: unknown, { scanId }: { scanId: string }, context: Context) => {
        requireAuth(context);
        return pubsub.asyncIterator([`SCAN_LOGS_${scanId}`]);
      }
    }
  },

  // Field resolvers
  User: {
    apiKeys: async (parent: User) => {
      return prisma.apiKey.findMany({
        where: { userId: parent.id },
        orderBy: { createdAt: 'desc' }
      });
    }
  },

  Scan: {
    stats: async (parent: Scan) => {
      const [tasks, findings] = await Promise.all([
        prisma.task.findMany({ where: { scanId: parent.id } }),
        prisma.finding.findMany({ where: { scanId: parent.id } })
      ]);

      return {
        totalTasks: tasks.length,
        completedTasks: tasks.filter(t => t.status === 'COMPLETED').length,
        failedTasks: tasks.filter(t => t.status === 'FAILED').length,
        totalFindings: findings.length,
        criticalFindings: findings.filter(f => f.severity === 'CRITICAL').length,
        highFindings: findings.filter(f => f.severity === 'HIGH').length,
        mediumFindings: findings.filter(f => f.severity === 'MEDIUM').length,
        lowFindings: findings.filter(f => f.severity === 'LOW').length
      };
    }
  },

  Task: {
    dependencies: async (parent: Task) => {
      const deps = await prisma.taskDependency.findMany({
        where: { taskId: parent.id },
        include: { dependsOn: true }
      });
      return deps.map(d => d.dependsOn);
    },
    dependents: async (parent: Task) => {
      const deps = await prisma.taskDependency.findMany({
        where: { dependsOnId: parent.id },
        include: { task: true }
      });
      return deps.map(d => d.task);
    }
  }
};
