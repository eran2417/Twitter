const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const tweetRoutes = require('./routes/tweets');
const timelineRoutes = require('./routes/timeline');
const { logger } = require('./shared');

const app = express();
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
  socket.on('follow', (data) => {
    socket.join(`timeline-${data.userId}`);
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

server.listen(PORT, () => {
  logger.info(`Feed service listening on port ${PORT}`);
});