/**
 * BullMQ Workers - Process Jobs from Queues
 *
 * Workers that consume jobs from BullMQ queues and execute them.
 * Replaces the polling mechanism in agents.
 */

import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { auditScan, auditTask, auditTool, auditFinding } from '../utils/audit-logger.js';
import { AgentOrchestrator, AgentRunner } from '../ai/agent-orchestrator.js';
import { triggerWebhookEvent, WebhookService } from '../services/webhook-service.js';
import { emailService } from '../services/email-service.js';
import type { ScanJobData, TaskJobData, AgentJobData, WebhookJobData } from './scan-queue.js';
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
const WEBHOOK_CONCURRENCY = parseInt(process.env.WEBHOOK_CONCURRENCY || '10', 10);

/**
 * Format scan duration with proper handling of hours, days, and edge cases
 */
function formatScanDuration(startedAt: Date | null, completedAt: Date | null): string | undefined {
  if (!startedAt || !completedAt) {
    return undefined;
  }

  try {
    const durationMs = completedAt.getTime() - startedAt.getTime();

    // Handle negative duration (invalid timestamps)
    if (durationMs < 0) {
      logger.warn('Invalid scan duration: completedAt is before startedAt', {
        startedAt,
        completedAt
      });
      return 'Invalid duration';
    }

    // Convert to various time units
    const totalSeconds = Math.floor(durationMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    // Format based on duration length
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  } catch (error) {
    logger.error('Error formatting scan duration:', error);
    return undefined;
  }
}

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
      const scan = await prisma.scan.update({
        where: { id: scanId },
        data: {
          status: 'RUNNING',
          startedAt: new Date(),
          progress: 0
        },
        include: {
          target: true
        }
      });

      // Audit log: Scan started
      await auditScan.started(scanId, { targetId, userId, config });

      // Trigger webhook for scan started
      try {
        await triggerWebhookEvent('SCAN_STARTED', {
          scan: {
            id: scan.id,
            name: scan.name,
            status: scan.status,
            startedAt: scan.startedAt
          },
          target: {
            id: scan.target.id,
            name: scan.target.name,
            url: scan.target.url
          }
        });
      } catch (webhookError) {
        logger.error('Failed to trigger SCAN_STARTED webhook:', webhookError);
      }

      // Initialize orchestrator and create agents + tasks
      const orchestrator = new AgentOrchestrator();
      await orchestrator.orchestrateScan(scanId);

      // NOTE: Do NOT mark scan as COMPLETED here!
      // The scan stays in RUNNING status until all tasks complete.
      // The checkScanCompletion() function in task worker will mark it COMPLETED.

      logger.info(`Scan ${scanId} orchestration complete - agents and tasks created`);

      return { success: true, scanId };

    } catch (error: any) {
      logger.error(`Scan ${scanId} failed:`, error);

      // Audit log: Scan failed
      await auditScan.failed(scanId, error.message || 'Unknown error during scan execution', { error: error.stack });

      // Update scan status to FAILED with error message
      const failedScan = await prisma.scan.update({
        where: { id: scanId },
        data: {
          status: 'FAILED',
          error: error.message || 'Unknown error during scan execution',
          completedAt: new Date()
        },
        include: {
          target: true
        }
      });

      // Trigger webhook for scan failed
      try {
        await triggerWebhookEvent('SCAN_FAILED', {
          scan: {
            id: failedScan.id,
            name: failedScan.name,
            status: failedScan.status,
            error: failedScan.error,
            completedAt: failedScan.completedAt
          },
          target: {
            id: failedScan.target.id,
            name: failedScan.target.name,
            url: failedScan.target.url
          }
        });
      } catch (webhookError) {
        logger.error('Failed to trigger SCAN_FAILED webhook:', webhookError);
      }

      // Send email notification for scan failure
      try {
        const user = await prisma.user.findUnique({
          where: { id: failedScan.userId }
        });

        if (user && user.emailNotifications && user.notifyOnScanFailed) {
          await emailService.sendScanFailedEmail(user.email, {
            scanId: failedScan.id,
            scanName: failedScan.name,
            targetName: failedScan.target.name,
            targetUrl: failedScan.target.url,
            error: failedScan.error || 'Unknown error during scan execution',
            failedAt: failedScan.completedAt!
          });
        }
      } catch (emailError) {
        logger.error('Failed to send scan failed email:', emailError);
      }

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

      // Audit log: Task started
      await auditTask.started(scanId, agentId, taskId, type);

      // Execute task with REAL AI reasoning (not direct tool calls!)
      // This uses the AgentRunner.executeTaskWithAI() method which:
      // 1. Calls OpenAI to analyze the task
      // 2. Lets AI decide which tools to use
      // 3. AI can iterate and adjust based on results
      // 4. Logs REAL AI thoughts to audit trail
      // NOTE: AgentRunner handles task status updates internally,
      //       so we don't need to update it here
      const result = await AgentRunner.executeTaskWithAI(taskId);

      // Audit log: Task completed (AI already updated task status)
      await auditTask.completed(scanId, agentId, taskId, type, result);

      // Create findings from task results
      await createFindingsFromTaskResult(task, result);

      logger.debug(`Task ${taskId} completed successfully`);

      // Check if all tasks for this scan are completed
      await checkScanCompletion(scanId);

      return { success: true, taskId, result };

    } catch (error: any) {
      logger.error(`Task ${taskId} failed:`, error);

      // Audit log: Task failed
      await auditTask.failed(scanId, agentId, taskId, type, error.message);

      // Update task status to FAILED
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'FAILED',
          error: error.message,
          completedAt: new Date()
        }
      });

      // Check if all tasks for this scan are completed (even if this one failed)
      await checkScanCompletion(scanId);

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
 * OLD IMPLEMENTATION - Direct tool calls without AI reasoning
 * This has been replaced by AgentRunner.executeTaskWithAI() which provides:
 * - Real AI reasoning and decision making
 * - Iterative problem solving
 * - Tool selection based on context
 * - Real-time thought logging
 *
 * Keeping this function commented for reference, but it should NOT be used.
 */
// async function executeTask(task: any): Promise<any> {
//   const { SecurityTools } = await import('../tools/security-tools.js');
//   const tools = new SecurityTools();
//   // ... direct tool calls without AI
// }

/**
 * Create findings from task execution results
 */
async function createFindingsFromTaskResult(task: any, result: any): Promise<void> {
  try {
    const { v4: uuidv4 } = await import('uuid');

    // Get scan and target info
    const scan = await prisma.scan.findUnique({
      where: { id: task.scanId },
      include: { target: true }
    });

    if (!scan) {
      logger.warn(`Scan ${task.scanId} not found for finding creation`);
      return;
    }

    // Extract findings based on task type and results
    const findings: any[] = [];

    switch (task.type) {
      case 'PORT_SCAN':
        // Create informational finding for open ports
        if (result.openPorts && result.openPorts.length > 0) {
          const criticalPorts = result.openPorts.filter((p: any) =>
            [21, 23, 139, 445, 3389].includes(p.port)
          );

          if (criticalPorts.length > 0) {
            findings.push({
              id: uuidv4(),
              scanId: task.scanId,
              targetId: scan.targetId,
              title: 'Potentially Vulnerable Ports Detected',
              description: `Found ${criticalPorts.length} potentially vulnerable ports open: ${criticalPorts.map((p: any) => `${p.port}/${p.protocol} (${p.service})`).join(', ')}`,
              severity: 'MEDIUM',
              status: 'CONFIRMED',
              category: 'MISCONFIGURATION',
              cvss: 5.0,
              remediation: 'Review if these services are required. Disable unnecessary services and ensure proper authentication and encryption.',
              evidence: {
                affectedComponent: task.input.target,
                openPorts: criticalPorts,
                scanType: result.scanType,
                totalPorts: result.openPorts.length
              }
            });
          }
        }
        break;

      case 'VULN_SCAN':
        // Create findings for detected vulnerabilities
        if (result.vulnerabilities && result.vulnerabilities.length > 0) {
          for (const vuln of result.vulnerabilities) {
            findings.push({
              id: uuidv4(),
              scanId: task.scanId,
              targetId: scan.targetId,
              title: vuln.title || `${vuln.type} Vulnerability Detected`,
              description: vuln.description || `A ${vuln.type} vulnerability was detected during web application scanning.`,
              severity: vuln.severity || 'MEDIUM',
              status: 'CONFIRMED',
              category: vuln.category || mapVulnTypeToCategory(vuln.type),
              cvss: vuln.cvssScore || vuln.cvss || calculateCVSSFromSeverity(vuln.severity),
              remediation: vuln.remediation || getDefaultRemediation(vuln.type),
              evidence: {
                affectedComponent: vuln.url || task.input.url,
                type: vuln.type,
                payload: vuln.payload,
                request: vuln.request,
                response: vuln.response,
                location: vuln.location
              },
              references: vuln.references || []
            });
          }
        }
        break;

      case 'ENUMERATE':
        // Create informational finding for discovered subdomains
        if (result.subdomains && result.subdomains.length > 0) {
          findings.push({
            id: uuidv4(),
            scanId: task.scanId,
            targetId: scan.targetId,
            title: 'Subdomains Discovered',
            description: `Discovered ${result.subdomains.length} subdomains for ${task.input.domain}. Review for potential attack surface expansion.`,
            severity: 'LOW',
            status: 'CONFIRMED',
            category: 'INFO_DISCLOSURE',
            cvss: 3.0,
            remediation: 'Review all discovered subdomains. Ensure unused subdomains are removed and all active subdomains are properly secured.',
            evidence: {
              affectedComponent: task.input.domain,
              subdomains: result.subdomains,
              techniques: task.input.techniques,
              totalFound: result.subdomains.length
            }
          });
        }
        break;

      case 'EXPLOIT':
        // Create finding if exploit was successful
        if (result.success) {
          findings.push({
            id: uuidv4(),
            scanId: task.scanId,
            targetId: scan.targetId,
            title: `Exploitable ${task.input.exploit_type} Vulnerability`,
            description: result.description || `Successfully exploited ${task.input.exploit_type} vulnerability.`,
            severity: 'CRITICAL',
            status: 'CONFIRMED',
            category: 'EXPLOIT',
            cvss: result.cvssScore || result.cvss || 9.0,
            remediation: result.remediation || 'Apply security patches immediately. Review and implement additional security controls.',
            evidence: {
              affectedComponent: task.input.target,
              exploitType: task.input.exploit_type,
              payload: task.input.payload,
              result: result.output,
              safeMode: task.input.safe_mode
            }
          });
        }
        break;
    }

    // Insert findings into database
    if (findings.length > 0) {
      await prisma.finding.createMany({
        data: findings
      });
      logger.info(`Created ${findings.length} findings from task ${task.id}`);

      // Audit log each finding
      for (const finding of findings) {
        await auditFinding.created(
          task.scanId,
          task.id,
          finding.title,
          finding.severity,
          { category: finding.category, cvss: finding.cvss }
        );
      }
    }

  } catch (error: any) {
    logger.error(`Error creating findings from task ${task.id}:`, error);
    // Don't throw - findings creation failure shouldn't fail the task
  }
}

/**
 * Check if all tasks for a scan are completed and update scan status
 */
async function checkScanCompletion(scanId: string): Promise<void> {
  try {
    // Get current scan status
    const scan = await prisma.scan.findUnique({
      where: { id: scanId },
      select: { status: true }
    });

    if (!scan) {
      logger.warn(`Scan ${scanId} not found`);
      return;
    }

    // Don't update if scan is already in a terminal state (FAILED, COMPLETED, CANCELLED)
    // This prevents overwriting FAILED status from orchestration errors
    if (['FAILED', 'COMPLETED', 'CANCELLED'].includes(scan.status)) {
      logger.debug(`Scan ${scanId} already in terminal state: ${scan.status}, skipping completion check`);
      return;
    }

    // Get all tasks for this scan
    const tasks = await prisma.task.findMany({
      where: { scanId },
      select: { status: true }
    });

    if (tasks.length === 0) {
      logger.warn(`No tasks found for scan ${scanId}`);
      return;
    }

    // Check if all tasks are in terminal states (COMPLETED, FAILED, CANCELLED)
    const terminalStatuses = ['COMPLETED', 'FAILED', 'CANCELLED'];
    const allTasksComplete = tasks.every(task =>
      terminalStatuses.includes(task.status)
    );

    if (allTasksComplete) {
      const completedTasks = tasks.filter(t => t.status === 'COMPLETED').length;
      const failedTasks = tasks.filter(t => t.status === 'FAILED').length;

      logger.info(`All tasks completed for scan ${scanId}. Completed: ${completedTasks}, Failed: ${failedTasks}`);

      const finalStatus = failedTasks === tasks.length ? 'FAILED' : 'COMPLETED';

      // Update scan status - mark as completed even if some tasks failed
      // The scan worker will handle this, but we update progress here
      const completedScan = await prisma.scan.update({
        where: { id: scanId },
        data: {
          progress: 100,
          completedAt: new Date(),
          status: finalStatus
        },
        include: {
          target: true,
          findings: {
            select: {
              id: true,
              severity: true
            }
          }
        }
      });

      // Audit log: Scan completed or failed
      if (finalStatus === 'COMPLETED') {
        await auditScan.completed(scanId, { completedTasks, failedTasks, totalTasks: tasks.length });
      } else {
        await auditScan.failed(scanId, 'All tasks failed', { completedTasks, failedTasks, totalTasks: tasks.length });
      }

      logger.info(`Scan ${scanId} marked as ${finalStatus}`);

      // Trigger webhooks based on final status
      try {
        const findingCounts = completedScan.findings.reduce((acc, f) => {
          acc[f.severity] = (acc[f.severity] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        if (finalStatus === 'COMPLETED') {
          await triggerWebhookEvent('SCAN_COMPLETED', {
            scan: {
              id: completedScan.id,
              name: completedScan.name,
              status: completedScan.status,
              progress: completedScan.progress,
              completedAt: completedScan.completedAt
            },
            target: {
              id: completedScan.target.id,
              name: completedScan.target.name,
              url: completedScan.target.url
            },
            summary: {
              totalTasks: tasks.length,
              completedTasks,
              failedTasks,
              totalFindings: completedScan.findings.length,
              findingsBySeverity: findingCounts
            }
          });
        } else {
          await triggerWebhookEvent('SCAN_FAILED', {
            scan: {
              id: completedScan.id,
              name: completedScan.name,
              status: completedScan.status,
              error: 'All tasks failed',
              completedAt: completedScan.completedAt
            },
            target: {
              id: completedScan.target.id,
              name: completedScan.target.name,
              url: completedScan.target.url
            },
            summary: {
              totalTasks: tasks.length,
              completedTasks,
              failedTasks
            }
          });
        }
      } catch (webhookError) {
        logger.error(`Failed to trigger webhook for scan ${finalStatus}:`, webhookError);
      }

      // Send email notification for scan completion/failure
      try {
        if (!emailService.isEnabled()) {
          logger.debug('Email service not enabled, skipping scan completion email');
        } else {
          const user = await prisma.user.findUnique({
            where: { id: completedScan.userId }
          });

        if (user && user.emailNotifications) {
          if (finalStatus === 'COMPLETED' && user.notifyOnScanComplete) {
            // Calculate scan duration with proper formatting
            const duration = formatScanDuration(completedScan.startedAt, completedScan.completedAt);

            await emailService.sendScanCompletedEmail(user.email, {
              scanId: completedScan.id,
              scanName: completedScan.name,
              targetName: completedScan.target.name,
              targetUrl: completedScan.target.url,
              completedAt: completedScan.completedAt!,
              totalFindings: completedScan.findings.length,
              criticalFindings: findingCounts['CRITICAL'] || 0,
              highFindings: findingCounts['HIGH'] || 0,
              mediumFindings: findingCounts['MEDIUM'] || 0,
              lowFindings: findingCounts['LOW'] || 0,
              duration
            });
          } else if (finalStatus === 'FAILED' && user.notifyOnScanFailed) {
            await emailService.sendScanFailedEmail(user.email, {
              scanId: completedScan.id,
              scanName: completedScan.name,
              targetName: completedScan.target.name,
              targetUrl: completedScan.target.url,
              error: 'All tasks failed',
              failedAt: completedScan.completedAt!
            });
          }
        }
        }
      } catch (emailError) {
        logger.error(`Failed to send email for scan ${finalStatus}:`, emailError);
      }
    } else {
      // Calculate progress based on completed tasks
      const completedCount = tasks.filter(t =>
        terminalStatuses.includes(t.status)
      ).length;
      const progress = Math.round((completedCount / tasks.length) * 100);

      await prisma.scan.update({
        where: { id: scanId },
        data: { progress }
      });

      // Audit log: Progress update
      await auditScan.progress(scanId, progress, `${completedCount}/${tasks.length} tasks completed`);

      logger.debug(`Scan ${scanId} progress: ${progress}% (${completedCount}/${tasks.length} tasks completed)`);
    }

  } catch (error: any) {
    logger.error(`Error checking scan completion for ${scanId}:`, error);
    // Don't throw - scan completion check failure shouldn't fail the task
  }
}

/**
 * Helper functions for finding creation
 */
function mapVulnTypeToCategory(type: string): string {
  const mapping: Record<string, string> = {
    'xss': 'XSS',
    'sqli': 'INJECTION',
    'sql_injection': 'INJECTION',
    'csrf': 'CSRF',
    'ssrf': 'SSRF',
    'lfi': 'PATH_TRAVERSAL',
    'rfi': 'PATH_TRAVERSAL',
    'rce': 'RCE',
    'xxe': 'XXE'
  };
  return mapping[type.toLowerCase()] || 'MISCONFIGURATION';
}

function calculateCVSSFromSeverity(severity?: string): number {
  const mapping: Record<string, number> = {
    'CRITICAL': 9.0,
    'HIGH': 7.5,
    'MEDIUM': 5.0,
    'LOW': 3.0,
    'INFO': 1.0
  };
  return mapping[severity?.toUpperCase() || 'MEDIUM'] || 5.0;
}

function getDefaultRemediation(vulnType: string): string {
  const remediations: Record<string, string> = {
    'xss': 'Implement proper input validation and output encoding. Use Content Security Policy headers.',
    'sqli': 'Use parameterized queries or prepared statements. Never concatenate user input into SQL queries.',
    'csrf': 'Implement anti-CSRF tokens for all state-changing operations.',
    'ssrf': 'Validate and sanitize all URLs. Implement allowlists for allowed domains and protocols.',
    'lfi': 'Validate file paths against an allowlist. Never allow user input directly in file operations.',
    'rce': 'Never execute user input as code. Implement strict input validation and sandboxing.'
  };
  return remediations[vulnType.toLowerCase()] || 'Review the vulnerability and apply appropriate security controls.';
}

/**
 * Webhook Worker - Delivers webhooks with retry logic
 */
export const webhookWorker = new Worker<WebhookJobData>(
  QUEUE_NAMES.WEBHOOKS,
  async (job: Job<WebhookJobData>) => {
    const { webhookId, event, data, deliveryId } = job.data;

    logger.debug(`Processing webhook job: ${deliveryId}`, {
      jobId: job.id,
      webhookId,
      event,
      attempt: job.attemptsMade + 1
    });

    try {
      // Deliver webhook (will throw if delivery fails)
      await WebhookService.deliverWebhook(
        webhookId,
        event,
        data,
        deliveryId,
        job.attemptsMade + 1
      );

      return { success: true, deliveryId };
    } catch (error: any) {
      logger.warn(`Webhook delivery failed (attempt ${job.attemptsMade + 1}):`, {
        webhookId,
        deliveryId,
        error: error.message
      });

      // If this is the last attempt, mark as permanently failed
      if (job.attemptsMade + 1 >= 3) {
        await WebhookService.markDeliveryFailed(
          deliveryId,
          error.message,
          webhookId
        );
        logger.error(`Webhook delivery permanently failed after 3 attempts: ${deliveryId}`);
      }

      // Re-throw to trigger BullMQ retry
      throw error;
    }
  },
  {
    connection,
    concurrency: WEBHOOK_CONCURRENCY
  }
);

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

webhookWorker.on('completed', (job) => {
  logger.debug(`Webhook worker completed job ${job.id}`);
});

webhookWorker.on('failed', (job, err) => {
  logger.error(`Webhook worker failed job ${job?.id}:`, err);
});

// Graceful shutdown
export async function closeWorkers() {
  logger.info('Closing BullMQ workers...');
  await Promise.all([
    scanWorker.close(),
    taskWorker.close(),
    agentWorker.close(),
    webhookWorker.close()
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
  agentConcurrency: AGENT_CONCURRENCY,
  webhookConcurrency: WEBHOOK_CONCURRENCY
});
