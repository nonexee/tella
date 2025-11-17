/**
 * GraphQL Resolvers
 */

import { PrismaClient } from '@prisma/client';
import { GraphQLError } from 'graphql';
import { v4 as uuidv4 } from 'uuid';
import { hashPassword, comparePassword, generateToken, verifyToken } from '../utils/auth.js';
import { AgentOrchestrator } from '../ai/agent-orchestrator.js';
import { PubSub } from 'graphql-subscriptions';

const prisma = new PrismaClient();
const pubsub = new PubSub();
const orchestrator = new AgentOrchestrator();

// Custom scalar resolvers
const dateScalar = {
  serialize: (value: Date) => value.toISOString(),
  parseValue: (value: string) => new Date(value),
  parseLiteral: (ast: any) => new Date(ast.value)
};

const jsonScalar = {
  serialize: (value: any) => value,
  parseValue: (value: any) => value,
  parseLiteral: (ast: any) => ast.value
};

export const resolvers = {
  DateTime: dateScalar,
  JSON: jsonScalar,

  Query: {
    me: async (_: any, __: any, context: any) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }
      return context.user;
    },

    users: async () => {
      return prisma.user.findMany();
    },

    user: async (_: any, { id }: { id: string }) => {
      return prisma.user.findUnique({ where: { id } });
    },

    targets: async () => {
      return prisma.target.findMany();
    },

    target: async (_: any, { id }: { id: string }) => {
      return prisma.target.findUnique({ where: { id } });
    },

    scans: async (_: any, { status }: { status?: string }) => {
      return prisma.scan.findMany({
        where: status ? { status: status as any } : undefined,
        include: {
          target: true,
          user: true,
          agents: true,
          tasks: true,
          findings: true
        }
      });
    },

    scan: async (_: any, { id }: { id: string }) => {
      return prisma.scan.findUnique({
        where: { id },
        include: {
          target: true,
          user: true,
          agents: true,
          tasks: true,
          findings: true
        }
      });
    },

    agents: async (_: any, { status }: { status?: string }) => {
      return prisma.agent.findMany({
        where: status ? { status: status as any } : undefined,
        include: {
          scan: true,
          tasks: true
        }
      });
    },

    agent: async (_: any, { id }: { id: string }) => {
      return prisma.agent.findUnique({
        where: { id },
        include: {
          scan: true,
          tasks: true
        }
      });
    },

    tasks: async (_: any, { scanId, status }: { scanId?: string; status?: string }) => {
      return prisma.task.findMany({
        where: {
          ...(scanId && { scanId }),
          ...(status && { status: status as any })
        },
        include: {
          agent: true,
          scan: true
        }
      });
    },

    task: async (_: any, { id }: { id: string }) => {
      return prisma.task.findUnique({
        where: { id },
        include: {
          agent: true,
          scan: true
        }
      });
    },

    findings: async (_: any, { scanId, severity, status }: any) => {
      return prisma.finding.findMany({
        where: {
          ...(scanId && { scanId }),
          ...(severity && { severity }),
          ...(status && { status })
        },
        include: {
          scan: true,
          target: true
        }
      });
    },

    finding: async (_: any, { id }: { id: string }) => {
      return prisma.finding.findUnique({
        where: { id },
        include: {
          scan: true,
          target: true
        }
      });
    },

    tools: async (_: any, { category }: { category?: string }) => {
      return prisma.tool.findMany({
        where: category ? { category: category as any } : undefined
      });
    },

    tool: async (_: any, { id }: { id: string }) => {
      return prisma.tool.findUnique({ where: { id } });
    },

    toolExecutions: async (_: any, { agentId, toolId }: any) => {
      return prisma.toolExecution.findMany({
        where: {
          ...(agentId && { agentId }),
          ...(toolId && { toolId })
        },
        include: {
          tool: true,
          agent: true
        }
      });
    },

    knowledgeBase: async (_: any, { category, tags }: any) => {
      return prisma.knowledgeBase.findMany({
        where: {
          ...(category && { category }),
          ...(tags && { tags: { hasSome: tags } })
        }
      });
    },

    searchKnowledge: async (_: any, { query }: { query: string }) => {
      // Simple text search - in production, use full-text search or vector similarity
      return prisma.knowledgeBase.findMany({
        where: {
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { content: { contains: query, mode: 'insensitive' } }
          ]
        }
      });
    },

    dashboardStats: async () => {
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

      // Get recent activity
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
    }
  },

  Mutation: {
    login: async (_: any, { email, password }: { email: string; password: string }) => {
      const user = await prisma.user.findUnique({ where: { email } });

      if (!user || !(await comparePassword(password, user.password))) {
        throw new GraphQLError('Invalid credentials', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role
      });

      return { token, user };
    },

    register: async (_: any, { email, password, name }: any) => {
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

      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role
      });

      return { token, user };
    },

    createApiKey: async (_: any, { expiresAt }: any, context: any) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated');
      }

      const apiKey = await prisma.apiKey.create({
        data: {
          id: uuidv4(),
          key: `tella_${uuidv4().replace(/-/g, '')}`,
          userId: context.user.id,
          expiresAt
        }
      });

      return apiKey;
    },

    revokeApiKey: async (_: any, { id }: { id: string }) => {
      await prisma.apiKey.delete({ where: { id } });
      return true;
    },

    createTarget: async (_: any, args: any) => {
      const target = await prisma.target.create({
        data: {
          id: uuidv4(),
          name: args.name,
          url: args.url,
          type: args.type,
          description: args.description,
          metadata: args.metadata,
          status: 'ACTIVE'
        }
      });

      return target;
    },

    updateTarget: async (_: any, { id, ...data }: any) => {
      return prisma.target.update({
        where: { id },
        data
      });
    },

    deleteTarget: async (_: any, { id }: { id: string }) => {
      await prisma.target.delete({ where: { id } });
      return true;
    },

    createScan: async (_: any, { name, targetId, config }: any, context: any) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated');
      }

      const scan = await prisma.scan.create({
        data: {
          id: uuidv4(),
          name,
          targetId,
          userId: context.user.id,
          config,
          status: 'QUEUED',
          progress: 0
        },
        include: {
          target: true,
          user: true
        }
      });

      return scan;
    },

    startScan: async (_: any, { id }: { id: string }) => {
      const scan = await prisma.scan.update({
        where: { id },
        data: {
          status: 'RUNNING',
          startedAt: new Date()
        },
        include: {
          target: true,
          user: true
        }
      });

      // Start orchestration
      orchestrator.orchestrateScan(id).catch(err => {
        console.error('Orchestration error:', err);
      });

      // Publish scan started event
      pubsub.publish('SCAN_UPDATED', { scanUpdated: scan });

      return scan;
    },

    pauseScan: async (_: any, { id }: { id: string }) => {
      const scan = await prisma.scan.update({
        where: { id },
        data: { status: 'PAUSED' },
        include: { target: true, user: true }
      });

      pubsub.publish('SCAN_UPDATED', { scanUpdated: scan });
      return scan;
    },

    resumeScan: async (_: any, { id }: { id: string }) => {
      const scan = await prisma.scan.update({
        where: { id },
        data: { status: 'RUNNING' },
        include: { target: true, user: true }
      });

      pubsub.publish('SCAN_UPDATED', { scanUpdated: scan });
      return scan;
    },

    cancelScan: async (_: any, { id }: { id: string }) => {
      const scan = await prisma.scan.update({
        where: { id },
        data: { status: 'CANCELLED', completedAt: new Date() },
        include: { target: true, user: true }
      });

      // Stop all agents
      await orchestrator.stopScan(id);

      pubsub.publish('SCAN_UPDATED', { scanUpdated: scan });
      return scan;
    },

    deleteScan: async (_: any, { id }: { id: string }) => {
      await prisma.scan.delete({ where: { id } });
      return true;
    },

    createAgent: async (_: any, args: any) => {
      return orchestrator.createAgent({
        type: args.type,
        role: args.role,
        config: args.config
      });
    },

    updateAgent: async (_: any, { id, ...data }: any) => {
      return prisma.agent.update({
        where: { id },
        data
      });
    },

    terminateAgent: async (_: any, { id }: { id: string }) => {
      await prisma.agent.update({
        where: { id },
        data: { status: 'TERMINATED' }
      });
      return true;
    },

    createTask: async (_: any, args: any) => {
      return orchestrator.createTask({
        agentId: args.agentId,
        scanId: args.scanId,
        type: args.type,
        description: args.description,
        input: args.input,
        priority: args.priority
      });
    },

    updateTask: async (_: any, { id, ...data }: any) => {
      return prisma.task.update({
        where: { id },
        data
      });
    },

    retryTask: async (_: any, { id }: { id: string }) => {
      return prisma.task.update({
        where: { id },
        data: {
          status: 'PENDING',
          error: null,
          retries: 0
        }
      });
    },

    cancelTask: async (_: any, { id }: { id: string }) => {
      await prisma.task.update({
        where: { id },
        data: { status: 'CANCELLED' }
      });
      return true;
    },

    createFinding: async (_: any, args: any) => {
      const finding = await prisma.finding.create({
        data: {
          id: uuidv4(),
          scanId: args.scanId,
          targetId: args.targetId,
          title: args.title,
          description: args.description,
          severity: args.severity,
          category: args.category,
          evidence: args.evidence,
          cvss: args.cvss,
          cve: args.cve,
          confidence: args.confidence || 1.0,
          remediation: args.remediation,
          references: args.references || [],
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

    updateFinding: async (_: any, { id, ...data }: any) => {
      return prisma.finding.update({
        where: { id },
        data,
        include: {
          scan: true,
          target: true
        }
      });
    },

    deleteFinding: async (_: any, { id }: { id: string }) => {
      await prisma.finding.delete({ where: { id } });
      return true;
    },

    createTool: async (_: any, args: any) => {
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

    updateTool: async (_: any, { id, ...data }: any) => {
      return prisma.tool.update({
        where: { id },
        data
      });
    },

    deleteTool: async (_: any, { id }: { id: string }) => {
      await prisma.tool.delete({ where: { id } });
      return true;
    },

    executeTool: async (_: any, { toolId, agentId, args }: any) => {
      // Tool execution logic would go here
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

    addKnowledge: async (_: any, args: any) => {
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

    updateKnowledge: async (_: any, { id, ...data }: any) => {
      return prisma.knowledgeBase.update({
        where: { id },
        data
      });
    },

    deleteKnowledge: async (_: any, { id }: { id: string }) => {
      await prisma.knowledgeBase.delete({ where: { id } });
      return true;
    },

    agentThink: async (_: any, { agentId, context }: any) => {
      // AI thinking logic - would integrate with GPT-5
      return {
        thought: 'Analyzing the context and planning next steps',
        reasoning: 'Based on the current scan data, I recommend...',
        nextActions: ['action1', 'action2']
      };
    },

    agentExecute: async (_: any, { agentId, action, params }: any) => {
      // AI action execution
      return {
        success: true,
        result: {},
        observations: 'Action completed successfully'
      };
    }
  },

  Subscription: {
    scanUpdated: {
      subscribe: (_: any, { scanId }: { scanId: string }) => {
        return pubsub.asyncIterator(['SCAN_UPDATED']);
      }
    },

    scanProgress: {
      subscribe: (_: any, { scanId }: { scanId: string }) => {
        return pubsub.asyncIterator([`SCAN_PROGRESS_${scanId}`]);
      }
    },

    agentStatusChanged: {
      subscribe: () => {
        return pubsub.asyncIterator(['AGENT_STATUS_CHANGED']);
      }
    },

    agentThinking: {
      subscribe: (_: any, { agentId }: { agentId: string }) => {
        return pubsub.asyncIterator([`AGENT_THINKING_${agentId}`]);
      }
    },

    taskUpdated: {
      subscribe: () => {
        return pubsub.asyncIterator(['TASK_UPDATED']);
      }
    },

    findingDiscovered: {
      subscribe: () => {
        return pubsub.asyncIterator(['FINDING_DISCOVERED']);
      }
    },

    toolExecutionUpdated: {
      subscribe: () => {
        return pubsub.asyncIterator(['TOOL_EXECUTION_UPDATED']);
      }
    },

    agentLogs: {
      subscribe: (_: any, { agentId }: { agentId: string }) => {
        return pubsub.asyncIterator([`AGENT_LOGS_${agentId}`]);
      }
    },

    scanLogs: {
      subscribe: (_: any, { scanId }: { scanId: string }) => {
        return pubsub.asyncIterator([`SCAN_LOGS_${scanId}`]);
      }
    }
  },

  // Field resolvers
  Scan: {
    stats: async (parent: any) => {
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
    dependencies: async (parent: any) => {
      const deps = await prisma.taskDependency.findMany({
        where: { taskId: parent.id },
        include: { dependsOn: true }
      });
      return deps.map(d => d.dependsOn);
    },
    dependents: async (parent: any) => {
      const deps = await prisma.taskDependency.findMany({
        where: { dependsOnId: parent.id },
        include: { task: true }
      });
      return deps.map(d => d.task);
    }
  }
};
