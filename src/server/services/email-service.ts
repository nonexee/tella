/**
 * Email Service
 *
 * Handles email sending for notifications with retry logic and queue management.
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { logger } from '../utils/logger.js';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface ScanCompletedData {
  scanId: string;
  scanName: string;
  targetName: string;
  targetUrl: string;
  completedAt: Date;
  totalFindings: number;
  criticalFindings: number;
  highFindings: number;
  mediumFindings: number;
  lowFindings: number;
  duration?: string;
}

export interface CriticalFindingData {
  findingId: string;
  title: string;
  description: string;
  severity: string;
  category: string;
  scanName: string;
  targetName: string;
  targetUrl: string;
  cvss?: number;
}

export interface ScanFailedData {
  scanId: string;
  scanName: string;
  targetName: string;
  targetUrl: string;
  error: string;
  failedAt: Date;
}

export class EmailService {
  private transporter: Transporter | null = null;
  private enabled: boolean = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize email transporter with SMTP configuration
   */
  private initialize(): void {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    // Email is optional - only enable if all SMTP settings are provided
    if (!smtpHost || !smtpUser || !smtpPass) {
      logger.info('Email service disabled - SMTP configuration not provided');
      this.enabled = false;
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465, // true for 465, false for other ports
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });

      this.enabled = true;
      logger.info('Email service initialized successfully', {
        host: smtpHost,
        port: smtpPort,
        user: smtpUser
      });
    } catch (error) {
      logger.error('Failed to initialize email service:', error);
      this.enabled = false;
    }
  }

  /**
   * Check if email service is enabled
   */
  isEnabled(): boolean {
    return this.enabled && this.transporter !== null;
  }

  /**
   * Send email with retry logic
   */
  async sendEmail(options: EmailOptions, retries: number = 3): Promise<boolean> {
    if (!this.isEnabled()) {
      logger.debug('Email service not enabled, skipping email send');
      return false;
    }

    const from = process.env.SMTP_FROM || 'Tella AI Security <noreply@tella.ai>';

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.transporter!.sendMail({
          from,
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text || this.stripHtml(options.html)
        });

        logger.info('Email sent successfully', {
          to: options.to,
          subject: options.subject,
          attempt
        });

        return true;
      } catch (error: any) {
        logger.error(`Email send failed (attempt ${attempt}/${retries}):`, {
          to: options.to,
          subject: options.subject,
          error: error.message
        });

        if (attempt < retries) {
          // Wait before retry with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return false;
  }

  /**
   * Send scan completed notification
   */
  async sendScanCompletedEmail(userEmail: string, data: ScanCompletedData): Promise<boolean> {
    // Escape all user-provided data
    const safeData = {
      ...data,
      scanName: this.escapeHtml(data.scanName),
      targetName: this.escapeHtml(data.targetName),
      targetUrl: this.escapeHtml(data.targetUrl),
      duration: data.duration ? this.escapeHtml(data.duration) : undefined
    };

    const subject = `[Tella AI] Scan Completed: ${data.scanName}`;
    const html = this.generateScanCompletedHtml(safeData);

    return this.sendEmail({ to: userEmail, subject, html });
  }

  /**
   * Send critical finding notification
   */
  async sendCriticalFindingEmail(userEmail: string, data: CriticalFindingData): Promise<boolean> {
    // Escape all user-provided data
    const safeData = {
      ...data,
      title: this.escapeHtml(data.title),
      description: this.escapeHtml(data.description),
      severity: this.escapeHtml(data.severity),
      category: this.escapeHtml(data.category),
      scanName: this.escapeHtml(data.scanName),
      targetName: this.escapeHtml(data.targetName),
      targetUrl: this.escapeHtml(data.targetUrl)
    };

    const subject = `[Tella AI] 🚨 Critical Finding: ${data.title}`;
    const html = this.generateCriticalFindingHtml(safeData);

    return this.sendEmail({ to: userEmail, subject, html });
  }

  /**
   * Send scan failed notification
   */
  async sendScanFailedEmail(userEmail: string, data: ScanFailedData): Promise<boolean> {
    // Escape all user-provided data
    const safeData = {
      ...data,
      scanName: this.escapeHtml(data.scanName),
      targetName: this.escapeHtml(data.targetName),
      targetUrl: this.escapeHtml(data.targetUrl),
      error: this.escapeHtml(data.error)
    };

    const subject = `[Tella AI] ❌ Scan Failed: ${data.scanName}`;
    const html = this.generateScanFailedHtml(safeData);

    return this.sendEmail({ to: userEmail, subject, html });
  }

  /**
   * Generate HTML for scan completed email
   */
  private generateScanCompletedHtml(data: ScanCompletedData): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .card { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .card h2 { margin: 0 0 15px 0; font-size: 18px; color: #1f2937; }
    .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #6b7280; font-weight: 500; }
    .info-value { color: #1f2937; font-weight: 600; }
    .findings-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 15px; }
    .finding-box { background: #f3f4f6; padding: 15px; border-radius: 6px; text-align: center; }
    .finding-count { font-size: 32px; font-weight: bold; margin-bottom: 5px; }
    .finding-label { color: #6b7280; font-size: 14px; }
    .critical { color: #dc2626; }
    .high { color: #ea580c; }
    .medium { color: #ca8a04; }
    .low { color: #65a30d; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 20px; }
    .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>✅ Scan Completed Successfully</h1>
  </div>
  <div class="content">
    <div class="card">
      <h2>Scan Details</h2>
      <div class="info-row">
        <span class="info-label">Scan Name:</span>
        <span class="info-value">${data.scanName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Target:</span>
        <span class="info-value">${data.targetName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">URL:</span>
        <span class="info-value">${data.targetUrl}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Completed:</span>
        <span class="info-value">${data.completedAt.toLocaleString()}</span>
      </div>
      ${data.duration ? `
      <div class="info-row">
        <span class="info-label">Duration:</span>
        <span class="info-value">${data.duration}</span>
      </div>
      ` : ''}
    </div>

    <div class="card">
      <h2>Findings Summary</h2>
      <p style="margin-top: 0;">Found <strong>${data.totalFindings} security findings</strong> across all severity levels:</p>

      <div class="findings-grid">
        <div class="finding-box">
          <div class="finding-count critical">${data.criticalFindings}</div>
          <div class="finding-label">Critical</div>
        </div>
        <div class="finding-box">
          <div class="finding-count high">${data.highFindings}</div>
          <div class="finding-label">High</div>
        </div>
        <div class="finding-box">
          <div class="finding-count medium">${data.mediumFindings}</div>
          <div class="finding-label">Medium</div>
        </div>
        <div class="finding-box">
          <div class="finding-count low">${data.lowFindings}</div>
          <div class="finding-label">Low</div>
        </div>
      </div>

      ${data.criticalFindings > 0 ? `
      <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 6px; margin-top: 20px;">
        <strong style="color: #dc2626;">⚠️ Action Required:</strong>
        <p style="margin: 5px 0 0 0; color: #991b1b;">This scan found ${data.criticalFindings} critical ${data.criticalFindings === 1 ? 'vulnerability' : 'vulnerabilities'} that require immediate attention.</p>
      </div>
      ` : ''}
    </div>

    <div style="text-align: center;">
      <a href="${process.env.APP_URL || 'http://localhost:3000'}/scans" class="button">View Scan Results</a>
    </div>
  </div>

  <div class="footer">
    <p>This is an automated notification from Tella AI Security Testing Platform</p>
    <p>You can manage your notification preferences in your account settings</p>
  </div>
</body>
</html>
    `;
  }

  /**
   * Generate HTML for critical finding email
   */
  private generateCriticalFindingHtml(data: CriticalFindingData): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .alert-badge { background: #fef2f2; color: #991b1b; padding: 8px 16px; border-radius: 20px; display: inline-block; margin-top: 10px; font-weight: 600; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .card { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .card h2 { margin: 0 0 15px 0; font-size: 18px; color: #1f2937; }
    .finding-title { font-size: 20px; font-weight: bold; color: #dc2626; margin-bottom: 10px; }
    .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #6b7280; font-weight: 500; }
    .info-value { color: #1f2937; font-weight: 600; }
    .description { background: #f3f4f6; padding: 15px; border-radius: 6px; margin: 15px 0; }
    .button { display: inline-block; background: #dc2626; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 20px; }
    .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🚨 Critical Security Finding</h1>
    <div class="alert-badge">IMMEDIATE ACTION REQUIRED</div>
  </div>
  <div class="content">
    <div class="card">
      <div class="finding-title">${data.title}</div>

      <div class="description">
        <p style="margin: 0;">${data.description}</p>
      </div>

      <div class="info-row">
        <span class="info-label">Severity:</span>
        <span class="info-value" style="color: #dc2626;">${data.severity}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Category:</span>
        <span class="info-value">${data.category}</span>
      </div>
      ${data.cvss ? `
      <div class="info-row">
        <span class="info-label">CVSS Score:</span>
        <span class="info-value">${data.cvss.toFixed(1)}</span>
      </div>
      ` : ''}
    </div>

    <div class="card">
      <h2>Scan Context</h2>
      <div class="info-row">
        <span class="info-label">Scan Name:</span>
        <span class="info-value">${data.scanName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Target:</span>
        <span class="info-value">${data.targetName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">URL:</span>
        <span class="info-value">${data.targetUrl}</span>
      </div>
    </div>

    <div style="background: #fef2f2; border: 2px solid #dc2626; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <strong style="color: #dc2626;">⚠️ Security Alert:</strong>
      <p style="margin: 10px 0 0 0; color: #991b1b;">This critical vulnerability poses a significant security risk and requires immediate investigation and remediation.</p>
    </div>

    <div style="text-align: center;">
      <a href="${process.env.APP_URL || 'http://localhost:3000'}/findings" class="button">View Finding Details</a>
    </div>
  </div>

  <div class="footer">
    <p>This is an automated security alert from Tella AI Security Testing Platform</p>
    <p>You can manage your notification preferences in your account settings</p>
  </div>
</body>
</html>
    `;
  }

  /**
   * Generate HTML for scan failed email
   */
  private generateScanFailedHtml(data: ScanFailedData): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .card { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .card h2 { margin: 0 0 15px 0; font-size: 18px; color: #1f2937; }
    .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #6b7280; font-weight: 500; }
    .info-value { color: #1f2937; font-weight: 600; }
    .error-box { background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 6px; margin: 15px 0; }
    .error-message { color: #991b1b; font-family: monospace; font-size: 14px; word-break: break-all; }
    .button { display: inline-block; background: #ea580c; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 20px; }
    .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>❌ Scan Failed</h1>
  </div>
  <div class="content">
    <div class="card">
      <h2>Scan Details</h2>
      <div class="info-row">
        <span class="info-label">Scan Name:</span>
        <span class="info-value">${data.scanName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Target:</span>
        <span class="info-value">${data.targetName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">URL:</span>
        <span class="info-value">${data.targetUrl}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Failed At:</span>
        <span class="info-value">${data.failedAt.toLocaleString()}</span>
      </div>
    </div>

    <div class="card">
      <h2>Error Details</h2>
      <div class="error-box">
        <strong style="color: #dc2626;">Error Message:</strong>
        <p class="error-message">${data.error}</p>
      </div>
    </div>

    <div style="background: #fff7ed; border: 1px solid #fed7aa; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
      <strong style="color: #c2410c;">What to do next:</strong>
      <ul style="margin: 10px 0 0 0; color: #9a3412; padding-left: 20px;">
        <li>Check the target URL is accessible</li>
        <li>Verify scan configuration settings</li>
        <li>Review the error message for specific issues</li>
        <li>Try running the scan again</li>
      </ul>
    </div>

    <div style="text-align: center;">
      <a href="${process.env.APP_URL || 'http://localhost:3000'}/scans" class="button">View Scan Details</a>
    </div>
  </div>

  <div class="footer">
    <p>This is an automated notification from Tella AI Security Testing Platform</p>
    <p>You can manage your notification preferences in your account settings</p>
  </div>
</body>
</html>
    `;
  }

  /**
   * Escape HTML to prevent injection
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Strip HTML tags from text (simple implementation)
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// Export singleton instance
export const emailService = new EmailService();
