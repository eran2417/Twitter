const express = require('express');
const { db, logger, authenticate } = require('../shared');
const redisClient = require('../shared/services/redis');
const { authService, userService, searchService, notificationService } = require('../shared/services/internal');

const router = express.Router();

// Threshold for determining "hot users" (celebrity status)
const HOT_USER_THRESHOLD = 5000;

// Helper function to check if a user is "hot"
async function isHotUser(userId) {
  const result = await db.query(
    'SELECT follower_count FROM users WHERE id = $1',
    [userId]
  );
  if (result.rows.length === 0) return false;
  return result.rows[0].follower_count >= HOT_USER_THRESHOLD;
}

// Helper function to fetch timeline using pull-based logic (for hot users)
async function getPullBasedTimeline(userId, limit, cursor) {
  let query = `
    SELECT * FROM (
      SELECT t.id, t.content, t.user_id, t.created_at, t.updated_at,
             u.username, u.display_name, u.avatar_url,
             CASE WHEN l.user_id IS NOT NULL THEN true ELSE false END as liked,
             CASE WHEN r.user_id IS NOT NULL THEN true ELSE false END as retweeted,
             t.retweet_count,
             t.like_count,
             t.reply_count,
             false as is_retweet,
             NULL::timestamp as retweeted_at
      FROM tweets t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN likes l ON t.id = l.tweet_id AND l.user_id = $1
      LEFT JOIN retweets r ON t.id = r.tweet_id AND r.user_id = $1
      WHERE (t.user_id = $1 OR t.user_id IN (
        SELECT following_id FROM follows WHERE follower_id = $1
      ))

      UNION ALL

      SELECT t.id, t.content, t.user_id, t.created_at, t.updated_at,
             u.username, u.display_name, u.avatar_url,
             CASE WHEN l.user_id IS NOT NULL THEN true ELSE false END as liked,
             true as retweeted,
             t.retweet_count,
             t.like_count,
             t.reply_count,
             true as is_retweet,
             retweets.created_at as retweeted_at
      FROM retweets
      JOIN tweets t ON retweets.tweet_id = t.id
      JOIN users u ON t.user_id = u.id
      LEFT JOIN likes l ON t.id = l.tweet_id AND l.user_id = $1
      WHERE retweets.user_id = $1 AND NOT EXISTS (
        SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = t.user_id
      ) AND t.user_id != $1
    ) AS timeline
  `;

  let params = [userId];
  const pageLimit = Math.min(parseInt(limit) + 1, 100);
  
  // Parse cursor if provided
  let cursorTimestamp = null;
  let cursorId = null;
  if (cursor) {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      const cursorData = JSON.parse(decoded);
      cursorTimestamp = cursorData.timestamp;
      cursorId = cursorData.id;
    } catch (error) {
      logger.warn('Invalid cursor format:', error);
      throw new Error('Invalid cursor');
    }
  }
  
  if (cursorTimestamp && cursorId) {
    query += ` WHERE (timeline.created_at, timeline.id) < ($${params.length + 1}::timestamp with time zone, $${params.length + 2}::integer)`;
    params.push(cursorTimestamp);
    params.push(cursorId);
  }
  
  query += ` ORDER BY timeline.created_at DESC, timeline.id DESC LIMIT $${params.length + 1}`;
  params.push(pageLimit);

  return db.query(query, params);
}

// Helper function to fetch timeline using feed cache (for normal users)
async function getCachedTimeline(userId, limit, cursor) {
  const cacheKey = `feed:${userId}`;
  
  // Try to get from cache first
  let feedData = await redisClient.helper.get(cacheKey);
  
  if (!feedData) {
    // If cache miss, fetch from database and cache it
    const result = await db.query(
      `SELECT t.id, t.content, t.user_id, t.created_at, t.updated_at,
              u.username, u.display_name, u.avatar_url,
              CASE WHEN l.user_id IS NOT NULL THEN true ELSE false END as liked,
              CASE WHEN r.user_id IS NOT NULL THEN true ELSE false END as retweeted,
              t.retweet_count, t.like_count, t.reply_count,
              false as is_retweet, NULL::timestamp as retweeted_at
       FROM tweets t
       JOIN users u ON t.user_id = u.id
       LEFT JOIN likes l ON t.id = l.tweet_id AND l.user_id = $1
       LEFT JOIN retweets r ON t.id = r.tweet_id AND r.user_id = $1
       WHERE t.user_id IN (
         SELECT following_id FROM follows WHERE follower_id = $1
       ) OR t.user_id = $1
       ORDER BY t.created_at DESC
       LIMIT 500`,
      [userId]
    );
    
    feedData = result.rows;
    // Cache for 5 minutes
    await redisClient.helper.set(cacheKey, JSON.stringify(feedData), 'EX', 300);
  } else {
    feedData = JSON.parse(feedData);
  }
  
  // Apply cursor pagination on cached data
  let startIdx = 0;
  if (cursor) {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      const { id } = JSON.parse(decoded);
      startIdx = feedData.findIndex(t => t.id == id) + 1;
    } catch (error) {
      logger.warn('Invalid cursor:', error);
    }
  }
  
  const pageLimit = Math.min(parseInt(limit), 100);
  const tweets = feedData.slice(startIdx, startIdx + pageLimit);
  const hasMore = startIdx + pageLimit < feedData.length;
  
  return {
    tweets,
    hasMore,
    nextCursor: hasMore ? Buffer.from(JSON.stringify({ id: tweets[tweets.length - 1].id })).toString('base64') : null
  };
}

// Get user timeline with hybrid logic (pull-based for hot users, cached for normal users)
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { limit = 50, cursor = null } = req.query;

    // Example: Validate token with auth service
    try {
      const tokenValidation = await authService.validateToken(req.headers.authorization?.replace('Bearer ', ''));
      logger.info(`Token validated for user: ${tokenValidation.user.username}`);
    } catch (error) {
      return res.status(401).json({ error: 'Token validation failed' });
    }

    let result;
    let strategy;

    // Check if current user is a hot user (should use pull-based)
    const userIsHot = await isHotUser(userId);
    
    if (userIsHot) {
      logger.info(`Using pull-based timeline for hot user ${userId}`);
      strategy = 'pull-based';
      result = await getPullBasedTimeline(userId, limit, cursor);
      
      const hasMore = result.rows.length > parseInt(limit);
      const tweets = hasMore ? result.rows.slice(0, parseInt(limit)) : result.rows;
      
      let nextCursor = null;
      if (hasMore && tweets.length > 0) {
        const lastTweet = tweets[tweets.length - 1];
        const cursorData = JSON.stringify({
          timestamp: lastTweet.created_at,
          id: lastTweet.id
        });
        nextCursor = Buffer.from(cursorData).toString('base64');
      }

      return res.json({
        data: { tweets },
        pagination: {
          limit: parseInt(limit),
          cursor: cursor || null,
          nextCursor: nextCursor,
          hasMore: hasMore,
          strategy: strategy
        }
      });
    } else {
      logger.info(`Using cached feed timeline for normal user ${userId}`);
      strategy = 'cached-feed';
      result = await getCachedTimeline(userId, limit, cursor);

      return res.json({
        data: { tweets: result.tweets },
        pagination: {
          limit: parseInt(limit),
          cursor: cursor || null,
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
          strategy: strategy
        }
      });
    }
  } catch (error) {
    logger.error('Error fetching timeline:', error);
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});


    // Check if there are more results
    const hasMore = result.rows.length > parseInt(limit);
    const tweets = hasMore ? result.rows.slice(0, parseInt(limit)) : result.rows;
    
    // Create opaque cursor (base64 encoded)
    let nextCursor = null;
    if (hasMore && tweets.length > 0) {
      const lastTweet = tweets[tweets.length - 1];
      const cursorData = JSON.stringify({
        timestamp: lastTweet.created_at,
        id: lastTweet.id
      });
      nextCursor = Buffer.from(cursorData).toString('base64');
    }

    res.json({
      data: {
        tweets: tweets
      },
      pagination: {
        limit: parseInt(limit),
        cursor: cursor || null,
        nextCursor: nextCursor,
        hasMore: hasMore
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

// Search tweets by hashtag with cursor pagination
router.get('/search/hashtag/:hashtag', authenticate, async (req, res) => {
  try {
    const { hashtag } = req.params;
    const userId = req.user.userId;
    const { limit = 50, cursor = null } = req.query;
    const pageLimit = Math.min(parseInt(limit) + 1, 100); // Fetch one extra to check if there's more

    let query = `
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
    `;
    
    let params = [userId, `%#${hashtag}%`];
    
    // Parse opaque cursor if provided (base64 encoded)
    let cursorTimestamp = null;
    let cursorId = null;
    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
        const cursorData = JSON.parse(decoded);
        cursorTimestamp = cursorData.timestamp;
        cursorId = cursorData.id;
      } catch (error) {
        logger.warn('Invalid cursor format:', error);
        return res.status(400).json({ error: 'Invalid cursor' });
      }
    }
    
    // Add cursor filtering if provided (keyset pagination)
    if (cursorTimestamp && cursorId) {
      query += ` AND (t.created_at, t.id) < ($${params.length + 1}::timestamp with time zone, $${params.length + 2}::integer)`;
      params.push(cursorTimestamp);
      params.push(cursorId);
    }
    
    query += ` ORDER BY t.created_at DESC, t.id DESC LIMIT $${params.length + 1}`;
    params.push(pageLimit);

    const result = await db.query(query, params);

    // Check if there are more results
    const hasMore = result.rows.length > parseInt(limit);
    const tweets = hasMore ? result.rows.slice(0, parseInt(limit)) : result.rows;
    
    // Create opaque cursor (base64 encoded)
    let nextCursor = null;
    if (hasMore && tweets.length > 0) {
      const lastTweet = tweets[tweets.length - 1];
      const cursorData = JSON.stringify({
        timestamp: lastTweet.created_at,
        id: lastTweet.id
      });
      nextCursor = Buffer.from(cursorData).toString('base64');
    }

    res.json({
      data: {
        tweets: tweets
      },
      pagination: {
        limit: parseInt(limit),
        cursor: cursor || null,
        nextCursor: nextCursor,
        hasMore: hasMore
      }
    });
  } catch (error) {
    logger.error('Error searching hashtag:', error);
    res.status(500).json({ error: 'Failed to search hashtag' });
  }
});

// Get tweets by username with cursor pagination (includes retweets)
router.get('/users/:username/tweets', authenticate, async (req, res) => {
  try {
    const { username } = req.params;
    const userId = req.user.userId;
    const { limit = 50, cursor = null } = req.query;
    const pageLimit = Math.min(parseInt(limit) + 1, 100); // Fetch one extra to check if there's more

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

    // Parse opaque cursor if provided (base64 encoded)
    let cursorTimestamp = null;
    let cursorId = null;
    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
        const cursorData = JSON.parse(decoded);
        cursorTimestamp = cursorData.timestamp;
        cursorId = cursorData.id;
      } catch (error) {
        logger.warn('Invalid cursor format:', error);
        return res.status(400).json({ error: 'Invalid cursor' });
      }
    }

    // Build the query with UNION ALL for user's own tweets + their retweets
    let params = [userId, targetUserId];
    let cursorCondition = '';
    
    if (cursorTimestamp && cursorId) {
      cursorCondition = `AND (created_at, id) < ($${params.length + 1}::timestamp with time zone, $${params.length + 2}::integer)`;
      params.push(cursorTimestamp);
      params.push(cursorId);
    }

    // Query combines user's own tweets and tweets they retweeted
    let query = `
      SELECT * FROM (
        -- User's own tweets
        SELECT t.id, t.user_id, t.content, t.reply_to_tweet_id, t.media_urls,
               t.hashtags, t.mentions, t.like_count, t.retweet_count, t.reply_count,
               t.created_at,
               u.username, u.display_name, u.avatar_url, u.verified,
               CASE WHEN l.user_id IS NOT NULL THEN true ELSE false END as liked,
               CASE WHEN r.user_id IS NOT NULL THEN true ELSE false END as retweeted,
               false as is_retweet,
               NULL::text as retweeted_by_username,
               NULL::text as retweeted_by_display_name,
               t.created_at as sort_time
        FROM tweets t
        JOIN users u ON t.user_id = u.id
        LEFT JOIN likes l ON t.id = l.tweet_id AND l.user_id = $1
        LEFT JOIN retweets r ON t.id = r.tweet_id AND r.user_id = $1
        WHERE t.user_id = $2
        
        UNION ALL
        
        -- Tweets the user retweeted
        SELECT t.id, t.user_id, t.content, t.reply_to_tweet_id, t.media_urls,
               t.hashtags, t.mentions, t.like_count, t.retweet_count, t.reply_count,
               t.created_at,
               u.username, u.display_name, u.avatar_url, u.verified,
               CASE WHEN l.user_id IS NOT NULL THEN true ELSE false END as liked,
               true as retweeted,
               true as is_retweet,
               ru.username as retweeted_by_username,
               ru.display_name as retweeted_by_display_name,
               rt.created_at as sort_time
        FROM retweets rt
        JOIN tweets t ON rt.tweet_id = t.id
        JOIN users u ON t.user_id = u.id
        JOIN users ru ON rt.user_id = ru.id
        LEFT JOIN likes l ON t.id = l.tweet_id AND l.user_id = $1
        WHERE rt.user_id = $2
      ) AS profile_tweets
      WHERE 1=1 ${cursorCondition}
      ORDER BY sort_time DESC, id DESC
      LIMIT $${params.length + 1}
    `;
    params.push(pageLimit);

    const result = await db.query(query, params);

    // Check if there are more results
    const hasMore = result.rows.length > parseInt(limit);
    const tweets = hasMore ? result.rows.slice(0, parseInt(limit)) : result.rows;
    
    // Create opaque cursor (base64 encoded)
    let nextCursor = null;
    if (hasMore && tweets.length > 0) {
      const lastTweet = tweets[tweets.length - 1];
      const cursorData = JSON.stringify({
        timestamp: lastTweet.created_at,
        id: lastTweet.id
      });
      nextCursor = Buffer.from(cursorData).toString('base64');
    }

    res.json({
      data: {
        tweets: tweets
      },
      pagination: {
        limit: parseInt(limit),
        cursor: cursor || null,
        nextCursor: nextCursor,
        hasMore: hasMore
      }
    });
  } catch (error) {
    logger.error('Error fetching user tweets:', error);
    res.status(500).json({ error: 'Failed to fetch user tweets' });
  }
});

module.exports = router;