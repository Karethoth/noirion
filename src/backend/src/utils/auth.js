import jwt from 'jsonwebtoken';
import { loadConfig } from './config.js';

let cachedJwtConfig = null;

async function getJwtConfig() {
  if (cachedJwtConfig) return cachedJwtConfig;
  const cfg = await loadConfig();
  cachedJwtConfig = cfg.jwt;
  return cachedJwtConfig;
}

/**
 * Generate a JWT token for a user
 * @param {Object} user - User object with id, username, email, role
 * @returns {string} JWT token
 */
export function generateToken(user) {
  const payload = {
    userId: user.id,
    username: user.username,
    email: user.email,
    role: user.role
  };

  // Async config isn't ideal here, but keeps a single source of truth.
  // We intentionally do a sync fallback if config isn't loaded yet.
  const secret = cachedJwtConfig?.secret || process.env.JWT_SECRET || 'noirion-secret-key-change-in-production';
  const expiresIn = cachedJwtConfig?.expiresIn || process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign(payload, secret, { expiresIn });
}

/**
 * Verify and decode a JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object|null} Decoded token payload or null if invalid
 */
export function verifyToken(token) {
  try {
    const secret = cachedJwtConfig?.secret || process.env.JWT_SECRET || 'noirion-secret-key-change-in-production';
    return jwt.verify(token, secret);
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return null;
  }
}

// Warm config cache early (best effort)
getJwtConfig().catch(() => {});

/**
 * Extract user info from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {Object|null} User info from token or null if invalid
 */
export function getUserFromAuthHeader(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  return verifyToken(token);
}

/**
 * Check if user has permission for an operation
 * @param {Object} user - User object with role
 * @param {string} operation - Operation type: 'read', 'write', 'admin'
 * @returns {boolean} True if user has permission
 */
export function hasPermission(user, operation) {
  if (!user) {
    return false;
  }

  const rolePermissions = {
    admin: ['read', 'write', 'admin'],
    investigator: ['read', 'write'],
    analyst: ['read']
  };

  const permissions = rolePermissions[user.role] || [];
  return permissions.includes(operation);
}

/**
 * Require authentication - throws error if user not authenticated
 * @param {Object} user - User object from context
 * @throws {Error} If user is not authenticated
 */
export function requireAuth(user) {
  if (!user) {
    throw new Error('Authentication required. Please log in.');
  }
}

/**
 * Require specific permission - throws error if user lacks permission
 * @param {Object} user - User object from context
 * @param {string} operation - Required operation: 'read', 'write', 'admin'
 * @throws {Error} If user lacks required permission
 */
export function requirePermission(user, operation) {
  requireAuth(user);

  if (!hasPermission(user, operation)) {
    throw new Error(`Permission denied. This operation requires '${operation}' permission. Your role '${user.role}' does not have this access.`);
  }
}
