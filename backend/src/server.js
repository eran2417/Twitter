const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { createServer } = require('http');
const { Server } = require('socket.io');

const logger = require('./utils/logger');
const { errorHandler } = require('./middleware/errorHandler');
const { rateLimiter } = require('./middleware/rateLimiter');
const db = require('./database/pool');
const redisClient = require('./services/redis');
const kafkaProducer = require('./services/kafka/producer');
const elasticsearch = require('./services/elasticsearch/client');
const searchConsumer = require('./services/kafka/searchConsumer');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const tweetRoutes = require('./routes/tweets');
const timelineRoutes = require('./routes/timeline');
const followRoutes = require('./routes/follows');
const searchRoutes = require('./routes/search');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Rate limiting
app.use('/api/', rateLimiter);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check database
    await db.primary.query('SELECT 1');
    
    // Check Redis
    await redisClient.ping();
    
    res.status(200).json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: 'connected',
        kafka: kafkaProducer.isConnected() ? 'connected' : 'disconnected',
        elasticsearch: elasticsearch.isConnected() ? 'connected' : 'disconnected'
      }
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({ 
      status: 'unhealthy',
      error: error.message 
    });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tweets', tweetRoutes);
app.use('/api/timeline', timelineRoutes);
app.use('/api/follows', followRoutes);
app.use('/api/search', searchRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handling middleware
app.use(errorHandler);

// WebSocket for real-time updates
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  
  socket.on('join-timeline', (userId) => {
    socket.join(`timeline-${userId}`);
    logger.info(`User ${userId} joined their timeline room`);
  });
  
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Make io accessible to routes
app.set('io', io);

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Starting graceful shutdown...');
  
  httpServer.close(async () => {
    logger.info('HTTP server closed');
    
    try {
      await db.primary.end();
      await db.replica.end();
      logger.info('Database connections closed');
      
      await redisClient.quit();
      logger.info('Redis connection closed');
      
      await kafkaProducer.disconnect();
      logger.info('Kafka producer disconnected');
      
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const PORT = process.env.PORT || 3001;

const startServer = async () => {
  try {
    // Initialize Kafka producer
    await kafkaProducer.connect();
    logger.info('Kafka producer connected');
    
    // Test database connection
    await db.primary.query('SELECT NOW()');
    logger.info('Database connected');
    
    // Test Redis connection
    await redisClient.ping();
    logger.info('Redis connected');
    
    // Initialize Elasticsearch
    try {
      await elasticsearch.connect();
      logger.info('Elasticsearch connected');
      
      // Start Kafka consumer for search indexing
      await searchConsumer.start();
      logger.info('Search consumer started');
    } catch (esError) {
      logger.warn('Elasticsearch not available, search features disabled:', esError.message);
    }
    
    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = { app, io };
