const { Kafka, logLevel } = require('kafkajs');
const logger = require('../../utils/logger');
const elasticsearch = require('../elasticsearch/client');
const schemaRegistry = require('../../schemas/schemaRegistry');

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
 * Check if message is Avro-encoded (has magic byte 0x00 prefix)
 */
const isAvroMessage = (buffer) => {
  return buffer && buffer.length > 5 && buffer[0] === 0x00;
};

/**
 * Decode message - handles both Avro (Schema Registry) and JSON formats
 */
const decodeMessage = async (message) => {
  const value = message.value;
  
  // Check if it's Avro-encoded (starts with magic byte 0x00)
  if (isAvroMessage(value)) {
    try {
      const decoded = await schemaRegistry.decode(value);
      logger.debug('Decoded Avro message:', decoded);
      return decoded;
    } catch (error) {
      logger.error('Avro decode error:', error);
      throw error;
    }
  }
  
  // Fallback to JSON parsing (backwards compatibility)
  try {
    return JSON.parse(value.toString());
  } catch (error) {
    logger.error('JSON parse error:', error);
    throw error;
  }
};

/**
 * Process tweet events and index/update in Elasticsearch
 */
const processTweetEvent = async (message) => {
  try {
    const event = await decodeMessage(message);
    const eventType = event.eventType;
    
    logger.info(`Processing event: ${eventType}`);
    
    switch (eventType) {
      case 'tweet.created':
        // Avro message has flattened structure
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
        logger.info(`Indexed new tweet ${event.tweetId}`);
        break;
        
      case 'tweet.deleted':
        await elasticsearch.deleteTweet(event.tweetId);
        logger.info(`Deleted tweet ${event.tweetId} from index`);
        break;
        
      // Handle interaction types (enum values from Avro schema)
      case 'LIKE':
      case 'UNLIKE':
      case 'tweet.liked':
      case 'tweet.unliked':
        logger.info(`Like event for tweet ${event.tweetId}`);
        break;
        
      case 'RETWEET':
      case 'UNRETWEET':
      case 'tweet.retweeted':
        logger.info(`Retweet event for tweet ${event.tweetId}`);
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
    const event = await decodeMessage(message);
    const eventType = event.eventType;
    
    logger.info(`Processing user event: ${eventType}`);
    
    switch (eventType) {
      case 'user.registered':
        // Avro message has flattened structure
        const userData = {
          id: event.userId,
          username: event.username,
          email: event.email,
          display_name: event.displayName,
          created_at: event.createdAt
        };
        await elasticsearch.indexUser(userData);
        logger.info(`Indexed new user ${event.userId}`);
        break;
        
      case 'user.followed':
      case 'user.unfollowed':
        logger.info(`Follow event: ${event.followerId} -> ${event.followingId}`);
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
    // Connect to Schema Registry first
    await schemaRegistry.connect();
    logger.info('Schema Registry connected for consumer');
    
    // Connect to Elasticsearch
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
