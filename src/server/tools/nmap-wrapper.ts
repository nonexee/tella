/**
 * Nmap Wrapper - Professional Port Scanning with Nmap
 *
 * This module wraps the Nmap binary for advanced port scanning capabilities.
 * Provides XML parsing and structured output for AI agent consumption.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import { parseStringPromise } from 'xml2js';
import { logger } from '../utils/logger.js';
import type { PortScanResult } from './security-tools.js';

const execAsync = promisify(exec);

// Validation schema
const nmapScanSchema = z.object({
  target: z.string().min(1, 'Target is required').refine(
    (val) => /^[a-zA-Z0-9.-]+$/.test(val) || /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(val),
    'Invalid target format (domain or IP)'
  ),
  ports: z.string().optional().default('1-1000'),
  scanType: z.enum(['syn', 'connect', 'stealth', 'version', 'os']).optional().default('connect'),
  timeout: z.number().min(1000).max(300000).optional().default(60000) // 1 second to 5 minutes
});

export type NmapScanParams = z.infer<typeof nmapScanSchema>;

export interface NmapHost {
  ip: string;
  hostname?: string;
  os?: string;
  ports: Array<{
    port: number;
    protocol: string;
    state: 'open' | 'closed' | 'filtered';
    service: string;
    version?: string;
    product?: string;
  }>;
}

export class NmapWrapper {
  private readonly NMAP_PATH = '/usr/bin/nmap';
  private readonly MAX_TIMEOUT = 300000; // 5 minutes max

  /**
   * Execute Nmap scan and return structured results
   */
  async scan(params: NmapScanParams): Promise<PortScanResult> {
    // Validate input
    const validated = nmapScanSchema.parse(params);

    logger.info('Starting Nmap scan', {
      target: validated.target,
      ports: validated.ports,
      scanType: validated.scanType
    });

    try {
      // Build nmap command
      const nmapCommand = this.buildNmapCommand(validated);

      logger.debug('Executing nmap command', { command: nmapCommand });

      // Execute with timeout
      const { stdout, stderr } = await execAsync(nmapCommand, {
        timeout: validated.timeout,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large scans
      });

      if (stderr && !stderr.includes('Warning')) {
        logger.warn('Nmap stderr output', { stderr });
      }

      // Parse XML output
      const result = await this.parseNmapXML(stdout);

      logger.info('Nmap scan completed', {
        target: validated.target,
        portsFound: result.openPorts.length
      });

      return result;

    } catch (error: any) {
      logger.error('Nmap scan failed', {
        target: validated.target,
        error: error.message,
        code: error.code
      });

      // Handle specific error cases
      if (error.killed) {
        throw new Error(`Nmap scan timed out after ${validated.timeout}ms`);
      }

      if (error.code === 'ENOENT') {
        throw new Error('Nmap binary not found. Ensure nmap is installed.');
      }

      throw new Error(`Nmap scan failed: ${error.message}`);
    }
  }

  /**
   * Build nmap command with appropriate flags
   */
  private buildNmapCommand(params: NmapScanParams): string {
    const args: string[] = [this.NMAP_PATH];

    // Scan type flags
    switch (params.scanType) {
      case 'syn':
        args.push('-sS'); // SYN scan (requires root)
        break;
      case 'connect':
        args.push('-sT'); // TCP connect scan (no root needed)
        break;
      case 'stealth':
        args.push('-sS', '-T2'); // Slow stealth scan
        break;
      case 'version':
        args.push('-sV'); // Version detection
        break;
      case 'os':
        args.push('-O'); // OS detection
        break;
    }

    // Port specification
    if (params.ports) {
      args.push('-p', params.ports);
    }

    // Additional flags
    args.push(
      '-oX', '-', // Output XML to stdout
      '--host-timeout', '120s', // Max time per host
      '--max-retries', '2', // Limit retries
      '-Pn', // Skip ping (treat all hosts as online)
      params.target
    );

    return args.join(' ');
  }

  /**
   * Parse Nmap XML output into structured format
   */
  private async parseNmapXML(xmlOutput: string): Promise<PortScanResult> {
    try {
      const parsed = await parseStringPromise(xmlOutput, {
        explicitArray: false,
        mergeAttrs: true
      });

      if (!parsed.nmaprun || !parsed.nmaprun.host) {
        // No hosts found
        return {
          target: 'unknown',
          openPorts: [],
          hostname: undefined,
          os: undefined
        };
      }

      const host = Array.isArray(parsed.nmaprun.host)
        ? parsed.nmaprun.host[0]
        : parsed.nmaprun.host;

      // Extract target IP
      const address = Array.isArray(host.address)
        ? host.address.find((a: any) => a.addrtype === 'ipv4')
        : host.address;
      const target = address?.addr || 'unknown';

      // Extract hostname
      const hostname = host.hostnames?.hostname?.name;

      // Extract OS detection
      let os: string | undefined;
      if (host.os?.osmatch) {
        const osmatch = Array.isArray(host.os.osmatch)
          ? host.os.osmatch[0]
          : host.os.osmatch;
        os = osmatch.name;
      }

      // Extract ports
      const openPorts = this.extractPorts(host);

      return {
        target,
        openPorts,
        hostname,
        os
      };

    } catch (error: any) {
      logger.error('Failed to parse Nmap XML', { error: error.message });
      throw new Error(`Failed to parse Nmap output: ${error.message}`);
    }
  }

  /**
   * Extract port information from parsed XML
   */
  private extractPorts(host: any): Array<{
    port: number;
    service: string;
    version?: string;
    state: 'open' | 'closed' | 'filtered';
  }> {
    if (!host.ports?.port) {
      return [];
    }

    const ports = Array.isArray(host.ports.port)
      ? host.ports.port
      : [host.ports.port];

    return ports
      .filter((p: any) => p.state?.state === 'open')
      .map((p: any) => {
        const service = p.service?.name || 'unknown';
        const version = p.service?.product && p.service?.version
          ? `${p.service.product} ${p.service.version}`
          : p.service?.product || undefined;

        return {
          port: parseInt(p.portid, 10),
          service,
          version,
          state: p.state.state as 'open' | 'closed' | 'filtered'
        };
      });
  }

  /**
   * Quick scan of most common ports (fast)
   */
  async quickScan(target: string): Promise<PortScanResult> {
    return this.scan({
      target,
      ports: '21,22,23,25,53,80,110,143,443,445,3306,3389,5432,5900,8080,8443',
      scanType: 'connect',
      timeout: 30000 // 30 seconds
    });
  }

  /**
   * Full comprehensive scan (slow)
   */
  async fullScan(target: string): Promise<PortScanResult> {
    return this.scan({
      target,
      ports: '1-65535',
      scanType: 'version',
      timeout: 300000 // 5 minutes
    });
  }

  /**
   * Service version detection scan
   */
  async versionScan(target: string, ports?: string): Promise<PortScanResult> {
    return this.scan({
      target,
      ports: ports || '1-1000',
      scanType: 'version',
      timeout: 120000 // 2 minutes
    });
  }

  /**
   * Check if Nmap is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('nmap --version', {
        timeout: 5000
      });
      return stdout.includes('Nmap version');
    } catch {
      return false;
    }
  }

  /**
   * Get Nmap version
   */
  async getVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('nmap --version', {
        timeout: 5000
      });
      const match = stdout.match(/Nmap version ([0-9.]+)/);
      return match ? match[1] : 'unknown';
    } catch {
      return 'unknown';
    }
  }
}

// Export singleton instance
export const nmapWrapper = new NmapWrapper();
