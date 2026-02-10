const express = require('express');
const { db, logger, authenticate } = require('../shared');
const redisClient = require('../shared/services/redis');

const router = express.Router();

// Get user timeline
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { limit = 50, offset = 0 } = req.query;

    // Get timeline for authenticated user (following + own tweets)
    const query = `
      SELECT t.*, u.username, u.display_name, u.avatar_url,
             CASE WHEN l.user_id IS NOT NULL THEN true ELSE false END as liked,
             CASE WHEN r.user_id IS NOT NULL THEN true ELSE false END as retweeted,
             rt_count.retweet_count,
             lk_count.like_count
      FROM tweets t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN likes l ON t.id = l.tweet_id AND l.user_id = $1
      LEFT JOIN retweets r ON t.id = r.tweet_id AND r.user_id = $1
      LEFT JOIN (
        SELECT tweet_id, COUNT(*) as retweet_count
        FROM retweets
        GROUP BY tweet_id
      ) rt_count ON t.id = rt_count.tweet_id
      LEFT JOIN (
        SELECT tweet_id, COUNT(*) as like_count
        FROM likes
        GROUP BY tweet_id
      ) lk_count ON t.id = lk_count.tweet_id
      WHERE t.user_id = $1 OR t.user_id IN (
        SELECT following_id FROM follows WHERE follower_id = $1
      )
      ORDER BY t.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const params = [userId, limit, offset];

    const result = await db.query(query, params);

    res.json({
      tweets: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: result.rows.length === parseInt(limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching timeline:', error);
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

// Get trending hashtags
router.get('/trending/hashtags', async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const query = `
      SELECT
        LOWER(SUBSTRING(content FROM '#([a-zA-Z0-9_]+)')) as hashtag,
        COUNT(*) as count
      FROM tweets
      WHERE content LIKE '%#%'
        AND created_at > NOW() - INTERVAL '24 hours'
      GROUP BY LOWER(SUBSTRING(content FROM '#([a-zA-Z0-9_]+)'))
      ORDER BY count DESC
      LIMIT $1
    `;

    const result = await db.query(query, [limit]);

    res.json({
      hashtags: result.rows.map(row => ({
        hashtag: row.hashtag,
        count: parseInt(row.count)
      }))
    });
  } catch (error) {
    logger.error('Error fetching trending hashtags:', error);
    res.status(500).json({ error: 'Failed to fetch trending hashtags' });
  }
});

// Search tweets by hashtag
router.get('/search/hashtag/:hashtag', authenticate, async (req, res) => {
  try {
    const { hashtag } = req.params;
    const userId = req.user.userId;
    const { limit = 50, offset = 0 } = req.query;

    const query = `
      SELECT t.*, u.username, u.display_name, u.avatar_url,
             CASE WHEN l.user_id IS NOT NULL THEN true ELSE false END as liked,
             CASE WHEN r.user_id IS NOT NULL THEN true ELSE false END as retweeted,
             rt_count.retweet_count,
             lk_count.like_count
      FROM tweets t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN likes l ON t.id = l.tweet_id AND l.user_id = $1
      LEFT JOIN retweets r ON t.id = r.tweet_id AND r.user_id = $1
      LEFT JOIN (
        SELECT tweet_id, COUNT(*) as retweet_count
        FROM retweets
        GROUP BY tweet_id
      ) rt_count ON t.id = rt_count.tweet_id
      LEFT JOIN (
        SELECT tweet_id, COUNT(*) as like_count
        FROM likes
        GROUP BY tweet_id
      ) lk_count ON t.id = lk_count.tweet_id
      WHERE LOWER(t.content) LIKE LOWER($2)
      ORDER BY t.created_at DESC
      LIMIT $3 OFFSET $4
    `;
    const params = [userId, `%#${hashtag}%`, limit, offset];

    const result = await db.query(query, params);

    res.json({
      tweets: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: result.rows.length === parseInt(limit)
      }
    });
  } catch (error) {
    logger.error('Error searching hashtag:', error);
    res.status(500).json({ error: 'Failed to search hashtag' });
  }
});

// Get tweets by username
router.get('/users/:username/tweets', authenticate, async (req, res) => {
  try {
    const { username } = req.params;
    const userId = req.user.userId;
    const { limit = 50, offset = 0 } = req.query;

    // First get the user ID from username
    const userResult = await db.query(
      'SELECT id FROM users WHERE username = $1',
      [username],
      { write: false }
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUserId = userResult.rows[0].id;

    const query = `
      SELECT t.*, u.username, u.display_name, u.avatar_url,
             CASE WHEN l.user_id IS NOT NULL THEN true ELSE false END as liked,
             CASE WHEN r.user_id IS NOT NULL THEN true ELSE false END as retweeted,
             rt_count.retweet_count,
             lk_count.like_count
      FROM tweets t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN likes l ON t.id = l.tweet_id AND l.user_id = $1
      LEFT JOIN retweets r ON t.id = r.tweet_id AND r.user_id = $1
      LEFT JOIN (
        SELECT tweet_id, COUNT(*) as retweet_count
        FROM retweets
        GROUP BY tweet_id
      ) rt_count ON t.id = rt_count.tweet_id
      LEFT JOIN (
        SELECT tweet_id, COUNT(*) as like_count
        FROM likes
        GROUP BY tweet_id
      ) lk_count ON t.id = lk_count.tweet_id
      WHERE t.user_id = $2
      ORDER BY t.created_at DESC
      LIMIT $3 OFFSET $4
    `;
    const params = [userId, targetUserId, limit, offset];

    const result = await db.query(query, params);

    res.json({
      tweets: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: result.rows.length === parseInt(limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching user tweets:', error);
    res.status(500).json({ error: 'Failed to fetch user tweets' });
  }
});

module.exports = router;