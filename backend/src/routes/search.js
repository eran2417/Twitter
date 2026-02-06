const express = require('express');
const router = express.Router();
const elasticsearch = require('../services/elasticsearch/client');
const { optionalAuth } = require('../middleware/auth');
const logger = require('../utils/logger');
const pool = require('../database/pool');

/**
 * @route   GET /api/search/tweets
 * @desc    Search tweets by content, hashtags, or mentions
 * @access  Public
 */
router.get('/tweets', optionalAuth, async (req, res) => {
  try {
    const { q, page = 1, limit = 20, sort = 'relevance' } = req.query;
    
    if (!q || q.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    const results = await elasticsearch.searchTweets(q.trim(), {
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 50),
      sortBy: sort
    });
    
    // Enrich results with user interaction data if authenticated
    if (req.user && results.tweets.length > 0) {
      const tweetIds = results.tweets.map(t => t.id);
      
      // Check which tweets the user has liked
      const likesResult = await pool.query(
        'SELECT tweet_id FROM likes WHERE user_id = $1 AND tweet_id = ANY($2)',
        [req.user.userId, tweetIds]
      );
      const likedTweetIds = new Set(likesResult.rows.map(r => r.tweet_id.toString()));
      
      // Check which tweets the user has retweeted
      const retweetsResult = await pool.query(
        'SELECT tweet_id FROM retweets WHERE user_id = $1 AND tweet_id = ANY($2)',
        [req.user.userId, tweetIds]
      );
      const retweetedIds = new Set(retweetsResult.rows.map(r => r.tweet_id.toString()));
      
      results.tweets = results.tweets.map(tweet => ({
        ...tweet,
        isLiked: likedTweetIds.has(tweet.id),
        isRetweeted: retweetedIds.has(tweet.id)
      }));
    }
    
    res.json(results);
  } catch (error) {
    logger.error('Tweet search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * @route   GET /api/search/users
 * @desc    Search users by username or display name
 * @access  Public
 */
router.get('/users', optionalAuth, async (req, res) => {
  try {
    const { q, page = 1, limit = 10 } = req.query;
    
    if (!q || q.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    const results = await elasticsearch.searchUsers(q.trim(), {
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 50)
    });
    
    // Add following status if authenticated
    if (req.user && results.users.length > 0) {
      // Filter out current user from results
      results.users = results.users.filter(u => u.id !== req.user.userId.toString());
      results.total = results.users.length;
      
      const userIds = results.users.map(u => u.id);
      
      if (userIds.length > 0) {
        const followsResult = await pool.query(
          'SELECT following_id FROM follows WHERE follower_id = $1 AND following_id = ANY($2)',
          [req.user.userId, userIds]
        );
        const followingIds = new Set(followsResult.rows.map(r => r.following_id.toString()));
        
        results.users = results.users.map(user => ({
          ...user,
          isFollowing: followingIds.has(user.id),
          isCurrentUser: false
        }));
      }
    }
    
    res.json(results);
  } catch (error) {
    logger.error('User search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * @route   GET /api/search/trending
 * @desc    Get trending hashtags
 * @access  Public
 */
router.get('/trending', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const hashtags = await elasticsearch.getTrendingHashtags(
      Math.min(parseInt(limit), 50)
    );
    
    res.json({ hashtags });
  } catch (error) {
    logger.error('Trending hashtags error:', error);
    res.status(500).json({ error: 'Failed to get trending hashtags' });
  }
});

/**
 * @route   POST /api/search/reindex
 * @desc    Reindex all tweets from database to Elasticsearch
 * @access  Admin only (for now, just protected)
 */
router.post('/reindex', async (req, res) => {
  try {
    logger.info('Starting tweet reindexing...');
    
    // Fetch all tweets with user info
    const result = await pool.query(`
      SELECT 
        t.id, t.content, t.user_id, t.created_at,
        t.like_count, t.retweet_count, t.reply_count,
        u.username, u.display_name
      FROM tweets t
      JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC
      LIMIT 10000
    `);
    
    if (result.rows.length === 0) {
      return res.json({ message: 'No tweets to index', count: 0 });
    }
    
    // Bulk index in batches
    const batchSize = 500;
    let indexed = 0;
    
    for (let i = 0; i < result.rows.length; i += batchSize) {
      const batch = result.rows.slice(i, i + batchSize);
      await elasticsearch.bulkIndexTweets(batch);
      indexed += batch.length;
      logger.info(`Indexed ${indexed}/${result.rows.length} tweets`);
    }
    
    res.json({ 
      message: 'Reindexing complete', 
      count: indexed 
    });
  } catch (error) {
    logger.error('Reindex error:', error);
    res.status(500).json({ error: 'Reindexing failed' });
  }
});

/**
 * @route   POST /api/search/reindex-users
 * @desc    Reindex all users from database to Elasticsearch
 * @access  Admin only
 */
router.post('/reindex-users', async (req, res) => {
  try {
    logger.info('Starting user reindexing...');
    
    const result = await pool.query(`
      SELECT 
        id, username, display_name, bio, created_at,
        follower_count, following_count, tweet_count
      FROM users
      ORDER BY created_at DESC
    `);
    
    if (result.rows.length === 0) {
      return res.json({ message: 'No users to index', count: 0 });
    }
    
    // Index each user
    for (const user of result.rows) {
      await elasticsearch.indexUser(user);
    }
    
    res.json({ 
      message: 'User reindexing complete', 
      count: result.rows.length 
    });
  } catch (error) {
    logger.error('User reindex error:', error);
    res.status(500).json({ error: 'User reindexing failed' });
  }
});

module.exports = router;
