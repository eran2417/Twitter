const jwt = require('jsonwebtoken');
const { logger } = require('../../shared');

/**
 * Setup Socket.io authentication middleware
 * Verifies JWT token and attaches userId to socket
 */
function setupAuthMiddleware(io) {
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
}

/**
 * Setup Socket.io connection handlers
 * Reserved for future bidirectional features (DMs, typing indicators, etc.)
 * Real-time feed updates are handled via SSE + Redis Pub/Sub
 */
function setupConnectionHandlers(io) {
  io.on('connection', (socket) => {
    logger.info(`User ${socket.userId} connected via WebSocket`);

    // Join user-specific room — used for future DM/chat features
    socket.join(`user-${socket.userId}`);

    socket.on('disconnect', () => {
      logger.info(`User ${socket.userId} disconnected`);
    });
  });
}

/**
 * Initialize Socket.io with auth middleware and connection handlers
 */
function setupSocketHandlers(io) {
  setupAuthMiddleware(io);
  setupConnectionHandlers(io);
}

module.exports = {
  setupSocketHandlers
};
