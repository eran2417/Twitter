const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * User Service Routes Configuration
 * Handles user profiles, follows, and user search
 */
const userRoutes = [
  {
    path: '/api/v1/users',
    target: 'http://user-service:3003',
    pathRewrite: { '^/api/v1/users': '/users' },
    methods: ['GET', 'PATCH'],
    description: 'User profile management'
  },
  {
    path: '/api/v1/follows',
    target: 'http://user-service:3003',
    pathRewrite: { '^/api/v1/follows': '/follows' },
    methods: ['GET', 'POST', 'DELETE'],
    description: 'Social following features'
  }
];

/**
 * Create user service proxy middleware
 */
const createUserProxy = () =>
  createProxyMiddleware({
    target: 'http://user-service:3003',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/users': '/users' },
    onError: (err, req, res) => {
      console.error('User service error:', err.message);
      res.status(503).json({
        error: 'User service unavailable',
        service: 'user-service'
      });
    },
    onProxyReq: (proxyReq, req) => {
      proxyReq.setHeader('X-Gateway-Service', 'user-service');
    }
  });

/**
 * Create follows service proxy middleware
 */
const createFollowsProxy = () =>
  createProxyMiddleware({
    target: 'http://user-service:3003',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/follows': '/follows' },
    onError: (err, req, res) => {
      console.error('User service error:', err.message);
      res.status(503).json({
        error: 'User service unavailable',
        service: 'user-service'
      });
    },
    onProxyReq: (proxyReq, req) => {
      proxyReq.setHeader('X-Gateway-Service', 'user-service');
    }
  });

module.exports = { userRoutes, createUserProxy, createFollowsProxy };