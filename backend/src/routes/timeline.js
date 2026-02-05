const express = require('express');
const { authenticate } = require('../middleware/auth');
const db = require('../database/pool');
const redisClient = require('../services/redis');
const logger = require('../utils/logger');

const router = express.Router();

// Get user's timeline (tweets from followed users)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    
    const cacheKey = `timeline:${req.user.userId}:${limit}:${offset}`;
    
    // Try cache first
    const cached = await redisClient.helper.getOrSet(
      cacheKey,
      async () => {
        // Fan-out on read approach (from "Designing Data-Intensive Applications")
        const result = await db.query(
          `SELECT t.id, t.user_id, t.content, t.reply_to_tweet_id, t.media_urls,
                  t.hashtags, t.mentions, t.like_count, t.retweet_count, t.reply_count,
                  t.created_at, u.username, u.display_name, u.avatar_url, u.verified
           FROM tweets t
           JOIN users u ON t.user_id = u.id
           WHERE t.user_id IN (
             SELECT following_id FROM follows WHERE follower_id = $1
             UNION
             SELECT $1
           )
           ORDER BY t.created_at DESC
           LIMIT $2 OFFSET $3`,
          [req.user.userId, limit, offset],
          { write: false }
        );
        
        return result.rows;
      },
      60 // Cache for 1 minute
    );

    // Add isLiked and isRetweeted status for each tweet, and refresh counts
    const tweetsWithStatus = await Promise.all(cached.map(async (tweet) => {
      const [likeResult, retweetResult, countsResult] = await Promise.all([
        db.query('SELECT 1 FROM likes WHERE user_id = $1 AND tweet_id = $2', [req.user.userId, tweet.id], { write: false }),
        db.query('SELECT 1 FROM retweets WHERE user_id = $1 AND tweet_id = $2', [req.user.userId, tweet.id], { write: false }),
        db.query('SELECT like_count, retweet_count, reply_count FROM tweets WHERE id = $1', [tweet.id], { write: false })
      ]);
      const freshCounts = countsResult.rows[0] || {};
      return {
        ...tweet,
        like_count: freshCounts.like_count ?? tweet.like_count,
        retweet_count: freshCounts.retweet_count ?? tweet.retweet_count,
        reply_count: freshCounts.reply_count ?? tweet.reply_count,
        isLiked: likeResult.rows.length > 0,
        isRetweeted: retweetResult.rows.length > 0
      };
    }));
    
    res.json({
      tweets: tweetsWithStatus,
      count: cached.length,
      offset,
      limit
    });
  } catch (error) {
    next(error);
  }
});

// Get trending hashtags
router.get('/trending/hashtags', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    
    const cacheKey = `trending:hashtags:${limit}`;
    
    const cached = await redisClient.helper.getOrSet(
      cacheKey,
      async () => {
        // Query from materialized view
        const result = await db.query(
          'SELECT hashtag, tweet_count, last_used FROM trending_hashtags LIMIT $1',
          [limit],
          { write: false }
        );
        
        return result.rows;
      },
      300 // Cache for 5 minutes
    );
    
    res.json(cached);
  } catch (error) {
    next(error);
  }
});

// Search tweets by hashtag
router.get('/search/hashtag/:hashtag', async (req, res, next) => {
  try {
    const { hashtag } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    
    const result = await db.query(
      `SELECT t.id, t.user_id, t.content, t.reply_to_tweet_id, t.media_urls,
              t.hashtags, t.mentions, t.like_count, t.retweet_count, t.reply_count,
              t.created_at, u.username, u.display_name, u.avatar_url, u.verified
       FROM tweets t
       JOIN users u ON t.user_id = u.id
       WHERE $1 = ANY(t.hashtags)
       ORDER BY t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [hashtag, limit, offset],
      { write: false }
    );
    
    res.json({
      hashtag,
      tweets: result.rows,
      count: result.rows.length,
      offset,
      limit
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
