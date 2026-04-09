/**
 * Search Indexing Consumer - Handles Elasticsearch indexing via Kafka events
 * 
 * Responsibilities:
 * - Index new tweets in Elasticsearch
 * - Delete tweets from index when removed
 * - Index new users in Elasticsearch
 * - Handle search-related event logging
 */

const { Kafka, logLevel } = require('kafkajs');
const logger = require('../../utils/logger');
const elasticsearch = require('../elasticsearch/client');

// Kafka client configuration
const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'twitter-search-consumer',
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
  groupId: 'search-indexing-group',
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
    logger.error('Search consumer JSON parse error:', error);
    throw error;
  }
};

/**
 * Index a new tweet in Elasticsearch
 */
const handleTweetCreated = async (event) => {
  const tweetData = {
    id: event.tweetId,
    user_id: event.userId,
    content: event.content,
    reply_to_tweet_id: event.replyToTweetId,
    media_urls: event.mediaUrls,
    hashtags: event.hashtags,
    mentions: event.mentions,
    timestamp: event.timestamp
  };

  await elasticsearch.indexTweet(tweetData);
  logger.info(`Indexed tweet ${event.tweetId} in Elasticsearch`);
};

/**
 * Remove a tweet from Elasticsearch index
 */
const handleTweetDeleted = async (event) => {
  await elasticsearch.deleteTweet(event.tweetId);
  logger.info(`Deleted tweet ${event.tweetId} from Elasticsearch index`);
};

/**
 * Index a new user in Elasticsearch
 */
const handleUserRegistered = async (event) => {
  const userData = {
    id: event.userId,
    username: event.username,
    email: event.email,
    display_name: event.displayName,
    created_at: event.createdAt
  };

  await elasticsearch.indexUser(userData);
  logger.info(`Indexed user ${event.userId} in Elasticsearch`);
};

/**
 * Process tweet-related events
 */
const processTweetEvent = async (message) => {
  const event = parseMessage(message);
  const eventType = event.eventType;

  logger.debug(`Processing tweet event: ${eventType}`);

  switch (eventType) {
    case 'tweet.created':
      await handleTweetCreated(event);
      break;

    case 'tweet.deleted':
      await handleTweetDeleted(event);
      break;

    case 'tweet.liked':
      logger.debug(`Like event for tweet ${event.tweetId}`);
      break;

    case 'tweet.unliked':
      logger.debug(`Unlike event for tweet ${event.tweetId}`);
      break;

    case 'tweet.retweeted':
      logger.debug(`Retweet event for tweet ${event.tweetId}`);
      break;

    default:
      logger.warn(`Search consumer: unknown tweet event type: ${eventType}`);
  }
};

/**
 * Process user-related events
 */
const processUserEvent = async (message) => {
  const event = parseMessage(message);
  const eventType = event.eventType;

  logger.debug(`Processing user event: ${eventType}`);

  switch (eventType) {
    case 'user.registered':
      await handleUserRegistered(event);
      break;

    case 'user.followed':
    case 'user.unfollowed':
      logger.debug(`Follow event: ${event.followerId} -> ${event.followingId}`);
      break;

    default:
      logger.warn(`Search consumer: unknown user event type: ${eventType}`);
  }
};

/**
 * Route messages to appropriate handlers based on topic
 */
const topicHandlers = {
  'tweets': processTweetEvent,
  'tweet-interactions': processTweetEvent,
  'user-interactions': processUserEvent,
  'user-events': processUserEvent
};

/**
 * Start the search indexing consumer
 */
const start = async () => {
  try {
    // Connect to Elasticsearch first
    await elasticsearch.connect();
    logger.info('Search consumer connected to Elasticsearch');

    // Connect to Kafka
    await consumer.connect();
    logger.info('Search consumer connected to Kafka');

    // Subscribe to relevant topics
    await consumer.subscribe({
      topics: ['tweets', 'tweet-interactions', 'user-interactions', 'user-events'],
      fromBeginning: false
    });

    logger.info('Search consumer subscribed to topics: tweets, tweet-interactions, user-interactions, user-events');

    // Start consuming messages
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          logger.debug(`Search consumer received message from ${topic}:${partition}`);

          const handler = topicHandlers[topic];
          if (handler) {
            await handler(message);
          } else {
            logger.warn(`Search consumer: no handler for topic ${topic}`);
          }
        } catch (error) {
          logger.error(`Search consumer error processing message from ${topic}:`, error);
          // Continue processing other messages
        }
      }
    });

    isRunning = true;
    logger.info('Search indexing consumer started successfully');
  } catch (error) {
    logger.error('Failed to start search indexing consumer:', error);
    throw error;
  }
};

/**
 * Stop the search consumer gracefully
 */
const stop = async () => {
  try {
    await consumer.disconnect();
    isRunning = false;
    logger.info('Search consumer disconnected');
  } catch (error) {
    logger.error('Error stopping search consumer:', error);
    throw error;
  }
};

// Start consumer if this is the main module
if (require.main === module) {
  start().catch((error) => {
    logger.error('Fatal error starting search consumer:', error);
    process.exit(1);
  });

  // Graceful shutdown handlers
  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down search consumer...`);
    await stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = {
  start,
  stop,
  isRunning: () => isRunning
};
