const express = require('express');
const { authenticate, optionalAuth } = require('../middleware/auth');
const db = require('../database/pool');
const redisClient = require('../services/redis');
const kafkaProducer = require('../services/kafka/producer');
const logger = require('../utils/logger');

const router = express.Router();

// Follow user
router.post('/:userId', authenticate, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const followingId = parseInt(userId);

    if (followingId === req.user.userId) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    await db.transaction(async (client) => {
      // Check if already following
      const existing = await client.query(
        'SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2',
        [req.user.userId, followingId]
      );

      if (existing.rows.length > 0) {
        throw { statusCode: 400, message: 'Already following this user' };
      }

      // Check if user exists
      const userExists = await client.query(
        'SELECT 1 FROM users WHERE id = $1',
        [followingId]
      );

      if (userExists.rows.length === 0) {
        throw { statusCode: 404, message: 'User not found' };
      }

      // Insert follow
      await client.query(
        'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)',
        [req.user.userId, followingId]
      );
    });

    // Publish to Kafka
    try {
      await kafkaProducer.publishUserFollowed(req.user.userId, followingId);
    } catch (kafkaError) {
      logger.error('Failed to publish user followed event:', kafkaError);
    }

    // Invalidate caches
    await redisClient.helper.delPattern(`user:${req.user.username}`);
    await redisClient.helper.delPattern(`timeline:${req.user.userId}:*`);

    res.json({ message: 'User followed successfully' });
  } catch (error) {
    next(error);
  }
});

// Unfollow user
router.delete('/:userId', authenticate, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const followingId = parseInt(userId);

    const result = await db.query(
      'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2 RETURNING id',
      [req.user.userId, followingId],
      { write: true }
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Follow relationship not found' });
    }

    // Invalidate caches
    await redisClient.helper.delPattern(`user:${req.user.username}`);
    await redisClient.helper.delPattern(`timeline:${req.user.userId}:*`);

    res.json({ message: 'User unfollowed successfully' });
  } catch (error) {
    next(error);
  }
});

// Get followers
router.get('/:userId/followers', optionalAuth, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;

    const result = await db.query(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.verified,
              u.follower_count, u.following_count
       FROM users u
       JOIN follows f ON u.id = f.follower_id
       WHERE f.following_id = $1
       ORDER BY f.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
      { write: false }
    );

    // Add isFollowing status if authenticated
    let followers = result.rows;
    if (req.user) {
      followers = await Promise.all(followers.map(async (user) => {
        if (user.id === req.user.userId) {
          return { ...user, isFollowing: false };
        }
        const followResult = await db.query(
          'SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2',
          [req.user.userId, user.id],
          { write: false }
        );
        return { ...user, isFollowing: followResult.rows.length > 0 };
      }));
    }

    res.json({
      followers,
      count: followers.length,
      offset,
      limit
    });
  } catch (error) {
    next(error);
  }
});

// Get following
router.get('/:userId/following', optionalAuth, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;

    const result = await db.query(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.verified,
              u.follower_count, u.following_count
       FROM users u
       JOIN follows f ON u.id = f.following_id
       WHERE f.follower_id = $1
       ORDER BY f.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
      { write: false }
    );

    // Add isFollowing status if authenticated
    let following = result.rows;
    if (req.user) {
      following = await Promise.all(following.map(async (user) => {
        if (user.id === req.user.userId) {
          return { ...user, isFollowing: false };
        }
        const followResult = await db.query(
          'SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2',
          [req.user.userId, user.id],
          { write: false }
        );
        return { ...user, isFollowing: followResult.rows.length > 0 };
      }));
    }

    res.json({
      following,
      count: following.length,
      offset,
      limit
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
