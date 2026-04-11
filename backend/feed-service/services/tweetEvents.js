const { logger, kafkaProducer } = require('../../shared');
const { db } = require('../../shared');

/**
 * Publish tweet created event to Kafka
 * Search service consumes from tweets topic and indexes in Elasticsearch
 */
async function publishToKafka(tweet) {
  try {
    await kafkaProducer.publishTweetCreated(tweet);
    logger.info(`Tweet ${tweet.id} published to Kafka`);
  } catch (error) {
    logger.error(`Failed to publish tweet ${tweet.id} to Kafka:`, error);
  }
}

/**
 * Send notifications to all followers about new tweet via Kafka
 */
async function notifyFollowers(userId, tweet, username) {
  try {
    const followersResult = await db.query(
      'SELECT id FROM users WHERE id IN (SELECT follower_id FROM follows WHERE following_id = $1)',
      [userId],
      { write: false }
    );
    
    let notificationCount = 0;
    for (const follower of followersResult.rows) {
      try {
        await kafkaProducer.publishNotification(follower.id, 'new_tweet', {
          message: `${username} posted a new tweet`,
          tweet_id: tweet.id,
          from_user_id: userId
        });
        notificationCount++;
      } catch (error) {
        logger.warn(`Failed to queue notification for follower ${follower.id}:`, error.message);
      }
    }
    
    logger.info(`Notification events queued for ${notificationCount} followers of user ${userId}`);
  } catch (error) {
    logger.warn(`Failed to send notifications for tweet ${tweet.id}:`, error.message);
  }
}

/**
 * Publish all tweet-related events after tweet creation
 * - Publishes to Kafka 'tweets' topic (consumed by feedConsumer and searchIndexingConsumer)
 * - Queues notification events for followers
 */
async function publishTweetEvents(tweet, userId) {
  try {
    // Run all event publishing in parallel
    await Promise.allSettled([
      publishToKafka(tweet),
      notifyFollowers(userId, tweet, tweet.username)
    ]);
    
    logger.info(`All events published for tweet ${tweet.id}`);
  } catch (error) {
    logger.error(`Error publishing tweet events for tweet ${tweet.id}:`, error);
  }
}

module.exports = {
  publishTweetEvents,
  publishToKafka,
  notifyFollowers
};
