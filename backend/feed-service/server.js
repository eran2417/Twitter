const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const socketIO = require('socket.io');
const tweetRoutes = require('./routes/tweets');
const timelineRoutes = require('./routes/timeline');
const { logger, kafkaProducer, db } = require('../shared');
const { setupSocketHandlers } = require('./services/socketManager');
const { start: startFeedConsumer } = require('../shared/services/kafka/feedConsumer');

const app = express();
// Disable ETag and Last-Modified headers for all responses (prevents 304 Not Modified)
app.disable('etag');
app.use((req, res, next) => {
  res.removeHeader('Last-Modified');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
const PORT = process.env.PORT || 3004;

// Make io available to routes
app.set('io', io);

// Setup Socket.io authentication and connection handlers
setupSocketHandlers(io, db);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// Routes
app.use('/tweets', tweetRoutes);
app.use('/timeline', timelineRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'feed-service' });
});

// Error handling
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

server.listen(PORT, async () => {
  logger.info(`Feed service listening on port ${PORT}`);
  
  // Initialize Kafka producer
  try {
    await kafkaProducer.connect();
    logger.info('Kafka producer initialized and topics created');
  } catch (error) {
    logger.error('Failed to initialize Kafka producer:', error);
  }
  
  // Start Kafka consumer for feed updates (follow events, tweet caching)
  try {
    await startFeedConsumer();
    logger.info('Feed consumer started for timeline updates');
  } catch (error) {
    logger.error('Failed to start feed consumer:', error);
  }
});