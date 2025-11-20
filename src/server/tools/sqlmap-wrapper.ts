/**
 * SQLmap Wrapper - SQL Injection Testing Tool
 *
 * Wraps SQLmap for automated SQL injection detection and exploitation
 * IMPORTANT: Only use on authorized targets
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

// Validation schema
const sqlmapScanSchema = z.object({
  target: z.string().url('Invalid URL'),
  method: z.enum(['GET', 'POST']).optional().default('GET'),
  data: z.string().optional(), // POST data
  cookie: z.string().optional(), // Session cookie
  level: z.number().min(1).max(5).optional().default(1), // Test thoroughness
  risk: z.number().min(1).max(3).optional().default(1), // Risk level
  timeout: z.number().min(30).max(1800).optional().default(300), // 30s to 30min
  technique: z.string().optional(), // B, E, U, S, T, Q (boolean, error, union, stacked, time, query)
  dbms: z.enum(['MySQL', 'PostgreSQL', 'Oracle', 'Microsoft SQL Server', 'SQLite']).optional(),
});

export type SQLmapScanParams = z.infer<typeof sqlmapScanSchema>;

export interface SQLInjectionVulnerability {
  parameter: string;
  injectionType: string;
  payload: string;
  dbms?: string;
  title: string;
}

export interface SQLmapScanResult {
  success: boolean;
  target: string;
  vulnerable: boolean;
  vulnerabilities: SQLInjectionVulnerability[];
  databases?: string[];
  tables?: string[];
  rawOutput: string;
  error?: string;
}

export class SQLmapWrapper {
  private readonly SQLMAP_PATH = '/usr/local/bin/sqlmap';
  private readonly MAX_TIMEOUT = 1800; // 30 minutes max

  /**
   * Execute SQLmap scan
   */
  async scan(params: SQLmapScanParams): Promise<SQLmapScanResult> {
    // Validate input
    const validated = sqlmapScanSchema.parse(params);

    logger.info('Starting SQLmap scan', {
      target: validated.target,
      method: validated.method,
      level: validated.level,
      risk: validated.risk,
    });

    try {
      // Build sqlmap command
      const sqlmapCommand = this.buildSQLmapCommand(validated);

      logger.debug('Executing sqlmap command', { command: sqlmapCommand });

      // Execute with timeout
      const { stdout, stderr } = await execAsync(sqlmapCommand, {
        timeout: validated.timeout * 1000,
        maxBuffer: 20 * 1024 * 1024, // 20MB buffer
      });

      if (stderr) {
        logger.warn('SQLmap stderr output', { stderr });
      }

      // Parse output
      const result = this.parseSQLmapOutput(stdout, validated.target);

      logger.info('SQLmap scan completed', {
        target: validated.target,
        vulnerable: result.vulnerable,
        vulnCount: result.vulnerabilities.length,
      });

      return {
        ...result,
        success: true,
        rawOutput: stdout,
      };
    } catch (error: any) {
      logger.error('SQLmap scan failed', {
        target: validated.target,
        error: error.message,
        code: error.code,
      });

      // Handle specific error cases
      if (error.killed) {
        return {
          success: false,
          target: validated.target,
          vulnerable: false,
          vulnerabilities: [],
          rawOutput: error.stdout || '',
          error: `SQLmap scan timed out after ${validated.timeout} seconds`,
        };
      }

      if (error.code === 'ENOENT') {
        return {
          success: false,
          target: validated.target,
          vulnerable: false,
          vulnerabilities: [],
          rawOutput: '',
          error: 'SQLmap binary not found. Ensure sqlmap is installed.',
        };
      }

      return {
        success: false,
        target: validated.target,
        vulnerable: false,
        vulnerabilities: [],
        rawOutput: error.stdout || '',
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Build sqlmap command
   */
  private buildSQLmapCommand(params: SQLmapScanParams): string {
    const args: string[] = [this.SQLMAP_PATH];

    // Target URL
    args.push('-u', `"${params.target}"`);

    // HTTP method and data
    if (params.method === 'POST' && params.data) {
      args.push('--data', `"${params.data}"`);
    }

    // Cookie
    if (params.cookie) {
      args.push('--cookie', `"${params.cookie}"`);
    }

    // Test level and risk
    args.push('--level', params.level.toString());
    args.push('--risk', params.risk.toString());

    // Technique
    if (params.technique) {
      args.push('--technique', params.technique);
    }

    // DBMS hint
    if (params.dbms) {
      args.push('--dbms', `"${params.dbms}"`);
    }

    // Additional safety options
    args.push('--batch'); // Never ask for user input
    args.push('--threads', '4'); // Use 4 threads
    args.push('--random-agent'); // Random user agent
    args.push('--timeout', '30'); // Per-request timeout
    args.push('--retries', '2'); // Retry failed requests
    args.push('--skip-waf'); // Skip WAF detection (faster)

    // Output options
    args.push('--flush-session'); // Don't use cached session
    args.push('--fresh-queries'); // Ignore cached results

    // Detection options
    args.push('--parse-errors'); // Parse DBMS errors

    return args.join(' ');
  }

  /**
   * Parse SQLmap output
   */
  private parseSQLmapOutput(
    output: string,
    target: string
  ): Omit<SQLmapScanResult, 'success' | 'rawOutput'> {
    const vulnerabilities: SQLInjectionVulnerability[] = [];
    let vulnerable = false;

    const lines = output.split('\n');

    // Look for injection indicators
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Detection patterns
      if (line.includes('Parameter:') && line.includes('is vulnerable')) {
        vulnerable = true;

        // Extract parameter name
        const paramMatch = line.match(/Parameter:\s+(\w+)/);
        const parameter = paramMatch ? paramMatch[1] : 'unknown';

        // Look for injection details in following lines
        let injectionType = 'SQL Injection';
        let payload = '';
        let dbms = '';
        let title = '';

        for (let j = i; j < Math.min(i + 10, lines.length); j++) {
          const nextLine = lines[j].trim();

          if (nextLine.includes('Type:')) {
            const typeMatch = nextLine.match(/Type:\s+(.+)/);
            if (typeMatch) {
              injectionType = typeMatch[1];
            }
          }

          if (nextLine.includes('Title:')) {
            const titleMatch = nextLine.match(/Title:\s+(.+)/);
            if (titleMatch) {
              title = titleMatch[1];
            }
          }

          if (nextLine.includes('Payload:')) {
            const payloadMatch = nextLine.match(/Payload:\s+(.+)/);
            if (payloadMatch) {
              payload = payloadMatch[1];
            }
          }

          if (nextLine.includes('back-end DBMS:')) {
            const dbmsMatch = nextLine.match(/back-end DBMS:\s+(.+)/);
            if (dbmsMatch) {
              dbms = dbmsMatch[1];
            }
          }
        }

        vulnerabilities.push({
          parameter,
          injectionType,
          payload,
          dbms: dbms || undefined,
          title: title || `SQL injection in ${parameter} parameter`,
        });
      }

      // Alternative detection pattern
      if (line.includes('injectable')) {
        vulnerable = true;
      }
    }

    // Extract database names if found
    let databases: string[] | undefined;
    const dbMatch = output.match(/available databases \[(\d+)\]:([\s\S]*?)(?:\n\n|\[)/);
    if (dbMatch) {
      const dbList = dbMatch[2].trim().split('\n');
      databases = dbList
        .map((db) => db.trim().replace(/^\[\*\]\s*/, ''))
        .filter((db) => db.length > 0);
    }

    return {
      target,
      vulnerable,
      vulnerabilities,
      databases,
    };
  }

  /**
   * Quick SQL injection test (safe, low risk)
   */
  async quickTest(url: string, method: 'GET' | 'POST' = 'GET', data?: string): Promise<SQLmapScanResult> {
    return this.scan({
      target: url,
      method,
      data,
      level: 1, // Basic tests only
      risk: 1, // Safe tests only
      timeout: 120, // 2 minutes
    });
  }

  /**
   * Thorough SQL injection scan (higher risk)
   */
  async thoroughScan(url: string, method: 'GET' | 'POST' = 'GET', data?: string): Promise<SQLmapScanResult> {
    return this.scan({
      target: url,
      method,
      data,
      level: 3, // More tests
      risk: 2, // Medium risk tests
      timeout: 600, // 10 minutes
    });
  }

  /**
   * Check if SQLmap is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('sqlmap --version', {
        timeout: 5000,
      });
      return stdout.includes('sqlmap');
    } catch {
      return false;
    }
  }

  /**
   * Get SQLmap version
   */
  async getVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('sqlmap --version', {
        timeout: 5000,
      });
      const match = stdout.match(/sqlmap\/([0-9.]+)/);
      return match ? match[1] : 'unknown';
    } catch {
      return 'unknown';
    }
  }
}

// Export singleton instance
export const sqlmapWrapper = new SQLmapWrapper();
