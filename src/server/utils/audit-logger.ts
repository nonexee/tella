/**
 * Audit Logger - Centralized logging for scan execution events
 *
 * Tracks all AI decisions, tool executions, and scan progress
 * for transparency and debugging.
 */

import { prisma } from './prisma.js';
import { logger } from './logger.js';
import type { AuditEventType, AuditSeverity } from '@prisma/client';

export interface AuditLogParams {
  scanId?: string;
  agentId?: string;
  taskId?: string;
  eventType: AuditEventType;
  severity?: AuditSeverity;
  title: string;
  message: string;
  data?: Record<string, any>;
}

/**
 * Log an audit event to the database
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        scanId: params.scanId || undefined,
        agentId: params.agentId || undefined,
        taskId: params.taskId || undefined,
        eventType: params.eventType,
        severity: params.severity || 'INFO',
        title: params.title,
        message: params.message,
        data: params.data || undefined
      }
    });
  } catch (error: any) {
    // Don't let audit logging failures break the application
    logger.error('Failed to create audit log:', error);
  }
}

/**
 * Log scan lifecycle events
 */
export const auditScan = {
  started: (scanId: string, data?: Record<string, any>) =>
    logAudit({
      scanId,
      eventType: 'SCAN_STARTED',
      severity: 'INFO',
      title: 'Scan Started',
      message: 'Security scan initiated',
      data
    }),

  completed: (scanId: string, data?: Record<string, any>) =>
    logAudit({
      scanId,
      eventType: 'SCAN_COMPLETED',
      severity: 'INFO',
      title: 'Scan Completed',
      message: 'Security scan completed successfully',
      data
    }),

  failed: (scanId: string, error: string, data?: Record<string, any>) =>
    logAudit({
      scanId,
      eventType: 'SCAN_FAILED',
      severity: 'ERROR',
      title: 'Scan Failed',
      message: error,
      data
    }),

  progress: (scanId: string, progress: number, message: string) =>
    logAudit({
      scanId,
      eventType: 'PROGRESS_UPDATE',
      severity: 'DEBUG',
      title: 'Progress Update',
      message: `${progress}% - ${message}`,
      data: { progress }
    })
};

/**
 * Log agent events
 */
export const auditAgent = {
  created: (scanId: string, agentId: string, agentType: string, role: string) =>
    logAudit({
      scanId,
      agentId,
      eventType: 'AGENT_CREATED',
      severity: 'INFO',
      title: 'Agent Created',
      message: `${agentType} agent created: ${role}`,
      data: { agentType, role }
    }),

  reasoning: (scanId: string, agentId: string, reasoning: string, data?: Record<string, any>) =>
    logAudit({
      scanId,
      agentId,
      eventType: 'AGENT_REASONING',
      severity: 'INFO', // Changed from DEBUG to INFO so thoughts are always visible
      title: 'Agent Reasoning',
      message: reasoning,
      data
    }),

  decision: (scanId: string, agentId: string, decision: string, rationale: string, data?: Record<string, any>) =>
    logAudit({
      scanId,
      agentId,
      eventType: 'DECISION_MADE',
      severity: 'INFO',
      title: decision,
      message: rationale,
      data
    })
};

/**
 * Log task events
 */
export const auditTask = {
  created: (scanId: string, agentId: string, taskId: string, taskType: string, description: string) =>
    logAudit({
      scanId,
      agentId,
      taskId,
      eventType: 'TASK_CREATED',
      severity: 'INFO',
      title: 'Task Created',
      message: `${taskType}: ${description}`,
      data: { taskType, description }
    }),

  started: (scanId: string, agentId: string, taskId: string, taskType: string) =>
    logAudit({
      scanId,
      agentId,
      taskId,
      eventType: 'TASK_STARTED',
      severity: 'INFO',
      title: 'Task Started',
      message: `Executing ${taskType} task`,
      data: { taskType }
    }),

  completed: (scanId: string, agentId: string, taskId: string, taskType: string, result: any) =>
    logAudit({
      scanId,
      agentId,
      taskId,
      eventType: 'TASK_COMPLETED',
      severity: 'INFO',
      title: 'Task Completed',
      message: `${taskType} task completed successfully`,
      data: { taskType, result }
    }),

  failed: (scanId: string, agentId: string, taskId: string, taskType: string, error: string) =>
    logAudit({
      scanId,
      agentId,
      taskId,
      eventType: 'TASK_FAILED',
      severity: 'ERROR',
      title: 'Task Failed',
      message: `${taskType} task failed: ${error}`,
      data: { taskType, error }
    })
};

/**
 * Log tool execution events
 */
export const auditTool = {
  executed: (scanId: string, agentId: string, taskId: string, tool: string, command: string, result: any) =>
    logAudit({
      scanId,
      agentId,
      taskId,
      eventType: 'TOOL_EXECUTION',
      severity: 'INFO',
      title: 'Tool Executed',
      message: `Executed ${tool}: ${command}`,
      data: { tool, command, result }
    })
};

/**
 * Log LLM interaction events
 */
export const auditLLM = {
  interaction: (scanId: string, agentId: string, prompt: string, response: string, model: string) =>
    logAudit({
      scanId,
      agentId,
      eventType: 'LLM_INTERACTION',
      severity: 'DEBUG',
      title: 'LLM Interaction',
      message: `Model: ${model}`,
      data: { prompt, response, model }
    })
};

/**
 * Log finding creation events
 */
export const auditFinding = {
  created: (scanId: string, taskId: string, title: string, severity: string, data?: Record<string, any>) =>
    logAudit({
      scanId,
      taskId,
      eventType: 'FINDING_CREATED',
      severity: 'WARNING',
      title: 'Finding Created',
      message: `${severity}: ${title}`,
      data: { severity, ...data }
    })
};

/**
 * Log general errors
 */
export const auditError = {
  occurred: (scanId: string | undefined, title: string, error: string, data?: Record<string, any>) =>
    logAudit({
      scanId,
      eventType: 'ERROR_OCCURRED',
      severity: 'ERROR',
      title,
      message: error,
      data
    })
};
