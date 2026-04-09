/**
 * JWT Authentication Middleware for API Gateway
 * 
 * This middleware verifies JWT tokens and extracts user information,
 * which is then passed to downstream services via X-User-* headers.
 * 
 * This centralizes authentication at the Gateway level, so internal
 * services don't need to verify JWTs themselves.
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

/**
 * Verify JWT and attach user info to request
 * Sets req.user with decoded token data
 */
const verifyJwt = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Normalize user object - JWT may have userId or id
    req.user = {
      id: decoded.userId || decoded.id,
      username: decoded.username || '',
      email: decoded.email || ''
    };
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(403).json({ error: 'Invalid token' });
  }
};

/**
 * Optional JWT verification - doesn't fail if no token
 * Useful for endpoints that work with or without auth
 */
const optionalJwt = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      // Normalize user object - JWT may have userId or id
      req.user = {
        id: decoded.userId || decoded.id,
        username: decoded.username || '',
        email: decoded.email || ''
      };
    } catch (error) {
      // Ignore invalid tokens for optional auth
      req.user = null;
    }
  }

  next();
};

/**
 * Add user headers to proxy request
 * Call this in onProxyReq to pass user info to internal services
 */
const addUserHeaders = (proxyReq, req) => {
  // Always set gateway header
  proxyReq.setHeader('X-Gateway-Request', 'true');
  
  if (req.user && req.user.id) {
    proxyReq.setHeader('X-User-Id', String(req.user.id));
    proxyReq.setHeader('X-User-Username', req.user.username || '');
    proxyReq.setHeader('X-User-Email', req.user.email || '');
    proxyReq.setHeader('X-User-Authenticated', 'true');
  } else {
    proxyReq.setHeader('X-User-Authenticated', 'false');
  }
};

module.exports = {
  verifyJwt,
  optionalJwt,
  addUserHeaders,
  JWT_SECRET
};
