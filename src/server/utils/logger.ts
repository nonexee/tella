/**
 * Winston Logger Configuration
 *
 * FIXES:
 * - Auto-create logs directory
 * - Daily log rotation
 * - Environment-based log levels
 * - Separate error logs
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure logs directory exists
const logsDir = join(__dirname, '../../../logs');
if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

// Determine log level based on environment
const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

// Custom format for console
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...rest }) => {
    const meta = Object.keys(rest).length ? JSON.stringify(rest, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${meta}`;
  })
);

// File format (JSON for easy parsing)
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Daily rotate file transport for all logs
const dailyRotateTransport = new DailyRotateFile({
  filename: join(logsDir, 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d', // Keep logs for 14 days
  format: fileFormat
});

// Daily rotate file transport for error logs
const errorRotateTransport = new DailyRotateFile({
  filename: join(logsDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d', // Keep error logs for 30 days
  level: 'error',
  format: fileFormat
});

export const logger = winston.createLogger({
  level: LOG_LEVEL,
  transports: [
    // Console transport (only in development or when explicitly enabled)
    new winston.transports.Console({
      format: consoleFormat,
      silent: process.env.NODE_ENV === 'test'
    }),
    // Daily rotating files
    dailyRotateTransport,
    errorRotateTransport
  ],
  // Don't exit on handled exceptions
  exitOnError: false
});

// Log uncaught exceptions and unhandled rejections to file
logger.exceptions.handle(
  new DailyRotateFile({
    filename: join(logsDir, 'exceptions-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '30d',
    format: fileFormat
  })
);

logger.rejections.handle(
  new DailyRotateFile({
    filename: join(logsDir, 'rejections-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '30d',
    format: fileFormat
  })
);

// Log startup information
logger.info('Logger initialized', {
  level: LOG_LEVEL,
  logsDirectory: logsDir,
  environment: process.env.NODE_ENV || 'development'
});

export default logger;
