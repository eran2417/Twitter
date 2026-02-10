const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * Search Service Routes Configuration
 * Handles search functionality across tweets and users
 */
const searchRoutes = [
  {
    path: '/api/v1/search',
    target: 'http://search-service:3005',
    pathRewrite: { '^/api/v1/search': '/search' },
    methods: ['GET', 'POST'],
    description: 'Search tweets, users, and trending content'
  }
];

/**
 * Create search service proxy middleware
 */
const createSearchProxy = () =>
  createProxyMiddleware({
    target: 'http://search-service:3005',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/search': '/search' },
    onError: (err, req, res) => {
      console.error('Search service error:', err.message);
      res.status(503).json({
        error: 'Search service unavailable',
        service: 'search-service'
      });
    },
    onProxyReq: (proxyReq, req) => {
      proxyReq.setHeader('X-Gateway-Service', 'search-service');
    }
  });

module.exports = { searchRoutes, createSearchProxy };