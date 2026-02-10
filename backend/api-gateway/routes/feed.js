const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * Feed Service Routes Configuration
 * Handles tweets, timeline, and content interactions
 */
const feedRoutes = [
  {
    path: '/api/v1/tweets',
    target: 'http://feed-service:3004',
    pathRewrite: { '^/api/v1/tweets': '/tweets' },
    methods: ['GET', 'POST', 'DELETE'],
    description: 'Tweet creation, retrieval, and deletion'
  },
  {
    path: '/api/v1/timeline',
    target: 'http://feed-service:3004',
    pathRewrite: { '^/api/v1/timeline': '/timeline' },
    methods: ['GET'],
    description: 'User timeline and trending content'
  }
];

/**
 * Create tweets service proxy middleware
 */
const createTweetsProxy = () =>
  createProxyMiddleware({
    target: 'http://feed-service:3004',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/tweets': '/tweets' },
    onError: (err, req, res) => {
      console.error('Feed service error:', err.message);
      res.status(503).json({
        error: 'Feed service unavailable',
        service: 'feed-service'
      });
    },
    onProxyReq: (proxyReq, req) => {
      proxyReq.setHeader('X-Gateway-Service', 'feed-service');
    }
  });

/**
 * Create timeline service proxy middleware
 */
const createTimelineProxy = () =>
  createProxyMiddleware({
    target: 'http://feed-service:3004',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/timeline': '/timeline' },
    onError: (err, req, res) => {
      console.error('Feed service error:', err.message);
      res.status(503).json({
        error: 'Feed service unavailable',
        service: 'feed-service'
      });
    },
    onProxyReq: (proxyReq, req) => {
      proxyReq.setHeader('X-Gateway-Service', 'feed-service');
    }
  });

/**
 * Special proxy for user tweets that goes to timeline service
 */
const createUserTweetsProxy = () =>
  createProxyMiddleware({
    target: 'http://feed-service:3004',
    changeOrigin: true,
    pathRewrite: (path, req) => {
      const username = req.params.username;
      return path.replace(`/api/v1/users/${username}/tweets`, `/timeline/users/${username}/tweets`);
    },
    onError: (err, req, res) => {
      console.error('Feed service error:', err.message);
      res.status(503).json({
        error: 'Feed service unavailable',
        service: 'feed-service'
      });
    },
    onProxyReq: (proxyReq, req) => {
      proxyReq.setHeader('X-Gateway-Service', 'feed-service');
    }
  });

module.exports = {
  feedRoutes,
  createTweetsProxy,
  createTimelineProxy,
  createUserTweetsProxy
};