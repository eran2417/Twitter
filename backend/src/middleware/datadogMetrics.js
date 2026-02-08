/**
 * Datadog Custom Metrics Middleware
 * 
 * Tracks application-specific metrics for business monitoring:
 * - Request counts by endpoint
 * - Response times
 * - Error rates
 * - Business metrics (tweets, follows, etc.)
 */

const { incrementCounter, recordHistogram, trackMetric } = require('../utils/tracer');
const logger = require('../utils/logger');

/**
 * Middleware to track request metrics
 */
const requestMetrics = (req, res, next) => {
  const startTime = Date.now();
  
  // Track request start
  incrementCounter('twitter.requests.total', [
    `method:${req.method}`,
    `path:${req.route?.path || req.path}`,
    `env:${process.env.DD_ENV || 'development'}`
  ]);
  
  // Capture response metrics on finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const statusClass = `${Math.floor(statusCode / 100)}xx`;
    
    // Record response time histogram
    recordHistogram('twitter.request.duration', duration, [
      `method:${req.method}`,
      `path:${req.route?.path || req.path}`,
      `status:${statusCode}`,
      `status_class:${statusClass}`
    ]);
    
    // Track errors
    if (statusCode >= 400) {
      incrementCounter('twitter.requests.errors', [
        `method:${req.method}`,
        `path:${req.route?.path || req.path}`,
        `status:${statusCode}`,
        `status_class:${statusClass}`
      ]);
    }
  });
  
  next();
};

/**
 * Business metrics helpers
 */
const metrics = {
  // Tweet metrics
  trackTweetCreated: (userId) => {
    incrementCounter('twitter.tweets.created', [`user_id:${userId}`]);
    logger.info('Metric: tweet created', { metric: 'tweets.created', userId });
  },
  
  trackTweetDeleted: (userId, tweetId) => {
    incrementCounter('twitter.tweets.deleted', [`user_id:${userId}`]);
    logger.info('Metric: tweet deleted', { metric: 'tweets.deleted', userId, tweetId });
  },
  
  trackTweetLiked: (userId, tweetId) => {
    incrementCounter('twitter.tweets.liked', [`user_id:${userId}`, `tweet_id:${tweetId}`]);
  },
  
  trackTweetUnliked: (userId, tweetId) => {
    incrementCounter('twitter.tweets.unliked', [`user_id:${userId}`, `tweet_id:${tweetId}`]);
  },
  
  // User metrics
  trackUserRegistered: () => {
    incrementCounter('twitter.users.registered');
    logger.info('Metric: new user registered', { metric: 'users.registered' });
  },
  
  trackUserLogin: (userId) => {
    incrementCounter('twitter.users.login', [`user_id:${userId}`]);
  },
  
  trackUserLoginFailed: (reason) => {
    incrementCounter('twitter.users.login_failed', [`reason:${reason}`]);
  },
  
  // Follow metrics
  trackUserFollowed: (followerId, followingId) => {
    incrementCounter('twitter.follows.created', [
      `follower_id:${followerId}`,
      `following_id:${followingId}`
    ]);
  },
  
  trackUserUnfollowed: (followerId, followingId) => {
    incrementCounter('twitter.follows.deleted', [
      `follower_id:${followerId}`,
      `following_id:${followingId}`
    ]);
  },
  
  // Search metrics
  trackSearch: (type, query) => {
    incrementCounter('twitter.search.queries', [`type:${type}`]);
    recordHistogram('twitter.search.query_length', query.length, [`type:${type}`]);
  },
  
  // Cache metrics
  trackCacheHit: (cacheKey) => {
    incrementCounter('twitter.cache.hits', [`key_prefix:${cacheKey.split(':')[0]}`]);
  },
  
  trackCacheMiss: (cacheKey) => {
    incrementCounter('twitter.cache.misses', [`key_prefix:${cacheKey.split(':')[0]}`]);
  },
  
  // Kafka metrics
  trackKafkaEventSent: (topic, eventType) => {
    incrementCounter('twitter.kafka.events_sent', [`topic:${topic}`, `event_type:${eventType}`]);
  },
  
  trackKafkaEventReceived: (topic, eventType) => {
    incrementCounter('twitter.kafka.events_received', [`topic:${topic}`, `event_type:${eventType}`]);
  },
  
  // Database metrics
  trackDbQuery: (operation, table, durationMs) => {
    recordHistogram('twitter.db.query_duration', durationMs, [
      `operation:${operation}`,
      `table:${table}`
    ]);
  },
  
  // WebSocket metrics
  trackWebSocketConnection: () => {
    incrementCounter('twitter.websocket.connections');
  },
  
  trackWebSocketDisconnection: () => {
    incrementCounter('twitter.websocket.disconnections');
  },
  
  // Active users gauge (should be updated periodically)
  setActiveUsers: (count) => {
    trackMetric('twitter.users.active', count);
  },
  
  setActiveSockets: (count) => {
    trackMetric('twitter.websocket.active_connections', count);
  }
};

module.exports = {
  requestMetrics,
  metrics
};
