/**
 * BullMQ Workers - Process Jobs from Queues
 *
 * Workers that consume jobs from BullMQ queues and execute them.
 * Replaces the polling mechanism in agents.
 */

import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { prisma } from '../db/client.js';
import { logger } from '../utils/logger.js';
import { AgentOrchestrator } from '../ai/agent-orchestrator.js';
import type { ScanJobData, TaskJobData, AgentJobData } from './scan-queue.js';
import { QUEUE_NAMES } from './scan-queue.js';

// Redis connection for workers
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

// Worker concurrency
const SCAN_CONCURRENCY = parseInt(process.env.SCAN_CONCURRENCY || '2', 10);
const TASK_CONCURRENCY = parseInt(process.env.TASK_CONCURRENCY || '10', 10);
const AGENT_CONCURRENCY = parseInt(process.env.AGENT_CONCURRENCY || '5', 10);

/**
 * Scan Worker - Orchestrates entire scan execution
 */
export const scanWorker = new Worker<ScanJobData>(
  QUEUE_NAMES.SCANS,
  async (job: Job<ScanJobData>) => {
    const { scanId, userId, targetId, config } = job.data;

    logger.info(`Processing scan job: ${scanId}`, {
      jobId: job.id,
      scanId,
      userId,
      targetId
    });

    try {
      // Update scan status to RUNNING
      await prisma.scan.update({
        where: { id: scanId },
        data: {
          status: 'RUNNING',
          startedAt: new Date()
        }
      });

      // Initialize orchestrator and run scan
      const orchestrator = AgentOrchestrator.getInstance();
      await orchestrator.orchestrateScan(scanId);

      // Update scan status to COMPLETED
      await prisma.scan.update({
        where: { id: scanId },
        data: {
          status: 'COMPLETED',
          progress: 100,
          completedAt: new Date()
        }
      });

      logger.info(`Scan ${scanId} completed successfully`);

      return { success: true, scanId };

    } catch (error: any) {
      logger.error(`Scan ${scanId} failed:`, error);

      // Update scan status to FAILED with error message
      await prisma.scan.update({
        where: { id: scanId },
        data: {
          status: 'FAILED',
          error: error.message || 'Unknown error during scan execution',
          completedAt: new Date()
        }
      });

      throw error; // Re-throw to mark job as failed
    }
  },
  {
    connection,
    concurrency: SCAN_CONCURRENCY,
    limiter: {
      max: 5, // Max 5 scans
      duration: 60000 // per minute
    }
  }
);

/**
 * Task Worker - Executes individual tasks
 */
export const taskWorker = new Worker<TaskJobData>(
  QUEUE_NAMES.TASKS,
  async (job: Job<TaskJobData>) => {
    const { taskId, scanId, agentId, type, description, input } = job.data;

    logger.debug(`Processing task job: ${taskId}`, {
      jobId: job.id,
      taskId,
      scanId,
      agentId,
      type
    });

    try {
      // Get task from database
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          agent: true,
          scan: true
        }
      });

      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      // Update task status to RUNNING
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'RUNNING',
          startedAt: new Date()
        }
      });

      // Execute task based on type
      const result = await executeTask(task);

      // Update task status to COMPLETED
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'COMPLETED',
          output: result,
          completedAt: new Date()
        }
      });

      logger.debug(`Task ${taskId} completed successfully`);

      return { success: true, taskId, result };

    } catch (error: any) {
      logger.error(`Task ${taskId} failed:`, error);

      // Update task status to FAILED
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'FAILED',
          error: error.message,
          completedAt: new Date()
        }
      });

      throw error;
    }
  },
  {
    connection,
    concurrency: TASK_CONCURRENCY
  }
);

/**
 * Agent Worker - Manages agent lifecycle
 */
export const agentWorker = new Worker<AgentJobData>(
  QUEUE_NAMES.AGENTS,
  async (job: Job<AgentJobData>) => {
    const { agentId, scanId, type, role } = job.data;

    logger.info(`Processing agent job: ${agentId}`, {
      jobId: job.id,
      agentId,
      scanId,
      type,
      role
    });

    try {
      // Get agent from database
      const agent = await prisma.agent.findUnique({
        where: { id: agentId },
        include: {
          scan: true,
          tasks: {
            where: { status: 'PENDING' },
            orderBy: { priority: 'desc' }
          }
        }
      });

      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      // Update agent status to ACTIVE
      await prisma.agent.update({
        where: { id: agentId },
        data: { status: 'ACTIVE' }
      });

      // Process agent's pending tasks
      for (const task of agent.tasks) {
        // Queue each task for processing
        const { addTaskJob } = await import('./scan-queue.js');
        await addTaskJob({
          taskId: task.id,
          scanId: task.scanId,
          agentId: task.agentId,
          type: task.type,
          description: task.description,
          input: task.input as any,
          priority: task.priority
        });
      }

      // Update agent status to IDLE after queuing tasks
      await prisma.agent.update({
        where: { id: agentId },
        data: { status: 'IDLE' }
      });

      logger.info(`Agent ${agentId} queued ${agent.tasks.length} tasks`);

      return { success: true, agentId, tasksQueued: agent.tasks.length };

    } catch (error: any) {
      logger.error(`Agent ${agentId} failed:`, error);

      // Update agent status to ERROR
      await prisma.agent.update({
        where: { id: agentId },
        data: { status: 'ERROR' }
      });

      throw error;
    }
  },
  {
    connection,
    concurrency: AGENT_CONCURRENCY
  }
);

/**
 * Execute a task based on its type
 */
async function executeTask(task: any): Promise<any> {
  const { SecurityTools } = await import('../tools/security-tools.js');
  const tools = new SecurityTools();

  // Parse input
  const input = task.input as any;

  try {
    switch (task.type) {
      case 'PORT_SCAN':
        return await tools.portScan({
          target: input.target,
          ports: input.ports,
          technique: input.technique
        });

      case 'WEB_SCAN':
        return await tools.webScan({
          url: input.url,
          scan_types: input.scan_types,
          depth: input.depth
        });

      case 'SUBDOMAIN_ENUM':
        return await tools.subdomainEnumeration({
          domain: input.domain,
          techniques: input.techniques
        });

      case 'EXPLOIT':
        return await tools.exploitTest({
          target: input.target,
          exploit_type: input.exploit_type,
          payload: input.payload,
          safe_mode: input.safe_mode
        });

      default:
        logger.warn(`Unknown task type: ${task.type}`);
        return { message: `Task type ${task.type} not implemented` };
    }
  } catch (error: any) {
    logger.error(`Error executing task ${task.id}:`, error);
    throw error;
  }
}

// Worker event handlers
scanWorker.on('completed', (job) => {
  logger.info(`Scan worker completed job ${job.id}`);
});

scanWorker.on('failed', (job, err) => {
  logger.error(`Scan worker failed job ${job?.id}:`, err);
});

taskWorker.on('completed', (job) => {
  logger.debug(`Task worker completed job ${job.id}`);
});

taskWorker.on('failed', (job, err) => {
  logger.error(`Task worker failed job ${job?.id}:`, err);
});

agentWorker.on('completed', (job) => {
  logger.info(`Agent worker completed job ${job.id}`);
});

agentWorker.on('failed', (job, err) => {
  logger.error(`Agent worker failed job ${job?.id}:`, err);
});

// Graceful shutdown
export async function closeWorkers() {
  logger.info('Closing BullMQ workers...');
  await Promise.all([
    scanWorker.close(),
    taskWorker.close(),
    agentWorker.close()
  ]);
  logger.info('All workers closed');
}

process.on('SIGTERM', async () => {
  await closeWorkers();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await closeWorkers();
  process.exit(0);
});

logger.info('BullMQ workers started', {
  scanConcurrency: SCAN_CONCURRENCY,
  taskConcurrency: TASK_CONCURRENCY,
  agentConcurrency: AGENT_CONCURRENCY
});
