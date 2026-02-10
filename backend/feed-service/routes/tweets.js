const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { db, kafkaProducer, logger, authenticate, optionalAuth } = require('../shared');
const redisClient = require('../shared/services/redis');

const router = express.Router();

// Create tweet
router.post('/', authenticate,
  [
    body('content')
      .isLength({ min: 1, max: 280 })
      .withMessage('Tweet must be 1-280 characters'),
    body('replyToTweetId').optional().isInt(),
    body('mediaUrls').optional().isArray(),
    body('hashtags').optional().isArray(),
    body('mentions').optional().isArray()
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { content, replyToTweetId, mediaUrls, hashtags, mentions } = req.body;

      const result = await db.transaction(async (client) => {
        // Insert tweet
        const tweetResult = await client.query(
          `INSERT INTO tweets (user_id, content, reply_to_tweet_id, media_urls, hashtags, mentions)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, user_id, content, reply_to_tweet_id, media_urls, hashtags, mentions,
                     like_count, retweet_count, reply_count, created_at`,
          [req.user.userId, content, replyToTweetId || null, mediaUrls || [], hashtags || [], mentions || []]
        );

        const tweet = tweetResult.rows[0];

        // Update reply count if it's a reply
        if (replyToTweetId) {
          await client.query(
            'UPDATE tweets SET reply_count = reply_count + 1 WHERE id = $1',
            [replyToTweetId]
          );
        }

        // Get user info
        const userResult = await client.query(
          'SELECT username, display_name, avatar_url, verified FROM users WHERE id = $1',
          [req.user.userId]
        );

        return { ...tweet, ...userResult.rows[0] };
      });

      // Publish to Kafka
      try {
        await kafkaProducer.publishTweetCreated(result);
      } catch (kafkaError) {
        logger.error('Failed to publish tweet created event:', kafkaError);
      }

      // Invalidate timeline caches
      await redisClient.helper.delPattern(`timeline:${req.user.userId}:*`);

      // Notify via WebSocket
      const io = req.app.get('io');
      io.to(`timeline-${req.user.userId}`).emit('tweet-created', result);

      logger.info(`Tweet created by user ${req.user.userId}`);

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
);

// Get tweet by ID
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const cacheKey = `tweet:${id}`;
    const cached = await redisClient.helper.get(cacheKey);

    if (cached) {
      return res.json(cached);
    }

    const result = await db.query(
      `SELECT t.id, t.user_id, t.content, t.reply_to_tweet_id, t.media_urls,
              t.hashtags, t.mentions, t.like_count, t.retweet_count, t.reply_count,
              t.created_at, u.username, u.display_name, u.avatar_url, u.verified
       FROM tweets t
       JOIN users u ON t.user_id = u.id
       WHERE t.id = $1`,
      [id],
      { write: false }
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tweet not found' });
    }

    const tweet = result.rows[0];

    // If authenticated, check if user liked this tweet
    if (req.user) {
      const likeResult = await db.query(
        'SELECT 1 FROM likes WHERE user_id = $1 AND tweet_id = $2',
        [req.user.userId, id],
        { write: false }
      );
      tweet.isLiked = likeResult.rows.length > 0;
    }

    await redisClient.helper.set(cacheKey, tweet, 300);

    res.json(tweet);
  } catch (error) {
    next(error);
  }
});

// Like tweet
router.post('/:id/like', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    await db.transaction(async (client) => {
      // Check if already liked
      const existingLike = await client.query(
        'SELECT 1 FROM likes WHERE user_id = $1 AND tweet_id = $2',
        [req.user.userId, id]
      );

      if (existingLike.rows.length > 0) {
        throw { statusCode: 400, message: 'Tweet already liked' };
      }

      // Insert like
      await client.query(
        'INSERT INTO likes (user_id, tweet_id) VALUES ($1, $2)',
        [req.user.userId, id]
      );
    });

    // Publish to Kafka
    try {
      await kafkaProducer.publishTweetLiked(id, req.user.userId);
    } catch (kafkaError) {
      logger.error('Failed to publish tweet liked event:', kafkaError);
    }

    // Invalidate caches
    await redisClient.helper.del(`tweet:${id}`);

    res.json({ message: 'Tweet liked successfully' });
  } catch (error) {
    next(error);
  }
});

// Unlike tweet
router.delete('/:id/like', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'DELETE FROM likes WHERE user_id = $1 AND tweet_id = $2 RETURNING id',
      [req.user.userId, id],
      { write: true }
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Like not found' });
    }

    await redisClient.helper.del(`tweet:${id}`);

    res.json({ message: 'Tweet unliked successfully' });
  } catch (error) {
    next(error);
  }
});

// Delete tweet
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'DELETE FROM tweets WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.userId],
      { write: true }
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tweet not found or unauthorized' });
    }

    // Invalidate caches
    await redisClient.helper.del(`tweet:${id}`);
    await redisClient.helper.delPattern(`timeline:${req.user.userId}:*`);

    res.json({ message: 'Tweet deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Retweet
router.post('/:id/retweet', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    await db.transaction(async (client) => {
      // Check if already retweeted
      const existingRetweet = await client.query(
        'SELECT 1 FROM retweets WHERE user_id = $1 AND tweet_id = $2',
        [req.user.userId, id]
      );

      if (existingRetweet.rows.length > 0) {
        throw { statusCode: 400, message: 'Tweet already retweeted' };
      }

      // Insert retweet
      await client.query(
        'INSERT INTO retweets (user_id, tweet_id) VALUES ($1, $2)',
        [req.user.userId, id]
      );

      // Update retweet count
      await client.query(
        'UPDATE tweets SET retweet_count = retweet_count + 1 WHERE id = $1',
        [id]
      );
    });

    // Invalidate caches
    await redisClient.helper.del(`tweet:${id}`);

    res.json({ message: 'Tweet retweeted successfully' });
  } catch (error) {
    next(error);
  }
});

// Unretweet
router.delete('/:id/retweet', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await db.transaction(async (client) => {
      const deleteResult = await client.query(
        'DELETE FROM retweets WHERE user_id = $1 AND tweet_id = $2 RETURNING id',
        [req.user.userId, id]
      );

      if (deleteResult.rows.length === 0) {
        throw { statusCode: 404, message: 'Retweet not found' };
      }

      // Update retweet count
      await client.query(
        'UPDATE tweets SET retweet_count = retweet_count - 1 WHERE id = $1 AND retweet_count > 0',
        [id]
      );

      return deleteResult;
    });

    await redisClient.helper.del(`tweet:${id}`);

    res.json({ message: 'Retweet removed successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
