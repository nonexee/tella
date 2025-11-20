/**
 * Audit Logger - Centralized logging for scan execution events
 *
 * Tracks all AI decisions, tool executions, and scan progress
 * for transparency and debugging.
 */

import { prisma } from './prisma.js';
import { logger } from './logger.js';
import type { AuditEventType, AuditSeverity } from '@prisma/client';
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

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
 * Log an audit event to the database AND console (Hacktron-style)
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    // Write to database
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

    // ALSO write to console with Hacktron-style formatting
    formatConsoleOutput(params);

    // Write to scan-specific log file if scanId is provided
    if (params.scanId) {
      writeScanLog(params.scanId, params);
    }
  } catch (error: any) {
    // Don't let audit logging failures break the application
    logger.error('Failed to create audit log:', error);
  }
}

// Track if scan has started (prevent duplicate banners)
const scanStarted = new Set<string>();

/**
 * Write event to scan-specific log file
 */
function writeScanLog(scanId: string, params: AuditLogParams): void {
  try {
    const scansDir = '/app/logs/scans';
    const scanDir = join(scansDir, scanId);

    // Create scan directory if it doesn't exist
    if (!existsSync(scansDir)) {
      mkdirSync(scansDir, { recursive: true });
    }
    if (!existsSync(scanDir)) {
      mkdirSync(scanDir, { recursive: true });
    }

    const logFile = join(scanDir, 'console.log');

    // Clean timestamp: HH:MM:SS
    const now = new Date();
    const timestamp = now.toTimeString().split(' ')[0];

    // Format log entry (plain text, no ANSI codes, minimal styling)
    let logEntry = '';

    switch (params.eventType) {
      case 'SCAN_STARTED':
        // Only log scan start once
        if (scanStarted.has(scanId)) return;
        scanStarted.add(scanId);
        logEntry = `[${timestamp}] Scan started\n\n`;
        break;

      case 'AGENT_REASONING':
        // Extract just the thought content, remove "◇ Thought (Iteration X)"
        const thought = params.data?.thought || params.message;
        // Clean up the thought - remove iteration markers
        const cleanThought = thought.replace(/^◇ Thought \(Iteration \d+\)\s*\n?\s*/i, '');
        logEntry = `[${timestamp}] → ${cleanThought}\n\n`;
        break;

      case 'TOOL_EXECUTION':
        const tool = params.data?.tool || 'unknown';
        const command = params.data?.command || '';
        // Show tool name only, parameters on next line if present
        if (command && command !== tool) {
          logEntry = `[${timestamp}] ${tool}\n    ${command}\n`;
        } else {
          logEntry = `[${timestamp}] ${tool}\n`;
        }
        break;

      case 'TASK_STARTED':
        logEntry = `\n[${timestamp}] ${params.message}\n`;
        break;

      case 'TASK_COMPLETED':
        logEntry = `[${timestamp}] ${params.message}\n`;
        break;

      case 'TASK_FAILED':
        logEntry = `[${timestamp}] failed: ${params.message}\n`;
        break;

      case 'SCAN_COMPLETED':
        logEntry = `\n[${timestamp}] Scan completed\n`;
        break;

      case 'DECISION_MADE':
        logEntry = `[${timestamp}] decision: ${params.title}\n    ${params.message}\n`;
        break;

      case 'ERROR_OCCURRED':
        logEntry = `[${timestamp}] error: ${params.message}\n`;
        break;

      case 'FINDING_CREATED':
        logEntry = `[${timestamp}] finding: ${params.title}\n`;
        break;

      case 'PROGRESS_UPDATE':
        // Skip progress updates in console log (too noisy)
        return;

      default:
        // Skip other noisy events
        if (params.severity === 'DEBUG') return;
        logEntry = `[${timestamp}] ${params.message}\n`;
    }

    // Append to log file
    appendFileSync(logFile, logEntry, 'utf8');
  } catch (error) {
    // Don't crash if file writing fails
    logger.error('Failed to write scan log file:', error);
  }
}

/**
 * Format and output Hacktron-style console messages
 * Also saves to scan-specific log file
 */
function formatConsoleOutput(params: AuditLogParams): void {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  const fullTimestamp = new Date().toISOString();

  // Color codes for terminal output
  const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m'
  };

  let consoleOutput = '';
  let fileOutput = '';

  switch (params.eventType) {
    case 'SCAN_STARTED':
      // Only show once
      if (scanStarted.has(params.scanId || '')) return;
      if (params.scanId) scanStarted.add(params.scanId);
      console.log(`${colors.dim}${timestamp}${colors.reset} scan started`);
      break;

    case 'AGENT_REASONING':
      // Clean thought output - just "→ thought"
      const thought = params.data?.thought || params.message;
      const cleanThought = thought.replace(/^◇ Thought \(Iteration \d+\)\s*\n?\s*/i, '');
      console.log(`${colors.dim}${timestamp}${colors.reset} ${colors.cyan}→${colors.reset} ${colors.dim}${cleanThought}${colors.reset}`);
      break;

    case 'TOOL_EXECUTION':
      // Just show tool name
      const tool = params.data?.tool || 'unknown';
      console.log(`${colors.dim}${timestamp}${colors.reset} ${tool}`);
      break;

    case 'TASK_STARTED':
      console.log(`${colors.dim}${timestamp}${colors.reset} ${params.message.toLowerCase()}`);
      break;

    case 'TASK_COMPLETED':
      console.log(`${colors.dim}${timestamp}${colors.reset} ${colors.green}${params.message.toLowerCase()}${colors.reset}`);
      break;

    case 'TASK_FAILED':
      console.log(`${colors.dim}${timestamp}${colors.reset} ${colors.red}failed:${colors.reset} ${params.message}`);
      break;

    case 'SCAN_COMPLETED':
      console.log(`${colors.dim}${timestamp}${colors.reset} ${colors.green}scan completed${colors.reset}`);
      break;

    case 'DECISION_MADE':
      console.log(`${colors.dim}${timestamp}${colors.reset} ${colors.yellow}decision:${colors.reset} ${params.title}`);
      break;

    case 'ERROR_OCCURRED':
      console.log(`${colors.dim}${timestamp}${colors.reset} ${colors.red}error:${colors.reset} ${params.message}`);
      break;

    case 'FINDING_CREATED':
      console.log(`${colors.dim}${timestamp}${colors.reset} ${colors.yellow}finding:${colors.reset} ${params.title}`);
      break;

    case 'PROGRESS_UPDATE':
      // Skip progress spam
      break;

    default:
      // Skip debug/verbose events
      if (params.severity === 'DEBUG') break;
      if (params.eventType === 'AGENT_CREATED') break; // Skip agent created events
      break;
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
