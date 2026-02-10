const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * Auth Service Routes Configuration
 * Handles authentication and user registration
 */
const authRoutes = [
  {
    path: '/api/v1/auth',
    target: 'http://auth-service:3002',
    pathRewrite: { '^/api/v1/auth': '/auth' },
    methods: ['GET', 'POST'],
    description: 'Authentication endpoints (login, register, verify)'
  }
];

/**
 * Create auth service proxy middleware
 */
const createAuthProxy = () =>
  createProxyMiddleware({
    target: 'http://auth-service:3002',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/auth': '/auth' },
    onError: (err, req, res) => {
      console.error('Auth service error:', err.message);
      res.status(503).json({
        error: 'Authentication service unavailable',
        service: 'auth-service'
      });
    },
    onProxyReq: (proxyReq, req) => {
      // Add service identification header
      proxyReq.setHeader('X-Gateway-Service', 'auth-service');
    }
  });

module.exports = { authRoutes, createAuthProxy };