const { Kafka, logLevel } = require('kafkajs');
const logger = require('../../utils/logger');
const db = require('../../database/pool');
const redisClient = require('../redis');

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'twitter-backend',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:29092').split(','),
  logLevel: logLevel.ERROR,
  // Retry configuration for automatic reconnection
  retry: {
    initialRetryTime: 300,
    retries: Number.MAX_SAFE_INTEGER, // Keep retrying indefinitely
    maxRetryTime: 30000, // Max 30 seconds between retries
    factor: 2, // Exponential backoff factor
  },
});

const consumer = kafka.consumer({
  groupId: 'twitter-consumer-group',
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
  // Automatic retry on rebalance
  rebalanceTimeout: 60000,
  retry: {
    retries: Number.MAX_SAFE_INTEGER,
  },
});

// Event handlers for different topics
const eventHandlers = {
  'tweets': async (message) => {
    const event = JSON.parse(message.value.toString());
    
    if (event.eventType === 'tweet.created') {
      logger.info('Processing tweet created event:', event.data);
      
      // Update materialized views
      try {
        await db.query(
          'REFRESH MATERIALIZED VIEW CONCURRENTLY trending_hashtags',
          [],
          { write: true }
        );
        
        // Invalidate relevant caches
        await redisClient.helper.delPattern('timeline:*');
        await redisClient.helper.delPattern('trending:*');
        
        logger.info('Updated trending hashtags and invalidated caches');
      } catch (error) {
        logger.error('Error processing tweet created event:', error);
      }
    }
  },
  
  'tweet-interactions': async (message) => {
    const event = JSON.parse(message.value.toString());
    
    logger.info('Processing tweet interaction:', event);
    
    // Invalidate tweet cache
    if (event.data?.tweetId) {
      await redisClient.helper.del(`tweet:${event.data.tweetId}`);
    }
  },
  
  'user-interactions': async (message) => {
    const event = JSON.parse(message.value.toString());
    
    logger.info('Processing user interaction:', event);
    
    // Update user relationship graph in Redis (for recommendations)
    if (event.eventType === 'user.followed') {
      const { followerId, followingId } = event.data;
      
      try {
        // Store in Redis sorted set for quick lookups
        await redisClient.zadd(
          `user:${followerId}:following`,
          Date.now(),
          followingId.toString()
        );
        
        await redisClient.zadd(
          `user:${followingId}:followers`,
          Date.now(),
          followerId.toString()
        );
        
        logger.info('Updated user relationship graph in Redis');
      } catch (error) {
        logger.error('Error updating user relationships:', error);
      }
    }
  },
  
  'user-events': async (message) => {
    const event = JSON.parse(message.value.toString());
    
    if (event.eventType === 'user.registered') {
      logger.info('New user registered:', event.data);
      
      // Could trigger welcome email, initialize recommendations, etc.
      // This demonstrates event-driven architecture
    }
  }
};

const startConsumer = async () => {
  try {
    await consumer.connect();
    logger.info('Kafka consumer connected');
    
    // Subscribe to all topics
    await consumer.subscribe({ 
      topics: ['tweets', 'tweet-interactions', 'user-interactions', 'user-events'],
      fromBeginning: false 
    });
    
    logger.info('Subscribed to Kafka topics');
    
    // Start consuming messages
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          logger.debug(`Received message on ${topic}:${partition}`, {
            offset: message.offset,
            key: message.key?.toString(),
          });
          
          const handler = eventHandlers[topic];
          if (handler) {
            await handler(message);
          } else {
            logger.warn(`No handler for topic: ${topic}`);
          }
        } catch (error) {
          logger.error('Error processing message:', error);
          // Don't throw - continue processing other messages
        }
      },
    });
    
    logger.info('Kafka consumer started successfully');
  } catch (error) {
    logger.error('Failed to start Kafka consumer:', error);
    throw error;
  }
};

const stopConsumer = async () => {
  try {
    await consumer.disconnect();
    logger.info('Kafka consumer disconnected');
  } catch (error) {
    logger.error('Error stopping Kafka consumer:', error);
    throw error;
  }
};

// Start consumer if this is the main module
if (require.main === module) {
  startConsumer().catch((error) => {
    logger.error('Fatal error starting consumer:', error);
    process.exit(1);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down consumer...');
    await stopConsumer();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down consumer...');
    await stopConsumer();
    process.exit(0);
  });
}

module.exports = {
  startConsumer,
  stopConsumer,
};
