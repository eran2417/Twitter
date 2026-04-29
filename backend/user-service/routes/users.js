const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { db, logger, authenticate } = require('../../shared');
const redisClient = require('../../shared/services/redis');

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
    if (req.user.id !== user.id) {
      const followResult = await db.query(
        'SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2',
        [req.user.id, user.id],
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

      values.push(req.user.id);

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



module.exports = router;
