/**
 * Feed Consumer - Handles feed-related Kafka events
 * 
 * Responsibilities:
 * - Update trending hashtags materialized view on new tweets
 * - Invalidate timeline and trending caches
 * - Maintain user relationship graph in Redis
 * - Update follower feed caches on follow events
 */

const { Kafka, logLevel } = require('kafkajs');
const logger = require('../../utils/logger');
const db = require('../../database/pool');
const redisClient = require('../redis');
const { CACHE_KEYS, HOT_USER_THRESHOLD } = require('../../constants');

// Kafka client configuration
const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'twitter-feed-consumer',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:29092').split(','),
  logLevel: logLevel.ERROR,
  retry: {
    initialRetryTime: 300,
    retries: Number.MAX_SAFE_INTEGER,
    maxRetryTime: 30000,
    factor: 2,
  },
});

const consumer = kafka.consumer({
  groupId: 'feed-consumer-group',
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
  rebalanceTimeout: 60000,
  retry: {
    retries: Number.MAX_SAFE_INTEGER,
  },
});

let isRunning = false;

/**
 * Parse JSON message from Kafka
 */
const parseMessage = (message) => {
  try {
    return JSON.parse(message.value.toString());
  } catch (error) {
    logger.error('Feed consumer JSON parse error:', error);
    throw error;
  }
};

/**
 * Handle tweet created events
 * - Refresh trending hashtags materialized view
 * - Invalidate timeline and trending caches
 */
const handleTweetCreated = async (event) => {
  logger.info('Processing tweet created event:', { tweetId: event.tweetId });

  try {
    // Refresh trending hashtags materialized view
    await db.query(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY trending_hashtags',
      [],
      { write: true }
    );

    // Invalidate relevant caches
    await redisClient.helper.delPattern('trending:*');

    logger.info('Updated trending hashtags and invalidated caches');
  } catch (error) {
    logger.error('Error handling tweet created event:', error);
    throw error;
  }
};

/**
 * Handle tweet interaction events (like, unlike, retweet)
 * - Invalidate specific tweet cache
 */
const handleTweetInteraction = async (event) => {
  logger.info('Processing tweet interaction:', { eventType: event.eventType, tweetId: event.data?.tweetId });

  if (event.data?.tweetId) {
    await redisClient.helper.del(`tweet:${event.data.tweetId}`);
    logger.debug(`Invalidated cache for tweet ${event.data.tweetId}`);
  }
};

/**
 * Handle user follow events
 * - Update Redis relationship graph for recommendations
 * - Invalidate and refresh follower's feed cache
 */
const handleUserFollowed = async (event) => {
  const { followerId, followingId } = event;

  if (!followerId || !followingId) {
    logger.warn('Missing followerId or followingId in USER_FOLLOWED event');
    return;
  }

  logger.info('Processing follow event:', { followerId, followingId });

  try {
    // Maintain plain sets for SINTER-based hot followee lookup at timeline read time
    // user:{X}:following — who X follows (plain set, enables SINTER with hot_users)
    // user:{X}:followers — who follows X (plain set)
    await Promise.all([
      redisClient.sadd(CACHE_KEYS.USER_FOLLOWING(followerId), followingId.toString()),
      redisClient.sadd(CACHE_KEYS.USER_FOLLOWERS(followingId), followerId.toString())
    ]);

    logger.debug('Updated user relationship sets in Redis');

    // Check if the followed user is hot — if so add to hot_users set
    const userResult = await db.query(
      'SELECT follower_count FROM users WHERE id = $1',
      [followingId],
      { write: false }
    );
    if (userResult.rows.length > 0 && userResult.rows[0].follower_count >= HOT_USER_THRESHOLD) {
      await redisClient.sadd(CACHE_KEYS.HOT_USERS, followingId.toString());
      logger.debug(`User ${followingId} is hot, added to hot_users set`);
    }

    // Invalidate follower's cached feed — will be rebuilt on next timeline request
    await redisClient.helper.del(CACHE_KEYS.FEED(followerId));
    logger.debug(`Invalidated feed cache for follower ${followerId}`);
  } catch (error) {
    logger.error(`Error processing follow event: ${followerId} → ${followingId}:`, error);
    throw error;
  }
};

/**
 * Handle user unfollow events
 * - Remove from Redis relationship sets
 * - Invalidate follower's feed cache
 */
const handleUserUnfollowed = async (event) => {
  const { followerId, followingId } = event;

  if (!followerId || !followingId) {
    logger.warn('Missing followerId or followingId in USER_UNFOLLOWED event');
    return;
  }

  logger.info('Processing unfollow event:', { followerId, followingId });

  try {
    await Promise.all([
      redisClient.srem(CACHE_KEYS.USER_FOLLOWING(followerId), followingId.toString()),
      redisClient.srem(CACHE_KEYS.USER_FOLLOWERS(followingId), followerId.toString())
    ]);

    logger.debug('Updated user relationship sets in Redis after unfollow');

    // Check if followingId still qualifies as hot — if not remove from hot_users
    // Only remove if no one else would have added them (i.e. their count dropped below threshold)
    const userResult = await db.query(
      'SELECT follower_count FROM users WHERE id = $1',
      [followingId],
      { write: false }
    );
    if (userResult.rows.length > 0 && userResult.rows[0].follower_count < HOT_USER_THRESHOLD) {
      await redisClient.srem(CACHE_KEYS.HOT_USERS, followingId.toString());
      logger.debug(`User ${followingId} dropped below hot threshold, removed from hot_users set`);
    }

    // Invalidate follower's cached feed
    await redisClient.helper.del(CACHE_KEYS.FEED(followerId));
    logger.debug(`Invalidated feed cache for follower ${followerId}`);
  } catch (error) {
    logger.error(`Error processing unfollow event: ${followerId} → ${followingId}:`, error);
    throw error;
  }
};

/**
 * Route messages to appropriate handlers based on topic
 */
const topicHandlers = {
  'tweets': async (message) => {
    const event = parseMessage(message);
    if (event.eventType === 'tweet.created') {
      await handleTweetCreated(event);
    }
  },

  'tweet-interactions': async (message) => {
    const event = parseMessage(message);
    await handleTweetInteraction(event);
  },

  'user-interactions': async (message) => {
    const event = parseMessage(message);
    if (event.eventType === 'user.followed' || event.eventType === 'USER_FOLLOWED') {
      await handleUserFollowed(event);
    } else if (event.eventType === 'user.unfollowed' || event.eventType === 'USER_UNFOLLOWED') {
      await handleUserUnfollowed(event);
    }
  }
};

/**
 * Start the feed consumer
 */
const start = async () => {
  try {
    await consumer.connect();
    logger.info('Feed consumer connected to Kafka');

    await consumer.subscribe({
      topics: ['tweets', 'tweet-interactions', 'user-interactions'],
      fromBeginning: false
    });

    logger.info('Feed consumer subscribed to topics: tweets, tweet-interactions, user-interactions');

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          logger.debug(`Feed consumer received message on ${topic}:${partition}`, {
            offset: message.offset,
            key: message.key?.toString(),
          });

          const handler = topicHandlers[topic];
          if (handler) {
            await handler(message);
          } else {
            logger.warn(`Feed consumer: no handler for topic ${topic}`);
          }
        } catch (error) {
          logger.error('Feed consumer error processing message:', error);
          // Continue processing other messages
        }
      },
    });

    isRunning = true;
    logger.info('Feed consumer started successfully');
  } catch (error) {
    logger.error('Failed to start feed consumer:', error);
    throw error;
  }
};

/**
 * Stop the feed consumer gracefully
 */
const stop = async () => {
  try {
    await consumer.disconnect();
    isRunning = false;
    logger.info('Feed consumer disconnected');
  } catch (error) {
    logger.error('Error stopping feed consumer:', error);
    throw error;
  }
};

// Start consumer if this is the main module
if (require.main === module) {
  start().catch((error) => {
    logger.error('Fatal error starting feed consumer:', error);
    process.exit(1);
  });

  // Graceful shutdown handlers
  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down feed consumer...`);
    await stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = {
  start,
  stop,
  isRunning: () => isRunning,
  // Export for backward compatibility
  startConsumer: start,
  stopConsumer: stop,
};
