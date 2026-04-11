const jwt = require('jsonwebtoken');
const { logger } = require('../../shared');
const { HOT_USER_THRESHOLD } = require('../constants');

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
 * Manages room joins, follow events, and disconnections
 */
function setupConnectionHandlers(io, db) {
  io.on('connection', (socket) => {
    logger.info(`User ${socket.userId} connected via WebSocket`);

    // Join user-specific room for their own timeline
    socket.join(`timeline-${socket.userId}`);

    // Handle follow event - join room to receive updates from followed users
    socket.on('follow', async (data) => {
      try {
        // Check if the followed user is a hot user (>5000 followers)
        const userResult = await db.query(
          'SELECT follower_count FROM users WHERE id = $1',
          [data.userId]
        );
        
        const isHotUser = userResult.rows.length > 0 && 
                         userResult.rows[0].follower_count >= HOT_USER_THRESHOLD;
        
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
}

/**
 * Initialize Socket.io with all handlers and middleware
 * @param {SocketIO.Server} io - Socket.io instance
 * @param {Database} db - Database connection pool
 */
function setupSocketHandlers(io, db) {
  setupAuthMiddleware(io);
  setupConnectionHandlers(io, db);
}

module.exports = {
  setupSocketHandlers
};
