/**
 * Nikto Wrapper - Web Server Vulnerability Scanner
 *
 * Wraps the Nikto web vulnerability scanner for comprehensive web server testing
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

// Validation schema
const niktoScanSchema = z.object({
  target: z.string().url('Invalid URL'),
  port: z.number().min(1).max(65535).optional().default(80),
  ssl: z.boolean().optional().default(false),
  timeout: z.number().min(10).max(3600).optional().default(600), // 10 seconds to 1 hour
  tuning: z.enum(['1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'x']).optional(),
});

export type NiktoScanParams = z.infer<typeof niktoScanSchema>;

export interface NiktoFinding {
  id: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  url: string;
  message: string;
  osvdbId?: string;
  method?: string;
}

export interface NiktoScanResult {
  success: boolean;
  target: string;
  findings: NiktoFinding[];
  scanStats?: {
    duration: number;
    itemsTested: number;
    endTime: string;
  };
  rawOutput: string;
  error?: string;
}

export class NiktoWrapper {
  private readonly NIKTO_PATH = '/usr/bin/nikto';
  private readonly MAX_TIMEOUT = 3600; // 1 hour max

  /**
   * Execute Nikto scan
   */
  async scan(params: NiktoScanParams): Promise<NiktoScanResult> {
    // Validate input
    const validated = niktoScanSchema.parse(params);

    logger.info('Starting Nikto scan', {
      target: validated.target,
      port: validated.port,
      ssl: validated.ssl,
    });

    try {
      // Build nikto command
      const niktoCommand = this.buildNiktoCommand(validated);

      logger.debug('Executing nikto command', { command: niktoCommand });

      // Execute with timeout
      const { stdout, stderr } = await execAsync(niktoCommand, {
        timeout: validated.timeout * 1000,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      if (stderr) {
        logger.warn('Nikto stderr output', { stderr });
      }

      // Parse output
      const result = this.parseNiktoOutput(stdout, validated.target);

      logger.info('Nikto scan completed', {
        target: validated.target,
        findingsCount: result.findings.length,
      });

      return {
        ...result,
        success: true,
        rawOutput: stdout,
      };
    } catch (error: any) {
      logger.error('Nikto scan failed', {
        target: validated.target,
        error: error.message,
        code: error.code,
      });

      // Handle specific error cases
      if (error.killed) {
        return {
          success: false,
          target: validated.target,
          findings: [],
          rawOutput: error.stdout || '',
          error: `Nikto scan timed out after ${validated.timeout} seconds`,
        };
      }

      if (error.code === 'ENOENT') {
        return {
          success: false,
          target: validated.target,
          findings: [],
          rawOutput: '',
          error: 'Nikto binary not found. Ensure nikto is installed.',
        };
      }

      return {
        success: false,
        target: validated.target,
        findings: [],
        rawOutput: error.stdout || '',
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Build nikto command
   */
  private buildNiktoCommand(params: NiktoScanParams): string {
    const args: string[] = [this.NIKTO_PATH];

    // Target host
    const urlObj = new URL(params.target);
    args.push('-h', urlObj.hostname);

    // Port
    args.push('-p', params.port.toString());

    // SSL
    if (params.ssl || urlObj.protocol === 'https:') {
      args.push('-ssl');
    }

    // Tuning (test types)
    if (params.tuning) {
      args.push('-Tuning', params.tuning);
    }

    // Output format (JSON would be ideal but not all versions support it)
    args.push('-Format', 'txt');

    // Additional options
    args.push('-nointeractive'); // No prompts
    args.push('-maxtime', params.timeout.toString()); // Max scan time

    return args.join(' ');
  }

  /**
   * Parse Nikto text output
   */
  private parseNiktoOutput(
    output: string,
    target: string
  ): Omit<NiktoScanResult, 'success' | 'rawOutput'> {
    const findings: NiktoFinding[] = [];
    const lines = output.split('\n');

    let itemsTested = 0;
    let duration = 0;
    let endTime = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Parse findings (lines starting with +)
      if (trimmed.startsWith('+')) {
        const finding = this.parseFindingLine(trimmed, target);
        if (finding) {
          findings.push(finding);
        }
      }

      // Parse scan stats
      if (trimmed.includes('items checked:')) {
        const match = trimmed.match(/(\d+) items checked/);
        if (match) {
          itemsTested = parseInt(match[1], 10);
        }
      }

      if (trimmed.includes('End Time:')) {
        const match = trimmed.match(/End Time:\s+(.+)/);
        if (match) {
          endTime = match[1].trim();
        }
      }

      if (trimmed.includes('seconds')) {
        const match = trimmed.match(/(\d+) seconds/);
        if (match) {
          duration = parseInt(match[1], 10);
        }
      }
    }

    return {
      target,
      findings,
      scanStats: itemsTested > 0 ? { duration, itemsTested, endTime } : undefined,
    };
  }

  /**
   * Parse a single finding line
   */
  private parseFindingLine(line: string, target: string): NiktoFinding | null {
    // Remove leading '+'
    let content = line.substring(1).trim();

    // Skip non-finding lines
    if (
      !content ||
      content.startsWith('Target') ||
      content.startsWith('-') ||
      content.startsWith('Nikto')
    ) {
      return null;
    }

    // Extract OSVDB ID if present
    let osvdbId: string | undefined;
    const osvdbMatch = content.match(/OSVDB-(\d+)/);
    if (osvdbMatch) {
      osvdbId = osvdbMatch[1];
    }

    // Determine severity based on keywords
    let severity: NiktoFinding['severity'] = 'INFO';
    const lowerContent = content.toLowerCase();

    if (
      lowerContent.includes('vulnerability') ||
      lowerContent.includes('exploit') ||
      lowerContent.includes('injection') ||
      lowerContent.includes('rce') ||
      lowerContent.includes('remote code')
    ) {
      severity = 'CRITICAL';
    } else if (
      lowerContent.includes('xss') ||
      lowerContent.includes('csrf') ||
      lowerContent.includes('sql') ||
      lowerContent.includes('authentication bypass') ||
      lowerContent.includes('path traversal')
    ) {
      severity = 'HIGH';
    } else if (
      lowerContent.includes('outdated') ||
      lowerContent.includes('deprecated') ||
      lowerContent.includes('misconfiguration') ||
      lowerContent.includes('weak')
    ) {
      severity = 'MEDIUM';
    } else if (
      lowerContent.includes('information disclosure') ||
      lowerContent.includes('banner') ||
      lowerContent.includes('header')
    ) {
      severity = 'LOW';
    }

    return {
      id: `nikto-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      severity,
      url: target,
      message: content,
      osvdbId,
    };
  }

  /**
   * Quick vulnerability scan (common checks)
   */
  async quickScan(url: string): Promise<NiktoScanResult> {
    const urlObj = new URL(url);
    return this.scan({
      target: url,
      port: urlObj.port ? parseInt(urlObj.port, 10) : urlObj.protocol === 'https:' ? 443 : 80,
      ssl: urlObj.protocol === 'https:',
      timeout: 300, // 5 minutes
      tuning: '1', // Interesting files
    });
  }

  /**
   * Full comprehensive scan
   */
  async fullScan(url: string): Promise<NiktoScanResult> {
    const urlObj = new URL(url);
    return this.scan({
      target: url,
      port: urlObj.port ? parseInt(urlObj.port, 10) : urlObj.protocol === 'https:' ? 443 : 80,
      ssl: urlObj.protocol === 'https:',
      timeout: 1800, // 30 minutes
    });
  }

  /**
   * Check if Nikto is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('nikto -Version', {
        timeout: 5000,
      });
      return stdout.includes('Nikto');
    } catch {
      return false;
    }
  }

  /**
   * Get Nikto version
   */
  async getVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('nikto -Version', {
        timeout: 5000,
      });
      const match = stdout.match(/Nikto v([0-9.]+)/);
      return match ? match[1] : 'unknown';
    } catch {
      return 'unknown';
    }
  }
}

// Export singleton instance
export const niktoWrapper = new NiktoWrapper();
