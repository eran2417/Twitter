const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * Notification Service Routes Configuration
 * Handles user notifications and real-time updates
 */
const notificationRoutes = [
  {
    path: '/api/v1/notifications',
    target: 'http://notification-service:3006',
    pathRewrite: { '^/api/v1/notifications': '/notifications' },
    methods: ['GET'],
    description: 'User notifications (likes, follows, mentions)'
  }
];

/**
 * Create notification service proxy middleware
 */
const createNotificationsProxy = () =>
  createProxyMiddleware({
    target: 'http://notification-service:3006',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/notifications': '/notifications' },
    onError: (err, req, res) => {
      console.error('Notification service error:', err.message);
      res.status(503).json({
        error: 'Notification service unavailable',
        service: 'notification-service'
      });
    },
    onProxyReq: (proxyReq, req) => {
      proxyReq.setHeader('X-Gateway-Service', 'notification-service');
    }
  });

module.exports = { notificationRoutes, createNotificationsProxy };