const { Kafka, logLevel } = require('kafkajs');
const logger = require('../../utils/logger');
const schemaRegistry = require('../../schemas/schemaRegistry');

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'twitter-backend',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:29092').split(','),
  logLevel: logLevel.ERROR,
  retry: {
    initialRetryTime: 100,
    retries: 8
  }
});

const producer = kafka.producer({
  allowAutoTopicCreation: true,
  transactionalId: 'twitter-producer',
  maxInFlightRequests: 5,
  idempotent: true
});

let isConnected = false;

const connect = async () => {
  try {
    // Connect to Schema Registry first
    await schemaRegistry.connect();
    logger.info('Schema Registry connected');
    
    await producer.connect();
    isConnected = true;
    logger.info('Kafka producer connected');
  } catch (error) {
    logger.error('Kafka producer connection error:', error);
    throw error;
  }
};

const disconnect = async () => {
  try {
    await producer.disconnect();
    isConnected = false;
    logger.info('Kafka producer disconnected');
  } catch (error) {
    logger.error('Kafka producer disconnect error:', error);
    throw error;
  }
};

const sendEvent = async (topic, messages, transaction = false) => {
  if (!isConnected) {
    logger.warn('Kafka producer not connected, attempting to connect...');
    await connect();
  }
  
  try {
    if (transaction) {
      const txn = await producer.transaction();
      try {
        await txn.send({
          topic,
          messages
        });
        await txn.commit();
      } catch (error) {
        await txn.abort();
        throw error;
      }
    } else {
      await producer.send({
        topic,
        messages
      });
    }
    
    logger.info(`Event sent to topic ${topic}:`, { messageCount: messages.length });
  } catch (error) {
    logger.error('Kafka send error:', error);
    throw error;
  }
};

/**
 * Send Avro-encoded message via Schema Registry
 * @param {string} topic - Kafka topic
 * @param {string} schemaName - Name of the Avro schema (e.g., 'tweet-created')
 * @param {object} data - Data to encode
 * @param {string|number} key - Message key
 */
const sendAvroEvent = async (topic, schemaName, data, key) => {
  if (!isConnected) {
    logger.warn('Kafka producer not connected, attempting to connect...');
    await connect();
  }

  try {
    const message = await schemaRegistry.createKafkaMessage(schemaName, data, key);
    
    await producer.send({
      topic,
      messages: [message]
    });
    
    logger.info(`Avro event sent to topic ${topic}:`, { schemaName, key });
  } catch (error) {
    logger.error(`Avro send error for ${schemaName}:`, error);
    throw error;
  }
};

// Event types
const Events = {
  TWEET_CREATED: 'tweet.created',
  TWEET_DELETED: 'tweet.deleted',
  TWEET_LIKED: 'tweet.liked',
  TWEET_UNLIKED: 'tweet.unliked',
  TWEET_RETWEETED: 'tweet.retweeted',
  USER_FOLLOWED: 'user.followed',
  USER_UNFOLLOWED: 'user.unfollowed',
  USER_REGISTERED: 'user.registered'
};

/**
 * Publish tweet created event with Avro encoding
 */
const publishTweetCreated = async (tweet) => {
  // Transform data to match Avro schema
  const avroData = {
    eventType: Events.TWEET_CREATED,
    timestamp: new Date().toISOString(),
    tweetId: parseInt(tweet.id),
    userId: parseInt(tweet.user_id),
    content: tweet.content,
    replyToTweetId: tweet.reply_to_tweet_id ? parseInt(tweet.reply_to_tweet_id) : null,
    mediaUrls: tweet.media_urls || [],
    hashtags: extractHashtags(tweet.content),
    mentions: extractMentions(tweet.content),
    createdAt: tweet.created_at || new Date().toISOString()
  };

  await sendAvroEvent('tweets', 'tweet-created', avroData, tweet.id);
};

/**
 * Publish tweet liked event with Avro encoding
 */
const publishTweetLiked = async (tweetId, userId) => {
  const avroData = {
    eventType: 'LIKE',
    timestamp: new Date().toISOString(),
    tweetId: parseInt(tweetId),
    userId: parseInt(userId),
    metadata: null
  };

  await sendAvroEvent('tweet-interactions', 'tweet-interaction', avroData, tweetId);
};

/**
 * Publish tweet unliked event with Avro encoding
 */
const publishTweetUnliked = async (tweetId, userId) => {
  const avroData = {
    eventType: 'UNLIKE',
    timestamp: new Date().toISOString(),
    tweetId: parseInt(tweetId),
    userId: parseInt(userId),
    metadata: null
  };

  await sendAvroEvent('tweet-interactions', 'tweet-interaction', avroData, tweetId);
};

/**
 * Publish user followed event with Avro encoding
 */
const publishUserFollowed = async (followerId, followingId) => {
  const avroData = {
    eventType: Events.USER_FOLLOWED,
    timestamp: new Date().toISOString(),
    followerId: parseInt(followerId),
    followingId: parseInt(followingId),
    createdAt: new Date().toISOString()
  };

  await sendAvroEvent('user-interactions', 'user-followed', avroData, followerId);
};

/**
 * Publish user registered event with Avro encoding
 */
const publishUserRegistered = async (user) => {
  // Convert Date object to ISO string if needed
  let createdAtStr = user.created_at;
  if (createdAtStr instanceof Date) {
    createdAtStr = createdAtStr.toISOString();
  } else if (!createdAtStr) {
    createdAtStr = new Date().toISOString();
  }

  const avroData = {
    eventType: Events.USER_REGISTERED,
    timestamp: new Date().toISOString(),
    userId: parseInt(user.id),
    username: user.username,
    email: user.email,
    displayName: user.display_name || user.username,
    createdAt: createdAtStr
  };

  await sendAvroEvent('user-events', 'user-registered', avroData, user.id);
};

// Helper functions to extract hashtags and mentions from tweet content
const extractHashtags = (content) => {
  const hashtags = content.match(/#\w+/g) || [];
  return hashtags.map(tag => tag.substring(1)); // Remove # prefix
};

const extractMentions = (content) => {
  const mentions = content.match(/@\w+/g) || [];
  return mentions.map(mention => mention.substring(1)); // Remove @ prefix
};

module.exports = {
  connect,
  disconnect,
  sendEvent,
  sendAvroEvent,
  isConnected: () => isConnected,
  Events,
  publishTweetCreated,
  publishTweetLiked,
  publishTweetUnliked,
  publishUserFollowed,
  publishUserRegistered,
  schemaRegistry
};
