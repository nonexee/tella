/**
 * Environment Variable Validation
 * Validates all required environment variables at startup
 * Fails fast if critical configuration is missing
 */

import { logger } from './logger.js';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate all environment variables
 * Throws error if critical variables are missing/invalid
 */
export function validateEnvironment(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const IS_PRODUCTION = process.env.NODE_ENV === 'production';

  // CRITICAL: Database URL
  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is required');
  } else if (!process.env.DATABASE_URL.startsWith('postgresql://')) {
    errors.push('DATABASE_URL must be a PostgreSQL connection string');
  }

  // OPTIONAL: OpenAI API Key (required for AI features, but system can run without it)
  if (!process.env.OPENAI_API_KEY) {
    warnings.push('OPENAI_API_KEY not set - AI agent features will be disabled');
  } else if (process.env.OPENAI_API_KEY === 'your-openai-api-key-here' ||
             process.env.OPENAI_API_KEY.includes('placeholder')) {
    warnings.push('OPENAI_API_KEY is placeholder - AI agent features will be disabled');
  } else if (!process.env.OPENAI_API_KEY.startsWith('sk-')) {
    warnings.push('OPENAI_API_KEY does not match expected format (sk-...)');
  }

  // CRITICAL: JWT Secret
  if (!process.env.JWT_SECRET) {
    errors.push('JWT_SECRET is required');
  } else if (process.env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters long');
  } else if (process.env.JWT_SECRET === 'your-super-secret-jwt-key-at-least-32-characters-long') {
    errors.push('JWT_SECRET must be changed from the example value!');
  }

  // CRITICAL IN PRODUCTION: CORS Configuration
  if (IS_PRODUCTION) {
    if (!process.env.CORS_ORIGIN) {
      errors.push('CORS_ORIGIN is required in production');
    } else if (process.env.CORS_ORIGIN.includes('*')) {
      errors.push('CORS_ORIGIN cannot contain wildcards (*) in production');
    } else if (process.env.CORS_ORIGIN === 'http://localhost:5173,http://localhost:3000') {
      warnings.push('CORS_ORIGIN still set to localhost in production!');
    }
  }

  // OPTIONAL BUT RECOMMENDED: Validate numeric values
  if (process.env.MAX_CONCURRENT_AGENTS) {
    const val = parseInt(process.env.MAX_CONCURRENT_AGENTS, 10);
    if (isNaN(val) || val < 1 || val > 100) {
      errors.push('MAX_CONCURRENT_AGENTS must be a number between 1 and 100');
    }
  }

  if (process.env.AGENT_TIMEOUT_MS) {
    const val = parseInt(process.env.AGENT_TIMEOUT_MS, 10);
    if (isNaN(val) || val < 1000 || val > 3600000) {
      errors.push('AGENT_TIMEOUT_MS must be between 1000 (1s) and 3600000 (1h)');
    }
  }

  if (process.env.PORT) {
    const val = parseInt(process.env.PORT, 10);
    if (isNaN(val) || val < 1 || val > 65535) {
      errors.push('PORT must be a valid port number (1-65535)');
    }
  }

  // Warnings for missing optional variables
  if (!process.env.REDIS_URL && IS_PRODUCTION) {
    warnings.push('REDIS_URL not set - task queue will use in-memory storage');
  }

  if (!process.env.LOG_LEVEL) {
    warnings.push('LOG_LEVEL not set, using default (info)');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate environment and throw if critical errors found
 */
export function validateOrThrow(): void {
  logger.info('🔍 Validating environment variables...');

  const result = validateEnvironment();

  // Log warnings
  if (result.warnings.length > 0) {
    result.warnings.forEach(warning => {
      logger.warn(`⚠️  ${warning}`);
    });
  }

  // Throw on errors
  if (!result.valid) {
    logger.error('❌ Environment validation failed!');
    result.errors.forEach(error => {
      logger.error(`   ✗ ${error}`);
    });

    throw new Error(
      `Environment validation failed with ${result.errors.length} error(s). ` +
      'Check your .env file and ensure all required variables are set correctly.'
    );
  }

  logger.info('✅ Environment validation passed');
}
