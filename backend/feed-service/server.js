const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const tweetRoutes = require('./routes/tweets');
const timelineRoutes = require('./routes/timeline');
const { logger, kafkaProducer, db } = require('./shared');

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

// Socket.io middleware for authentication
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    socket.username = decoded.username;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  logger.info(`User ${socket.userId} connected via WebSocket`);

  // Join user-specific room
  socket.join(`timeline-${socket.userId}`);

  // Join follower room to receive updates from followed users
  socket.on('follow', async (data) => {
    const HOT_USER_THRESHOLD = 5000;
    try {
      // Check if the followed user is a hot user (>5000 followers)
      const userResult = await db.query(
        'SELECT follower_count FROM users WHERE id = $1',
        [data.userId]
      );
      
      const isHotUser = userResult.rows.length > 0 && userResult.rows[0].follower_count >= HOT_USER_THRESHOLD;
      
      if (!isHotUser) {
        // Only join room for normal users - hot users use pull-based strategy
        socket.join(`timeline-${data.userId}`);
        logger.info(`User ${socket.userId} joined room for normal user ${data.userId}`);
      } else {
        logger.info(`User ${socket.userId} followed hot user ${data.userId} - using pull-based strategy`);
      }
    } catch (error) {
      logger.warn(`Failed to check if user ${data.userId} is hot:`, error.message);
      // Fallback: still join room if check fails
      socket.join(`timeline-${data.userId}`);
    }
  });

  socket.on('disconnect', () => {
    logger.info(`User ${socket.userId} disconnected`);
  });
});

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
  
  // Initialize Kafka producer and create topics
  try {
    await kafkaProducer.connect();
    logger.info('Kafka producer initialized and topics created');
  } catch (error) {
    logger.error('Failed to initialize Kafka producer:', error);
  }
});