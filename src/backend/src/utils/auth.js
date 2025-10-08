import jwt from 'jsonwebtoken';

// Secret key for JWT - in production, this should be in environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'noirion-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d'; // Token expires in 7 days

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

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify and decode a JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object|null} Decoded token payload or null if invalid
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return null;
  }
}

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
