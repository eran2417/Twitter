const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Import route modules
const { createAuthProxy } = require('./routes/auth');
const { createUserProxy, createFollowsProxy } = require('./routes/users');
const { createTweetsProxy, createTimelineProxy, createUserTweetsProxy } = require('./routes/feed');
const { createSearchProxy } = require('./routes/search');
const { createNotificationsProxy } = require('./routes/notifications');

// Import middleware
const { apiLimiter, authLimiter, searchLimiter } = require('./middleware/rateLimiter');

// Import service configuration
const { checkServiceHealth } = require('./config/services');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:3001'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));

// Logging
app.use(morgan('combined'));

// API Versioning middleware
app.use('/api/v1', (req, res, next) => {
  req.apiVersion = 'v1';
  next();
});

// Health check with detailed service status
app.get('/health', async (req, res) => {
  try {
    const services = await checkServiceHealth();
    const allHealthy = Object.values(services).every(s => s.status === 'healthy');

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'healthy' : 'degraded',
      service: 'api-gateway',
      version: 'v1.0.0',
      services,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      service: 'api-gateway',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// API Documentation endpoint
app.get('/api/docs', (req, res) => {
  const { getAllRoutes } = require('./routes');
  res.json({
    version: 'v1',
    title: 'Twitter Clone API Gateway',
    description: 'API Gateway for Twitter Clone microservices',
    baseUrl: 'http://localhost:3001/api/v1',
    services: getAllRoutes().reduce((acc, route) => {
      const service = route.path.split('/')[2]; // Extract service name from path
      if (!acc[service]) acc[service] = [];
      acc[service].push(route);
      return acc;
    }, {})
  });
});

// Rate limiting
app.use('/api/v1/auth', authLimiter); // Stricter limits for auth
app.use('/api/v1/search', searchLimiter); // Limits for search
app.use('/api/v1', apiLimiter); // General API limits

// API v1 Routes
app.use('/api/v1/auth', createAuthProxy());
app.use('/api/v1/users', createUserProxy());
app.use('/api/v1/follows', createFollowsProxy());
app.use('/api/v1/tweets', createTweetsProxy());
app.use('/api/v1/timeline', createTimelineProxy());
app.use('/api/v1/search', createSearchProxy());
app.use('/api/v1/notifications', createNotificationsProxy());

// Special route for user tweets (must come after general routes)
app.use('/api/v1/users/:username/tweets', createUserTweetsProxy());

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.path,
    method: req.method,
    availableVersions: ['v1'],
    suggestion: 'Check /api/docs for available endpoints'
  });
});

// Fallback 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    method: req.method
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Gateway error:', err);
  res.status(500).json({
    error: 'Internal server error',
    requestId: req.id,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 API Gateway v1.0.0 listening on port ${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
  console.log(`❤️  Health Check: http://localhost:${PORT}/health`);
});