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
  transactionalId: 'twitter-producer',
  maxInFlightRequests: 5,
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

// Helper functions for common events
const publishTweetCreated = async (tweet) => {
  await sendEvent('tweets', [{
    key: tweet.id.toString(),
    value: JSON.stringify({
      eventType: Events.TWEET_CREATED,
      timestamp: new Date().toISOString(),
      data: tweet
    }),
    headers: {
      'event-type': Events.TWEET_CREATED
    }
  }]);
};

const publishTweetLiked = async (tweetId, userId) => {
  await sendEvent('tweet-interactions', [{
    key: tweetId.toString(),
    value: JSON.stringify({
      eventType: Events.TWEET_LIKED,
      timestamp: new Date().toISOString(),
      data: { tweetId, userId }
    }),
    headers: {
      'event-type': Events.TWEET_LIKED
    }
  }]);
};

const publishUserFollowed = async (followerId, followingId) => {
  await sendEvent('user-interactions', [{
    key: followerId.toString(),
    value: JSON.stringify({
      eventType: Events.USER_FOLLOWED,
      timestamp: new Date().toISOString(),
      data: { followerId, followingId }
    }),
    headers: {
      'event-type': Events.USER_FOLLOWED
    }
  }]);
};

module.exports = {
  connect,
  disconnect,
  sendEvent,
  isConnected: () => isConnected,
  Events,
  publishTweetCreated,
  publishTweetLiked,
  publishUserFollowed
};
