/**
 * Authentication Middleware for Internal Services
 * 
 * This middleware trusts X-User-* headers set by the API Gateway.
 * The Gateway verifies JWT tokens and passes user info via headers.
 * 
 * For backward compatibility, it also supports direct JWT verification
 * if the request comes with an Authorization header (e.g., direct service calls).
 */

const jwt = require('jsonwebtoken');

/**
 * Authenticate user from Gateway headers or JWT token
 * Priority: X-User headers (from Gateway) > JWT verification (direct calls)
 */
const authenticate = (req, res, next) => {
  // Check if request comes from API Gateway with user headers
  if (req.headers['x-gateway-request'] === 'true') {
    if (req.headers['x-user-authenticated'] === 'true' && req.headers['x-user-id']) {
      const userId = parseInt(req.headers['x-user-id'], 10);
      req.user = {
        id: userId,
        userId: userId, // Alias for backward compatibility
        username: req.headers['x-user-username'] || '',
        email: req.headers['x-user-email'] || ''
      };
      return next();
    }
    // Gateway says not authenticated
    return res.status(401).json({ error: 'Access token required' });
  }

  // Fallback: Direct JWT verification (for local dev / direct service calls)
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production');
    // Normalize to have both id and userId
    const userId = decoded.userId || decoded.id;
    req.user = {
      ...decoded,
      id: userId,
      userId: userId
    };
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Optional authentication - doesn't fail if no auth provided
 */
const optionalAuth = (req, res, next) => {
  // Check if request comes from API Gateway with user headers
  if (req.headers['x-gateway-request'] === 'true') {
    if (req.headers['x-user-authenticated'] === 'true' && req.headers['x-user-id']) {
      req.user = {
        id: parseInt(req.headers['x-user-id'], 10),
        username: req.headers['x-user-username'] || '',
        email: req.headers['x-user-email'] || ''
      };
    }
    return next();
  }

  // Fallback: Direct JWT verification
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production');
      req.user = decoded;
    } catch (error) {
      // Ignore invalid tokens for optional auth
    }
  }

  next();
};

module.exports = {
  authenticate,
  optionalAuth
};