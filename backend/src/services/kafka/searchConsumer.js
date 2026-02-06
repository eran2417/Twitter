const { Kafka, logLevel } = require('kafkajs');
const logger = require('../../utils/logger');
const elasticsearch = require('../elasticsearch/client');

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'twitter-search-consumer',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:29092').split(','),
  logLevel: logLevel.ERROR,
  retry: {
    initialRetryTime: 100,
    retries: 8
  }
});

const consumer = kafka.consumer({
  groupId: 'search-indexing-group',
  sessionTimeout: 30000,
  heartbeatInterval: 3000
});

let isRunning = false;

/**
 * Process tweet events and index/update in Elasticsearch
 */
const processTweetEvent = async (message) => {
  try {
    const event = JSON.parse(message.value.toString());
    const eventType = event.eventType;
    
    logger.info(`Processing event: ${eventType}`, { tweetId: event.data?.id });
    
    switch (eventType) {
      case 'tweet.created':
        await elasticsearch.indexTweet(event.data);
        logger.info(`Indexed new tweet ${event.data.id}`);
        break;
        
      case 'tweet.deleted':
        await elasticsearch.deleteTweet(event.data.tweetId);
        logger.info(`Deleted tweet ${event.data.tweetId} from index`);
        break;
        
      case 'tweet.liked':
      case 'tweet.unliked':
        // Update like count - in production you'd fetch the actual count
        // For now, we'll skip count updates via Kafka and rely on periodic sync
        logger.info(`Like event for tweet ${event.data.tweetId}`);
        break;
        
      case 'tweet.retweeted':
        logger.info(`Retweet event for tweet ${event.data.tweetId}`);
        break;
        
      default:
        logger.warn(`Unknown event type: ${eventType}`);
    }
  } catch (error) {
    logger.error('Error processing tweet event:', error);
    throw error;
  }
};

/**
 * Process user events and index in Elasticsearch
 */
const processUserEvent = async (message) => {
  try {
    const event = JSON.parse(message.value.toString());
    const eventType = event.eventType;
    
    logger.info(`Processing user event: ${eventType}`);
    
    switch (eventType) {
      case 'user.registered':
        await elasticsearch.indexUser(event.data);
        logger.info(`Indexed new user ${event.data.id}`);
        break;
        
      case 'user.followed':
      case 'user.unfollowed':
        // Could update follower counts here
        logger.info(`Follow event: ${event.data.followerId} -> ${event.data.followingId}`);
        break;
        
      default:
        logger.warn(`Unknown user event type: ${eventType}`);
    }
  } catch (error) {
    logger.error('Error processing user event:', error);
    throw error;
  }
};

/**
 * Start the Kafka consumer
 */
const start = async () => {
  try {
    // Connect to Elasticsearch first
    await elasticsearch.connect();
    logger.info('Elasticsearch connected for consumer');
    
    // Connect consumer
    await consumer.connect();
    logger.info('Kafka consumer connected');
    
    // Subscribe to topics
    await consumer.subscribe({
      topics: ['tweets', 'tweet-interactions', 'user-interactions', 'user-events'],
      fromBeginning: false
    });
    
    logger.info('Subscribed to topics: tweets, tweet-interactions, user-interactions, user-events');
    
    // Start consuming
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        logger.info(`Received message from ${topic}:${partition}`);
        
        try {
          if (topic === 'tweets') {
            await processTweetEvent(message);
          } else if (topic === 'tweet-interactions') {
            await processTweetEvent(message);
          } else if (topic === 'user-interactions' || topic === 'user-events') {
            await processUserEvent(message);
          }
        } catch (error) {
          logger.error(`Error processing message from ${topic}:`, error);
          // In production, you might want to send to a dead letter queue
        }
      }
    });
    
    isRunning = true;
    logger.info('Kafka consumer started and listening for events');
  } catch (error) {
    logger.error('Failed to start Kafka consumer:', error);
    throw error;
  }
};

/**
 * Stop the consumer gracefully
 */
const stop = async () => {
  try {
    await consumer.disconnect();
    isRunning = false;
    logger.info('Kafka consumer disconnected');
  } catch (error) {
    logger.error('Error disconnecting Kafka consumer:', error);
    throw error;
  }
};

module.exports = {
  start,
  stop,
  isRunning: () => isRunning
};
