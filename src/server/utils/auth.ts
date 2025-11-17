/**
 * Authentication & Authorization Utilities
 *
 * FIXES:
 * - Added password strength validation
 * - Added token refresh mechanism
 * - Added proper token expiration handling
 * - Added rate limiting helpers
 * - Added secure password hashing with proper rounds
 * - Added input validation with Zod
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from './prisma.js';

// Validation schemas
export const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const emailSchema = z.string().email('Invalid email address');

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

// Token expiration times
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY = '7d'; // 7 days

/**
 * Get JWT secret from environment
 */
function getJWTSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'your-secret-key' || secret.length < 32) {
    throw new Error(
      'JWT_SECRET must be set in environment and be at least 32 characters long. ' +
      'NEVER use default secrets in production!'
    );
  }
  return secret;
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  try {
    passwordSchema.parse(password);
    return { valid: true, errors: [] };
  } catch (error: any) {
    const errors = error.errors?.map((e: any) => e.message) || ['Invalid password'];
    return { valid: false, errors };
  }
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  try {
    emailSchema.parse(email);
    return true;
  } catch {
    return false;
  }
}

/**
 * Hash password with secure rounds
 */
export async function hashPassword(password: string): Promise<string> {
  // Validate password first
  const validation = validatePassword(password);
  if (!validation.valid) {
    throw new Error(`Password validation failed: ${validation.errors.join(', ')}`);
  }

  // Use 12 rounds for good security/performance balance
  return bcrypt.hash(password, 12);
}

/**
 * Compare password with hash
 */
export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    // Never throw on comparison error - just return false
    return false;
  }
}

/**
 * Generate access token (short-lived)
 */
export function generateAccessToken(payload: Omit<JWTPayload, 'type'>): string {
  const secret = getJWTSecret();
  return jwt.sign(
    { ...payload, type: 'access' },
    secret,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

/**
 * Generate refresh token (long-lived)
 */
export function generateRefreshToken(payload: Omit<JWTPayload, 'type'>): string {
  const secret = getJWTSecret();
  return jwt.sign(
    { ...payload, type: 'refresh' },
    secret,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
}

/**
 * Generate both access and refresh tokens
 */
export function generateTokenPair(user: {
  userId: string;
  email: string;
  role: string;
}): { accessToken: string; refreshToken: string } {
  return {
    accessToken: generateAccessToken(user),
    refreshToken: generateRefreshToken(user)
  };
}

/**
 * Legacy function for backwards compatibility
 */
export function generateToken(payload: Omit<JWTPayload, 'type'>): string {
  return generateAccessToken(payload);
}

/**
 * Verify and decode token
 */
export function verifyToken(token: string, expectedType?: 'access' | 'refresh'): JWTPayload {
  try {
    const secret = getJWTSecret();
    const payload = jwt.verify(token, secret) as JWTPayload;

    // Verify token type if specified
    if (expectedType && payload.type !== expectedType) {
      throw new Error(`Invalid token type. Expected ${expectedType}, got ${payload.type}`);
    }

    return payload;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token has expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    } else {
      throw error;
    }
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  // Verify it's a valid refresh token
  const payload = verifyToken(refreshToken, 'refresh');

  // Verify user still exists and is active
  const user = await prisma.user.findUnique({
    where: { id: payload.userId }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Generate new token pair
  return generateTokenPair({
    userId: user.id,
    email: user.email,
    role: user.role
  });
}

/**
 * Authenticate user from token
 */
export async function authenticateUser(token: string): Promise<any> {
  const payload = verifyToken(token, 'access');

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (!user) {
    throw new Error('User not found');
  }

  return user;
}

/**
 * Check if user has required role
 */
export function hasRole(userRole: string, requiredRoles: string[]): boolean {
  return requiredRoles.includes(userRole);
}

/**
 * Check if user has permission for action
 */
export function hasPermission(userRole: string, action: string): boolean {
  const rolePermissions: Record<string, string[]> = {
    ADMIN: ['*'], // Admin has all permissions
    OPERATOR: [
      'scan:create',
      'scan:read',
      'scan:update',
      'scan:delete',
      'target:create',
      'target:read',
      'target:update',
      'target:delete',
      'finding:read',
      'finding:update',
      'agent:read',
      'tool:read'
    ],
    VIEWER: [
      'scan:read',
      'target:read',
      'finding:read',
      'agent:read',
      'tool:read'
    ]
  };

  const permissions = rolePermissions[userRole] || [];

  // Admin has all permissions
  if (permissions.includes('*')) {
    return true;
  }

  return permissions.includes(action);
}

/**
 * Rate limiting helper - track login attempts
 */
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

export function checkLoginAttempts(identifier: string): {
  allowed: boolean;
  attemptsRemaining: number;
  lockedUntil?: Date;
} {
  const now = Date.now();
  const attempts = loginAttempts.get(identifier);

  if (!attempts) {
    return { allowed: true, attemptsRemaining: MAX_LOGIN_ATTEMPTS };
  }

  // Check if lockout period has expired
  if (now - attempts.lastAttempt > LOCKOUT_DURATION) {
    loginAttempts.delete(identifier);
    return { allowed: true, attemptsRemaining: MAX_LOGIN_ATTEMPTS };
  }

  // Check if too many attempts
  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    const lockedUntil = new Date(attempts.lastAttempt + LOCKOUT_DURATION);
    return {
      allowed: false,
      attemptsRemaining: 0,
      lockedUntil
    };
  }

  return {
    allowed: true,
    attemptsRemaining: MAX_LOGIN_ATTEMPTS - attempts.count
  };
}

export function recordLoginAttempt(identifier: string, success: boolean): void {
  if (success) {
    // Clear attempts on successful login
    loginAttempts.delete(identifier);
    return;
  }

  const now = Date.now();
  const attempts = loginAttempts.get(identifier);

  if (!attempts) {
    loginAttempts.set(identifier, { count: 1, lastAttempt: now });
  } else {
    attempts.count++;
    attempts.lastAttempt = now;
  }
}

/**
 * Clean up old login attempt records (run periodically)
 */
export function cleanupLoginAttempts(): void {
  const now = Date.now();
  for (const [identifier, attempts] of loginAttempts.entries()) {
    if (now - attempts.lastAttempt > LOCKOUT_DURATION) {
      loginAttempts.delete(identifier);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupLoginAttempts, 5 * 60 * 1000);
