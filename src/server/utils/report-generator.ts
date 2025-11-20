/**
 * Report Generator - Export scan results to various formats
 *
 * Supports JSON, CSV, and PDF export formats
 */

import PDFDocument from 'pdfkit';
import { createWriteStream, promises as fs } from 'fs';
import { join } from 'path';
import { logger } from './logger.js';
import { prisma } from '../db/client.js';

export type ReportFormat = 'json' | 'csv' | 'pdf';

export interface ReportData {
  scan: {
    id: string;
    name: string;
    status: string;
    createdAt: Date;
    startedAt?: Date | null;
    completedAt?: Date | null;
    target: {
      name: string;
      url: string;
    };
    stats: {
      totalTasks: number;
      completedTasks: number;
      totalFindings: number;
      criticalFindings: number;
    };
  };
  findings: Array<{
    id: string;
    title: string;
    description: string;
    severity: string;
    type: string;
    status: string;
    cvss?: number | null;
    cveId?: string | null;
    evidence?: any;
    remediation?: string | null;
    createdAt: Date;
  }>;
  agents: Array<{
    id: string;
    type: string;
    role?: string | null;
    status: string;
  }>;
}

/**
 * Fetch comprehensive scan data for report generation
 */
export async function fetchScanData(scanId: string): Promise<ReportData> {
  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    include: {
      target: {
        select: {
          name: true,
          url: true,
        },
      },
      findings: {
        orderBy: [
          { severity: 'desc' },
          { createdAt: 'desc' },
        ],
      },
      agents: {
        select: {
          id: true,
          type: true,
          role: true,
          status: true,
        },
      },
    },
  });

  if (!scan) {
    throw new Error(`Scan ${scanId} not found`);
  }

  // Calculate stats
  const stats = {
    totalTasks: scan.totalTasks || 0,
    completedTasks: scan.completedTasks || 0,
    totalFindings: scan.findings.length,
    criticalFindings: scan.findings.filter((f) => f.severity === 'CRITICAL').length,
  };

  return {
    scan: {
      ...scan,
      stats,
    },
    findings: scan.findings,
    agents: scan.agents,
  };
}

/**
 * Generate JSON report
 */
export async function generateJSONReport(scanId: string): Promise<string> {
  logger.info(`Generating JSON report for scan ${scanId}`);

  const data = await fetchScanData(scanId);

  // Create reports directory if it doesn't exist
  const reportsDir = join(process.cwd(), 'tmp', 'reports');
  await fs.mkdir(reportsDir, { recursive: true });

  const filename = `scan-${scanId}-${Date.now()}.json`;
  const filepath = join(reportsDir, filename);

  // Write JSON file
  await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8');

  logger.info(`JSON report generated: ${filepath}`);
  return filename;
}

/**
 * Generate CSV report
 */
export async function generateCSVReport(scanId: string): Promise<string> {
  logger.info(`Generating CSV report for scan ${scanId}`);

  const data = await fetchScanData(scanId);

  // Create CSV header
  const headers = [
    'Finding ID',
    'Title',
    'Severity',
    'Type',
    'Status',
    'CVE ID',
    'CVSS Score',
    'Description',
    'Remediation',
    'Created At',
  ];

  // Create CSV rows
  const rows = data.findings.map((finding) => [
    finding.id,
    `"${finding.title.replace(/"/g, '""')}"`, // Escape quotes
    finding.severity,
    finding.type,
    finding.status,
    finding.cveId || '',
    finding.cvss?.toString() || '',
    `"${finding.description.replace(/"/g, '""')}"`,
    `"${(finding.remediation || '').replace(/"/g, '""')}"`,
    finding.createdAt.toISOString(),
  ]);

  // Combine header and rows
  const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

  // Create reports directory if it doesn't exist
  const reportsDir = join(process.cwd(), 'tmp', 'reports');
  await fs.mkdir(reportsDir, { recursive: true });

  const filename = `scan-${scanId}-${Date.now()}.csv`;
  const filepath = join(reportsDir, filename);

  // Write CSV file
  await fs.writeFile(filepath, csv, 'utf-8');

  logger.info(`CSV report generated: ${filepath}`);
  return filename;
}

/**
 * Generate PDF report
 */
export async function generatePDFReport(scanId: string): Promise<string> {
  logger.info(`Generating PDF report for scan ${scanId}`);

  const data = await fetchScanData(scanId);

  // Create reports directory if it doesn't exist
  const reportsDir = join(process.cwd(), 'tmp', 'reports');
  await fs.mkdir(reportsDir, { recursive: true });

  const filename = `scan-${scanId}-${Date.now()}.pdf`;
  const filepath = join(reportsDir, filename);

  // Create PDF document
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
  });

  // Pipe to file
  const stream = createWriteStream(filepath);
  doc.pipe(stream);

  // Add content
  addPDFHeader(doc, data);
  addPDFExecutiveSummary(doc, data);
  addPDFFindingsBySession(doc, data);
  addPDFAgentSummary(doc, data);
  addPDFFooter(doc);

  // Finalize PDF
  doc.end();

  // Wait for file to be written
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  logger.info(`PDF report generated: ${filepath}`);
  return filename;
}

/**
 * Add PDF header
 */
function addPDFHeader(doc: PDFKit.PDFDocument, data: ReportData) {
  doc
    .fontSize(24)
    .fillColor('#1a73e8')
    .text('Security Scan Report', { align: 'center' })
    .moveDown(0.5)
    .fontSize(12)
    .fillColor('#666')
    .text(`Generated by Tella AI Security Platform`, { align: 'center' })
    .text(`${new Date().toLocaleString()}`, { align: 'center' })
    .moveDown(2);

  // Scan information
  doc
    .fontSize(16)
    .fillColor('#000')
    .text('Scan Information', { underline: true })
    .moveDown(0.5)
    .fontSize(11);

  doc.fillColor('#333').text(`Scan Name: ${data.scan.name}`);
  doc.text(`Target: ${data.scan.target.name} (${data.scan.target.url})`);
  doc.text(`Status: ${data.scan.status}`);
  doc.text(`Started: ${data.scan.startedAt?.toLocaleString() || 'N/A'}`);
  doc.text(`Completed: ${data.scan.completedAt?.toLocaleString() || 'N/A'}`);

  doc.moveDown(2);
}

/**
 * Add executive summary
 */
function addPDFExecutiveSummary(doc: PDFKit.PDFDocument, data: ReportData) {
  doc
    .fontSize(16)
    .fillColor('#000')
    .text('Executive Summary', { underline: true })
    .moveDown(0.5)
    .fontSize(11);

  const { stats } = data.scan;
  const severityCounts = {
    CRITICAL: data.findings.filter((f) => f.severity === 'CRITICAL').length,
    HIGH: data.findings.filter((f) => f.severity === 'HIGH').length,
    MEDIUM: data.findings.filter((f) => f.severity === 'MEDIUM').length,
    LOW: data.findings.filter((f) => f.severity === 'LOW').length,
    INFO: data.findings.filter((f) => f.severity === 'INFO').length,
  };

  doc.fillColor('#333').text(`Total Findings: ${stats.totalFindings}`);
  doc.fillColor('#d32f2f').text(`  " Critical: ${severityCounts.CRITICAL}`);
  doc.fillColor('#f57c00').text(`  " High: ${severityCounts.HIGH}`);
  doc.fillColor('#fbc02d').text(`  " Medium: ${severityCounts.MEDIUM}`);
  doc.fillColor('#388e3c').text(`  " Low: ${severityCounts.LOW}`);
  doc.fillColor('#1976d2').text(`  " Info: ${severityCounts.INFO}`);

  doc.moveDown(0.5);
  doc.fillColor('#333').text(`Tasks Completed: ${stats.completedTasks}/${stats.totalTasks}`);
  doc.text(`Agents Deployed: ${data.agents.length}`);

  doc.moveDown(2);
}

/**
 * Add findings details
 */
function addPDFFindingsBySession(doc: PDFKit.PDFDocument, data: ReportData) {
  doc
    .fontSize(16)
    .fillColor('#000')
    .text('Findings Details', { underline: true })
    .moveDown(0.5);

  if (data.findings.length === 0) {
    doc.fontSize(11).fillColor('#666').text('No findings detected.').moveDown(2);
    return;
  }

  for (const finding of data.findings) {
    // Check if we need a new page
    if (doc.y > 700) {
      doc.addPage();
    }

    // Finding title with severity color
    const severityColor =
      finding.severity === 'CRITICAL'
        ? '#d32f2f'
        : finding.severity === 'HIGH'
        ? '#f57c00'
        : finding.severity === 'MEDIUM'
        ? '#fbc02d'
        : finding.severity === 'LOW'
        ? '#388e3c'
        : '#1976d2';

    doc.fontSize(12).fillColor(severityColor).text(`[${finding.severity}] ${finding.title}`);

    doc.fontSize(10).fillColor('#666');
    doc.text(`Type: ${finding.type} | Status: ${finding.status}`);

    if (finding.cveId) {
      doc.text(`CVE: ${finding.cveId} | CVSS: ${finding.cvss || 'N/A'}`);
    }

    doc.moveDown(0.3);
    doc.fillColor('#333').text(`Description: ${finding.description}`, {
      width: 500,
    });

    if (finding.remediation) {
      doc.moveDown(0.3);
      doc.fillColor('#1565c0').text(`Remediation: ${finding.remediation}`, {
        width: 500,
      });
    }

    doc.moveDown(1);
  }

  doc.moveDown(1);
}

/**
 * Add agent summary
 */
function addPDFAgentSummary(doc: PDFKit.PDFDocument, data: ReportData) {
  if (doc.y > 650) {
    doc.addPage();
  }

  doc
    .fontSize(16)
    .fillColor('#000')
    .text('Agent Activity', { underline: true })
    .moveDown(0.5)
    .fontSize(10);

  for (const agent of data.agents) {
    doc
      .fillColor('#333')
      .text(
        `${agent.type}${agent.role ? ` (${agent.role})` : ''} - Status: ${agent.status}`
      );
  }

  doc.moveDown(2);
}

/**
 * Add PDF footer
 */
function addPDFFooter(doc: PDFKit.PDFDocument) {
  const pageCount = (doc as any).bufferedPageRange().count;

  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);

    doc
      .fontSize(8)
      .fillColor('#999')
      .text(
        `Page ${i + 1} of ${pageCount} | Tella AI Security Platform`,
        50,
        doc.page.height - 50,
        { align: 'center' }
      );
  }
}

/**
 * Generate report in specified format
 */
export async function generateReport(
  scanId: string,
  format: ReportFormat
): Promise<string> {
  switch (format) {
    case 'json':
      return generateJSONReport(scanId);
    case 'csv':
      return generateCSVReport(scanId);
    case 'pdf':
      return generatePDFReport(scanId);
    default:
      throw new Error(`Unsupported report format: ${format}`);
  }
}

/**
 * Clean up old report files (older than 1 hour)
 */
export async function cleanupOldReports(): Promise<void> {
  const reportsDir = join(process.cwd(), 'tmp', 'reports');

  try {
    const files = await fs.readdir(reportsDir);
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;

    for (const file of files) {
      const filepath = join(reportsDir, file);
      const stats = await fs.stat(filepath);

      if (now - stats.mtimeMs > ONE_HOUR) {
        await fs.unlink(filepath);
        logger.info(`Deleted old report: ${file}`);
      }
    }
  } catch (error: any) {
    logger.error('Failed to cleanup old reports:', error.message);
  }
}
