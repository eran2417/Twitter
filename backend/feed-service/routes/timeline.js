const express = require('express');
const Redis = require('ioredis');
const { db, logger, authenticate } = require('../../shared');
const redisClient = require('../../shared/services/redis');
const { CACHE_KEYS, CACHE_TTL, FEED_LIMITS, PAGINATION } = require('../../shared/constants');

const router = express.Router();

// Fetch tweet IDs for non-hot followees from DB (cache miss fallback)
// Returns minimal { id, created_at } objects so they can be merged with hot tweets by time
async function getNonHotFolloweeIds(userId, excludeUserIds, cursorTimestamp, cursorId, limit) {
  let params = [userId];
  let excludeClause = '';
  if (excludeUserIds.length > 0) {
    params.push(excludeUserIds);
    excludeClause = `AND t.user_id != ALL($${params.length}::bigint[])`;
  }

  let cursorClause = '';
  if (cursorTimestamp && cursorId) {
    cursorClause = `AND (t.created_at, t.id) < ($${params.length + 1}::timestamptz, $${params.length + 2}::int)`;
    params.push(cursorTimestamp, cursorId);
  }
  params.push(limit);

  const result = await db.query(`
    SELECT t.id, t.created_at
    FROM follows f
    JOIN tweets t ON t.user_id = f.following_id
    WHERE f.follower_id = $1
    ${excludeClause}
    ${cursorClause}
    ORDER BY t.created_at DESC, t.id DESC
    LIMIT $${params.length}
  `, params);

  return result.rows; // [{ id, created_at }]
}

// Fetch tweet IDs for hot followees from DB
async function getHotFolloweeIds(hotFolloweeIds, cursorTimestamp, cursorId, limit) {
  if (hotFolloweeIds.length === 0) return [];

  let params = [hotFolloweeIds];
  let cursorClause = '';
  if (cursorTimestamp && cursorId) {
    cursorClause = `AND (t.created_at, t.id) < ($2::timestamptz, $3::int)`;
    params.push(cursorTimestamp, cursorId);
  }
  params.push(limit);

  const result = await db.query(`
    SELECT t.id, t.created_at
    FROM tweets t
    WHERE t.user_id = ANY($1::bigint[])
    ${cursorClause}
    ORDER BY t.created_at DESC, t.id DESC
    LIMIT $${params.length}
  `, params);

  return result.rows; // [{ id, created_at }]
}

// Hydrate tweet IDs into full tweet objects.
// 1. Pipeline GET tweet:{id} from Redis for all IDs
// 2. DB batch fetch for misses, with liked/retweeted state for the requesting user
// 3. Warm tweet:{id} cache for DB hits
async function hydrateTweets(tweetIdRows, userId) {
  if (tweetIdRows.length === 0) return [];

  const ids = tweetIdRows.map(r => r.id.toString());

  // Pipeline GET from tweet:{id} cache
  const pipeline = redisClient.pipeline();
  for (const id of ids) pipeline.get(`tweet:${id}`);
  const pipelineResults = await pipeline.exec();

  const hydrated = {};
  const missIds = [];

  for (let i = 0; i < ids.length; i++) {
    const [err, raw] = pipelineResults[i];
    if (!err && raw) {
      try {
        const tweet = typeof raw === 'string' ? JSON.parse(raw) : raw;
        hydrated[ids[i]] = tweet;
      } catch (_) {
        missIds.push(ids[i]);
      }
    } else {
      missIds.push(ids[i]);
    }
  }

  // DB batch fetch for cache misses — include liked/retweeted for requesting user
  if (missIds.length > 0) {
    const result = await db.query(`
      SELECT t.id, t.content, t.user_id, t.created_at, t.updated_at,
             u.username, u.display_name, u.avatar_url, u.verified,
             CASE WHEN l.user_id IS NOT NULL THEN true ELSE false END as liked,
             CASE WHEN r.user_id IS NOT NULL THEN true ELSE false END as retweeted,
             t.retweet_count, t.like_count, t.reply_count,
             false as is_retweet, NULL::timestamp as retweeted_at,
             NULL::text as retweeted_by_username
      FROM tweets t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN likes l ON t.id = l.tweet_id AND l.user_id = $2
      LEFT JOIN retweets r ON t.id = r.tweet_id AND r.user_id = $2
      WHERE t.id = ANY($1::bigint[])
    `, [missIds, userId]);

    // Warm tweet:{id} cache (store without user-specific liked/retweeted so it's shareable)
    const warmPipeline = redisClient.pipeline();
    for (const row of result.rows) {
      hydrated[row.id.toString()] = row;
      // Cache the base tweet (counts only, no liked/retweeted — those are per-user)
      const cacheable = { ...row, liked: false, retweeted: false };
      warmPipeline.set(`tweet:${row.id}`, JSON.stringify(cacheable), 'EX', CACHE_TTL.TWEET);
    }
    warmPipeline.exec().catch(() => {});
  }

  // For cache hits, liked/retweeted reflect whoever last cached it (stale per-user state).
  // Fetch fresh liked/retweeted for the current user across all tweets in one query.
  const [likesResult, retweetsResult] = await Promise.all([
    db.query('SELECT tweet_id FROM likes WHERE user_id = $1 AND tweet_id = ANY($2)', [userId, ids]),
    db.query('SELECT tweet_id FROM retweets WHERE user_id = $1 AND tweet_id = ANY($2)', [userId, ids])
  ]);
  const likedSet = new Set(likesResult.rows.map(r => r.tweet_id.toString()));
  const retweetedSet = new Set(retweetsResult.rows.map(r => r.tweet_id.toString()));

  // Return in original order, applying fresh liked/retweeted state
  return tweetIdRows
    .map(r => {
      const tweet = hydrated[r.id.toString()];
      if (!tweet) return null;
      return { ...tweet, liked: likedSet.has(r.id.toString()), retweeted: retweetedSet.has(r.id.toString()) };
    })
    .filter(Boolean);
}

// Get user timeline — hybrid merge strategy
// Feed cache stores tweet IDs only; full tweet data hydrated at read time from tweet:{id} cache
// Hot followees pulled from DB at read time via SINTER; non-hot served from fan-out ID list
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { cursor = null } = req.query;
    const pageLimit = PAGINATION.DEFAULT_LIMIT;

    // Decode cursor
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

    // 1. Resolve hot followees via SINTER, fetch their tweet IDs from DB
    let hotFolloweeIds = [];
    let hotIdRows = [];
    try {
      hotFolloweeIds = await redisClient.sinter(
        CACHE_KEYS.USER_FOLLOWING(userId),
        CACHE_KEYS.HOT_USERS
      );
      if (hotFolloweeIds.length > 0) {
        hotIdRows = await getHotFolloweeIds(hotFolloweeIds, cursorTimestamp, cursorId, pageLimit + 1);
      }
    } catch (err) {
      logger.warn('Failed to fetch hot followee tweet IDs:', err.message);
    }

    // 2. Read fan-out ID list for non-hot followees
    let fanoutIdRows = [];
    try {
      const feedData = await redisClient.helper.get(CACHE_KEYS.FEED(userId));

      if (feedData) {
        // Cache hit — filter by cursor in memory
        const all = Array.isArray(feedData) ? feedData : JSON.parse(feedData);
        const filtered = cursorTimestamp
          ? all.filter(t =>
              new Date(t.created_at) < new Date(cursorTimestamp) ||
              (t.created_at === cursorTimestamp && parseInt(t.id) < parseInt(cursorId))
            )
          : all;

        if (filtered.length > 0) {
          // Cursor within cached window — serve from cache
          fanoutIdRows = filtered;
        } else if (cursorTimestamp) {
          // Cursor beyond cached window — fall back to DB
          logger.debug(`Cache exhausted for user ${userId}, falling back to DB with cursor`);
          fanoutIdRows = await getNonHotFolloweeIds(userId, hotFolloweeIds, cursorTimestamp, cursorId, pageLimit + 1);
        }
      } else {
        // Cache miss — fetch full window and warm cache
        const allRows = await getNonHotFolloweeIds(userId, hotFolloweeIds, null, null, FEED_LIMITS.MAX_CACHED_TWEETS);
        if (allRows.length > 0) {
          redisClient.helper.set(CACHE_KEYS.FEED(userId), allRows, CACHE_TTL.FEED).catch(() => {});
        }
        // Apply cursor filter on fresh rows for current page
        fanoutIdRows = cursorTimestamp
          ? allRows.filter(t =>
              new Date(t.created_at) < new Date(cursorTimestamp) ||
              (t.created_at === cursorTimestamp && parseInt(t.id) < parseInt(cursorId))
            )
          : allRows;
      }
    } catch (err) {
      logger.warn('Failed to read fan-out cache, falling back to DB:', err?.message || err);
      try {
        fanoutIdRows = await getNonHotFolloweeIds(userId, hotFolloweeIds, cursorTimestamp, cursorId, pageLimit + 1);
      } catch (dbErr) {
        logger.warn('DB fallback also failed:', dbErr?.message || dbErr);
      }
    }

    // 3. Merge ID rows by created_at DESC, id DESC (two-pointer)
    const merged = [];
    let i = 0, j = 0;
    while (i < fanoutIdRows.length && j < hotIdRows.length) {
      const a = fanoutIdRows[i];
      const b = hotIdRows[j];
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      if (aTime > bTime || (aTime === bTime && parseInt(a.id) > parseInt(b.id))) {
        merged.push(a); i++;
      } else {
        merged.push(b); j++;
      }
    }
    while (i < fanoutIdRows.length) merged.push(fanoutIdRows[i++]);
    while (j < hotIdRows.length) merged.push(hotIdRows[j++]);

    // 4. Deduplicate IDs
    const seen = new Set();
    const dedupedIds = merged.filter(t => {
      if (seen.has(t.id.toString())) return false;
      seen.add(t.id.toString());
      return true;
    });

    // 5. Take page — fetched pageLimit+1 rows, extra row signals more pages exist
    const hasMore = dedupedIds.length > pageLimit;
    const pageIds = dedupedIds.slice(0, pageLimit);

    // 6. Hydrate: tweet:{id} cache → DB batch for misses, with fresh liked/retweeted
    const tweets = await hydrateTweets(pageIds, userId);

    let nextCursor = null;
    if (hasMore && pageIds.length > 0) {
      const last = pageIds[pageIds.length - 1];
      nextCursor = Buffer.from(JSON.stringify({ timestamp: last.created_at, id: last.id })).toString('base64');
    }

    logger.info(`Timeline for user ${userId}: ${fanoutIdRows.length} fanout + ${hotIdRows.length} hot → ${tweets.length} returned`);

    return res.json({
      data: { tweets },
      pagination: {
        cursor: cursor || null,
        nextCursor,
        hasMore
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
    const userId = req.user.id;
    const { cursor = null } = req.query;
    const pageLimit = PAGINATION.DEFAULT_LIMIT;

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
    params.push(pageLimit + 1);

    const result = await db.query(query, params);

    const hasMore = result.rows.length > pageLimit;
    const tweets = hasMore ? result.rows.slice(0, pageLimit) : result.rows;

    let nextCursor = null;
    if (hasMore && tweets.length > 0) {
      const lastTweet = tweets[tweets.length - 1];
      nextCursor = Buffer.from(JSON.stringify({ timestamp: lastTweet.created_at, id: lastTweet.id })).toString('base64');
    }

    res.json({
      data: { tweets },
      pagination: {
        cursor: cursor || null,
        nextCursor,
        hasMore
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
    const userId = req.user.id;
    const { cursor = null } = req.query;
    const pageLimit = PAGINATION.DEFAULT_LIMIT;

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
      cursorCondition = `AND (sort_time, id) < ($${params.length + 1}::timestamp with time zone, $${params.length + 2}::integer)`;
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
    params.push(pageLimit + 1);

    const result = await db.query(query, params);

    const hasMore = result.rows.length > pageLimit;
    const tweets = hasMore ? result.rows.slice(0, pageLimit) : result.rows;

    let nextCursor = null;
    if (hasMore && tweets.length > 0) {
      const lastTweet = tweets[tweets.length - 1];
      nextCursor = Buffer.from(JSON.stringify({ timestamp: lastTweet.sort_time, id: lastTweet.id })).toString('base64');
    }

    res.json({
      data: { tweets },
      pagination: {
        cursor: cursor || null,
        nextCursor,
        hasMore
      }
    });
  } catch (error) {
    logger.error('Error fetching user tweets:', error);
    res.status(500).json({ error: 'Failed to fetch user tweets' });
  }
});

// SSE endpoint — streams new tweets to connected clients via Redis Pub/Sub
router.get('/stream', authenticate, (req, res) => {
  const userId = req.user.id;

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  // Send heartbeat every 25s to keep connection alive through proxies/CloudFront (60s timeout)
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 25000);

  // Each SSE connection needs its own Redis subscriber instance
  const subscriber = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  });

  subscriber.subscribe(`sse:feed:${userId}`, (err) => {
    if (err) {
      logger.error(`SSE subscribe error for user ${userId}:`, err);
      res.end();
    }
  });

  subscriber.on('message', (_channel, message) => {
    res.write(`data: ${message}\n\n`);
  });

  // Cleanup on client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    subscriber.unsubscribe();
    subscriber.quit();
    logger.info(`SSE connection closed for user ${userId}`);
  });
});

module.exports = router;