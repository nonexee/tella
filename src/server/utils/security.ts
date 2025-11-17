/**
 * Security Utilities
 *
 * Functions for sanitizing sensitive data and preventing information leakage
 */

/**
 * Sanitize error for logging - removes sensitive information
 */
export function sanitizeError(error: any): any {
  if (!error) return error;

  // Create a clean error object
  const sanitized: any = {
    message: error.message || 'Unknown error',
    name: error.name || 'Error',
    code: error.code,
    statusCode: error.statusCode || error.status
  };

  // Remove sensitive patterns from message
  if (sanitized.message) {
    sanitized.message = sanitized.message
      // Remove API keys (various patterns)
      .replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED_API_KEY]')
      .replace(/Bearer\s+[a-zA-Z0-9._-]+/g, 'Bearer [REDACTED_TOKEN]')
      // Remove JWT tokens
      .replace(/eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[REDACTED_JWT]')
      // Remove Authorization headers
      .replace(/authorization:\s*['"]?[^'"}\s]+['"]?/gi, 'authorization: [REDACTED]')
      // Remove passwords
      .replace(/password['":\s]+[^'"}\s]+/gi, 'password: [REDACTED]')
      // Remove database connection strings
      .replace(/postgresql:\/\/[^@]+@[^\s]+/g, 'postgresql://[REDACTED]')
      .replace(/mongodb:\/\/[^@]+@[^\s]+/g, 'mongodb://[REDACTED]')
      .replace(/redis:\/\/[^@]+@[^\s]+/g, 'redis://[REDACTED]');
  }

  // Include stack trace in development only, and sanitize it
  if (process.env.NODE_ENV !== 'production' && error.stack) {
    sanitized.stack = error.stack
      .replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED_API_KEY]')
      .replace(/Bearer\s+[a-zA-Z0-9._-]+/g, 'Bearer [REDACTED_TOKEN]');
  }

  return sanitized;
}

/**
 * Sanitize object for logging - recursively removes sensitive keys
 */
export function sanitizeObject(obj: any, depth = 0): any {
  const MAX_DEPTH = 10; // Prevent infinite recursion

  if (depth > MAX_DEPTH) {
    return '[MAX_DEPTH_EXCEEDED]';
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    // Sanitize string values
    if (typeof obj === 'string') {
      return obj
        .replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED_API_KEY]')
        .replace(/Bearer\s+[a-zA-Z0-9._-]+/g, 'Bearer [REDACTED_TOKEN]');
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1));
  }

  const sanitized: any = {};
  const sensitiveKeys = [
    'password',
    'token',
    'apiKey',
    'api_key',
    'secret',
    'authorization',
    'auth',
    'credential',
    'privateKey',
    'private_key'
  ];

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();

    if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeObject(value, depth + 1);
    }
  }

  return sanitized;
}

/**
 * Check if JSON depth exceeds safe limit
 * Protects against stack overflow from deeply nested JSON
 */
export function validateJSONDepth(obj: any, maxDepth = 20, currentDepth = 0): boolean {
  if (currentDepth > maxDepth) {
    return false;
  }

  if (obj === null || typeof obj !== 'object') {
    return true;
  }

  if (Array.isArray(obj)) {
    return obj.every(item => validateJSONDepth(item, maxDepth, currentDepth + 1));
  }

  return Object.values(obj).every(value =>
    validateJSONDepth(value, maxDepth, currentDepth + 1)
  );
}
