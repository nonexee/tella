/**
 * BullMQ Queue System - Task Queue for Scan Processing
 *
 * Replaces database polling with proper job queue for:
 * - Task persistence across restarts
 * - Distributed worker support
 * - Retry mechanisms with backoff
 * - Job prioritization
 * - Dead letter queue for failed jobs
 */

import { Queue, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

// Redis connection configuration
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

connection.on('error', (err) => {
  logger.error('Redis connection error:', err);
});

connection.on('connect', () => {
  logger.info('Redis connected successfully');
});

// Queue names
export const QUEUE_NAMES = {
  SCANS: 'scans',
  TASKS: 'tasks',
  AGENTS: 'agents',
  WEBHOOKS: 'webhooks'
} as const;

// Job types
export interface ScanJobData {
  scanId: string;
  userId: string;
  targetId: string;
  config: any;
}

export interface TaskJobData {
  taskId: string;
  scanId: string;
  agentId: string;
  type: string;
  description: string;
  input: any;
  priority: number;
}

export interface AgentJobData {
  agentId: string;
  scanId: string;
  type: string;
  role: string;
}

export interface WebhookJobData {
  webhookId: string;
  event: string;
  data: any;
  deliveryId: string;
}

// Queue options
const defaultQueueOptions = {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 2000
    },
    removeOnComplete: {
      count: 100, // Keep last 100 completed jobs
      age: 86400 // Keep for 24 hours
    },
    removeOnFail: {
      count: 50 // Keep last 50 failed jobs for debugging
    }
  }
};

// Create queues
export const scanQueue = new Queue<ScanJobData>(QUEUE_NAMES.SCANS, {
  ...defaultQueueOptions,
  defaultJobOptions: {
    ...defaultQueueOptions.defaultJobOptions,
    attempts: 2 // Scans get 2 attempts
  }
});

export const taskQueue = new Queue<TaskJobData>(QUEUE_NAMES.TASKS, {
  ...defaultQueueOptions,
  defaultJobOptions: {
    ...defaultQueueOptions.defaultJobOptions,
    attempts: 3 // Tasks get 3 attempts
  }
});

export const agentQueue = new Queue<AgentJobData>(QUEUE_NAMES.AGENTS, {
  ...defaultQueueOptions,
  defaultJobOptions: {
    ...defaultQueueOptions.defaultJobOptions,
    attempts: 2
  }
});

export const webhookQueue = new Queue<WebhookJobData>(QUEUE_NAMES.WEBHOOKS, {
  ...defaultQueueOptions,
  defaultJobOptions: {
    ...defaultQueueOptions.defaultJobOptions,
    attempts: 3, // 3 retry attempts for webhooks
    backoff: {
      type: 'exponential' as const,
      delay: 1000 // Start with 1s, then 2s, then 4s
    }
  },
  // Add rate limiting to prevent overwhelming external webhook endpoints
  limiter: {
    max: parseInt(process.env.WEBHOOK_RATE_LIMIT_MAX || '10', 10), // Max jobs per duration
    duration: parseInt(process.env.WEBHOOK_RATE_LIMIT_DURATION || '1000', 10) // Duration in ms (default 1 second)
  }
});

// Queue events for monitoring
const scanQueueEvents = new QueueEvents(QUEUE_NAMES.SCANS, { connection });
const taskQueueEvents = new QueueEvents(QUEUE_NAMES.TASKS, { connection });
const agentQueueEvents = new QueueEvents(QUEUE_NAMES.AGENTS, { connection });
const webhookQueueEvents = new QueueEvents(QUEUE_NAMES.WEBHOOKS, { connection });

// Event handlers for scans
scanQueueEvents.on('completed', ({ jobId }) => {
  logger.info(`Scan job ${jobId} completed`);
});

scanQueueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`Scan job ${jobId} failed: ${failedReason}`);
});

scanQueueEvents.on('stalled', ({ jobId }) => {
  logger.warn(`Scan job ${jobId} stalled`);
});

// Event handlers for tasks
taskQueueEvents.on('completed', ({ jobId }) => {
  logger.debug(`Task job ${jobId} completed`);
});

taskQueueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`Task job ${jobId} failed: ${failedReason}`);
});

// Event handlers for agents
agentQueueEvents.on('completed', ({ jobId }) => {
  logger.info(`Agent job ${jobId} completed`);
});

agentQueueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`Agent job ${jobId} failed: ${failedReason}`);
});

// Event handlers for webhooks
webhookQueueEvents.on('completed', ({ jobId }) => {
  logger.debug(`Webhook job ${jobId} completed`);
});

webhookQueueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`Webhook job ${jobId} failed: ${failedReason}`);
});

webhookQueueEvents.on('retrying', ({ jobId, attemptsMade }) => {
  logger.warn(`Webhook job ${jobId} retrying (attempt ${attemptsMade})`);
});

// Helper functions
export async function addScanJob(data: ScanJobData, priority?: number) {
  return scanQueue.add('process-scan' as any, data, {
    priority: priority || 0,
    jobId: `scan-${data.scanId}` // Prevent duplicate jobs
  });
}

export async function addTaskJob(data: TaskJobData) {
  return taskQueue.add('process-task' as any, data, {
    priority: data.priority || 0,
    jobId: `task-${data.taskId}`
  });
}

export async function addAgentJob(data: AgentJobData, priority?: number) {
  return agentQueue.add('process-agent' as any, data, {
    priority: priority || 0,
    jobId: `agent-${data.agentId}`
  });
}

export async function addWebhookJob(data: WebhookJobData) {
  return webhookQueue.add('deliver-webhook' as any, data, {
    jobId: `webhook-${data.deliveryId}` // Prevent duplicate deliveries
  });
}

// Queue management
export async function pauseQueue(queueName: string) {
  const queue = getQueueByName(queueName);
  await queue.pause();
  logger.info(`Queue ${queueName} paused`);
}

export async function resumeQueue(queueName: string) {
  const queue = getQueueByName(queueName);
  await queue.resume();
  logger.info(`Queue ${queueName} resumed`);
}

export async function getQueueStats(queueName: string) {
  const queue = getQueueByName(queueName);
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount()
  ]);

  return {
    queueName,
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed
  };
}

export async function getAllQueueStats() {
  return Promise.all([
    getQueueStats(QUEUE_NAMES.SCANS),
    getQueueStats(QUEUE_NAMES.TASKS),
    getQueueStats(QUEUE_NAMES.AGENTS),
    getQueueStats(QUEUE_NAMES.WEBHOOKS)
  ]);
}

export async function clearQueue(queueName: string) {
  const queue = getQueueByName(queueName);
  await queue.obliterate({ force: true });
  logger.warn(`Queue ${queueName} cleared`);
}

function getQueueByName(name: string): Queue {
  switch (name) {
    case QUEUE_NAMES.SCANS:
      return scanQueue;
    case QUEUE_NAMES.TASKS:
      return taskQueue;
    case QUEUE_NAMES.AGENTS:
      return agentQueue;
    case QUEUE_NAMES.WEBHOOKS:
      return webhookQueue;
    default:
      throw new Error(`Unknown queue: ${name}`);
  }
}

// Graceful shutdown
export async function closeQueues() {
  logger.info('Closing BullMQ queues...');
  await Promise.all([
    scanQueue.close(),
    taskQueue.close(),
    agentQueue.close(),
    webhookQueue.close(),
    scanQueueEvents.close(),
    taskQueueEvents.close(),
    agentQueueEvents.close(),
    webhookQueueEvents.close(),
    connection.quit()
  ]);
  logger.info('All queues closed');
}

// Handle process termination
process.on('SIGTERM', async () => {
  await closeQueues();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await closeQueues();
  process.exit(0);
});

logger.info('BullMQ queues initialized', {
  redis: redisUrl,
  queues: Object.values(QUEUE_NAMES)
});
