const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { db, logger, authenticate } = require('../shared');
const redisClient = require('../shared/services/redis');

const router = express.Router();

// Get user profile
router.get('/:username', authenticate, async (req, res, next) => {
  try {
    const { username } = req.params;
    
    // Query from replica
    const result = await db.query(
      `SELECT id, username, email, display_name, bio, avatar_url, location, verified,
              follower_count, following_count, tweet_count, created_at
       FROM users 
       WHERE username = $1`,
      [username],
      { write: false }
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];

    // Check if current user is following this user
    if (req.user.userId !== user.id) {
      const followResult = await db.query(
        'SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2',
        [req.user.userId, user.id],
        { write: false }
      );
      user.isFollowing = followResult.rows.length > 0;
    } else {
      user.isFollowing = false;
    }
    
    res.json(user);
  } catch (error) {
    next(error);
  }
});

// Update user profile
router.patch('/me', authenticate,
  [
    body('displayName').optional().isLength({ min: 1, max: 50 }),
    body('bio').optional().isLength({ max: 160 }),
    body('avatarUrl').optional().isURL(),
    body('location').optional().isLength({ max: 100 })
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { displayName, bio, avatarUrl, location } = req.body;
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (displayName !== undefined) {
        updates.push(`display_name = $${paramCount++}`);
        values.push(displayName);
      }
      if (bio !== undefined) {
        updates.push(`bio = $${paramCount++}`);
        values.push(bio);
      }
      if (avatarUrl !== undefined) {
        updates.push(`avatar_url = $${paramCount++}`);
        values.push(avatarUrl);
      }
      if (location !== undefined) {
        updates.push(`location = $${paramCount++}`);
        values.push(location);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      values.push(req.user.userId);

      const result = await db.query(
        `UPDATE users 
         SET ${updates.join(', ')}, updated_at = NOW()
         WHERE id = $${paramCount}
         RETURNING id, username, email, display_name, bio, avatar_url, location, verified,
                   follower_count, following_count, tweet_count, created_at`,
        values,
        { write: true }
      );

      // Invalidate cache
      await redisClient.helper.del(`user:${req.user.username}`);

      res.json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  }
);

// Get user's tweets
router.get('/:username/tweets', async (req, res, next) => {
  try {
    const { username } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    
    const result = await db.query(
      `SELECT t.id, t.user_id, t.content, t.reply_to_tweet_id, t.media_urls,
              t.hashtags, t.mentions, t.like_count, t.retweet_count, t.reply_count,
              t.created_at, u.username, u.display_name, u.avatar_url, u.verified
       FROM tweets t
       JOIN users u ON t.user_id = u.id
       WHERE u.username = $1
       ORDER BY t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [username, limit, offset],
      { write: false }
    );
    
    res.json({
      tweets: result.rows,
      count: result.rows.length,
      offset,
      limit
    });
  } catch (error) {
    next(error);
  }
});

// Search users
router.get('/search/query', authenticate, async (req, res, next) => {
  try {
    const { q } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    
    if (!q || q.length < 1) {
      return res.json({ users: [] });
    }
    
    const searchTerm = `%${q.toLowerCase()}%`;
    
    const result = await db.query(
      `SELECT id, username, display_name, bio, avatar_url, verified,
              follower_count, following_count
       FROM users 
       WHERE LOWER(username) LIKE $1 OR LOWER(display_name) LIKE $1
       ORDER BY follower_count DESC
       LIMIT $2`,
      [searchTerm, limit],
      { write: false }
    );

    // Add isFollowing status
    const users = await Promise.all(result.rows.map(async (user) => {
      if (req.user && user.id === req.user.userId) {
        return { ...user, isFollowing: false, isCurrentUser: true };
      }
      if (req.user) {
        const followResult = await db.query(
          'SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2',
          [req.user.userId, user.id],
          { write: false }
        );
        return { ...user, isFollowing: followResult.rows.length > 0 };
      }
      return { ...user, isFollowing: false };
    }));
    
    res.json({ users });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
