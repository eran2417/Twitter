const { Kafka, logLevel } = require('kafkajs');
const logger = require('../../utils/logger');

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
  idempotent: true
});

let isConnected = false;

const connect = async () => {
  try {
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

/**
 * Send JSON message to Kafka topic
 * @param {string} topic - Kafka topic name
 * @param {object} data - Message data
 * @param {string|number} key - Message key for partitioning
 */
const sendEvent = async (topic, data, key) => {
  if (!isConnected) {
    logger.warn('Kafka producer not connected, attempting to connect...');
    try {
      await connect();
    } catch (connectError) {
      logger.warn('Kafka not available, skipping event publishing:', connectError.message);
      return;
    }
  }

  try {
    await producer.send({
      topic,
      messages: [{
        key: String(key),
        value: JSON.stringify(data)
      }]
    });
    
    logger.debug(`Event sent to topic ${topic}:`, { key });
  } catch (error) {
    logger.error(`Send error for topic ${topic}:`, error);
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
 * Publish tweet created event
 */
const publishTweetCreated = async (tweet) => {
  const data = {
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

  await sendEvent('tweets', data, tweet.id);
};

/**
 * Publish tweet liked event
 */
const publishTweetLiked = async (tweetId, userId) => {
  const data = {
    eventType: Events.TWEET_LIKED,
    timestamp: new Date().toISOString(),
    tweetId: parseInt(tweetId),
    userId: parseInt(userId)
  };

  await sendEvent('tweet-interactions', data, tweetId);
};

/**
 * Publish tweet unliked event
 */
const publishTweetUnliked = async (tweetId, userId) => {
  const data = {
    eventType: Events.TWEET_UNLIKED,
    timestamp: new Date().toISOString(),
    tweetId: parseInt(tweetId),
    userId: parseInt(userId)
  };

  await sendEvent('tweet-interactions', data, tweetId);
};

/**
 * Publish tweet retweeted event
 */
const publishTweetRetweeted = async (tweetId, userId) => {
  const data = {
    eventType: Events.TWEET_RETWEETED,
    timestamp: new Date().toISOString(),
    tweetId: parseInt(tweetId),
    userId: parseInt(userId)
  };

  await sendEvent('tweet-interactions', data, tweetId);
};

/**
 * Publish user followed event
 */
const publishUserFollowed = async (followerId, followingId) => {
  const data = {
    eventType: Events.USER_FOLLOWED,
    timestamp: new Date().toISOString(),
    followerId: parseInt(followerId),
    followingId: parseInt(followingId),
    createdAt: new Date().toISOString()
  };

  await sendEvent('user-interactions', data, followerId);
};

/**
 * Publish user registered event
 */
const publishUserRegistered = async (user) => {
  let createdAtStr = user.created_at;
  if (createdAtStr instanceof Date) {
    createdAtStr = createdAtStr.toISOString();
  } else if (!createdAtStr) {
    createdAtStr = new Date().toISOString();
  }

  const data = {
    eventType: Events.USER_REGISTERED,
    timestamp: new Date().toISOString(),
    userId: parseInt(user.id),
    username: user.username,
    email: user.email,
    displayName: user.display_name || user.username,
    location: user.location || null,
    createdAt: createdAtStr
  };

  await sendEvent('user-events', data, user.id);
};

/**
 * Publish notification event
 */
const publishNotification = async (userId, notificationType, notificationData) => {
  const data = {
    eventType: 'NOTIFICATION_SENT',
    timestamp: new Date().toISOString(),
    userId: parseInt(userId),
    notificationType: notificationType,
    message: notificationData.message || '',
    tweetId: notificationData.tweet_id ? parseInt(notificationData.tweet_id) : null,
    fromUserId: notificationData.from_user_id ? parseInt(notificationData.from_user_id) : null,
    metadata: JSON.stringify(notificationData)
  };

  await sendEvent('notifications', data, userId);
};

// Helper functions to extract hashtags and mentions from tweet content
const extractHashtags = (content) => {
  const hashtags = content.match(/#\w+/g) || [];
  return hashtags.map(tag => tag.substring(1));
};

const extractMentions = (content) => {
  const mentions = content.match(/@\w+/g) || [];
  return mentions.map(mention => mention.substring(1));
};

module.exports = {
  connect,
  disconnect,
  sendEvent,
  isConnected: () => isConnected,
  Events,
  publishTweetCreated,
  publishTweetLiked,
  publishTweetUnliked,
  publishTweetRetweeted,
  publishUserFollowed,
  publishUserRegistered,
  publishNotification
};
