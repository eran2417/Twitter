/**
 * Unified Rate Limiter Module
 * 
 * Provides two types of rate limiting:
 * 1. Auth Rate Limiter - IP-based, protects login/register from brute force
 * 2. Tweet Rate Limiter - User-based (Redis), limits tweet posting
 * 
 * Note: Tweet rate limiter expects req.user to be set by verifyJwt middleware
 */

const rateLimit = require('express-rate-limit');
const Redis = require('ioredis');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  auth: {
    windowMs: 15 * 60 * 1000,  // 15 minutes
    maxAttempts: 10            // 10 attempts per window
  },
  tweet: {
    maxTweets: parseInt(process.env.TWEET_RATE_LIMIT_MAX) || 10,
    windowMs: parseInt(process.env.TWEET_RATE_LIMIT_WINDOW) || 3600000, // 1 hour
    get windowSeconds() { return Math.floor(this.windowMs / 1000); }
  }
};

// ============================================================================
// REDIS CLIENT (for user-based rate limiting)
// ============================================================================

const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  lazyConnect: true
});

redis.on('error', (err) => console.error('Rate limiter Redis error:', err.message));

// ============================================================================
// AUTH RATE LIMITER (IP-based)
// ============================================================================

/**
 * Limits authentication attempts per IP address
 * Protects against brute force attacks on login/register
 */
const authLimiter = rateLimit({
  windowMs: CONFIG.auth.windowMs,
  max: CONFIG.auth.maxAttempts,
  message: {
    error: 'Too many authentication attempts',
    message: 'Please try again in 15 minutes',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health'
});

// ============================================================================
// TWEET RATE LIMITER (User-based, Redis)
// ============================================================================

/**
 * Limits tweet creation per authenticated user
 * Uses Redis for distributed rate limiting across instances
 * 
 * IMPORTANT: This middleware must run AFTER verifyJwt so req.user is available
 */
const tweetLimiter = async (req, res, next) => {
  // Only limit POST requests (tweet creation)
  if (req.method !== 'POST') {
    return next();
  }

  // Get user ID from req.user (set by verifyJwt middleware)
  const userId = req.user?.id;

  if (!userId) {
    return next(); // No user = auth middleware will handle
  }

  const key = `ratelimit:tweets:${userId}`;
  
  try {
    const count = parseInt(await redis.get(key)) || 0;

    if (count >= CONFIG.tweet.maxTweets) {
      const ttl = await redis.ttl(key);
      return res.status(429).json({
        error: 'Tweet rate limit exceeded',
        message: `Maximum ${CONFIG.tweet.maxTweets} tweets per hour`,
        limit: CONFIG.tweet.maxTweets,
        remaining: 0,
        retryAfterSeconds: ttl,
        retryAfter: `${Math.ceil(ttl / 60)} minutes`
      });
    }

    // Increment counter with expiry
    const pipeline = redis.pipeline();
    pipeline.incr(key);
    if (count === 0) {
      pipeline.expire(key, CONFIG.tweet.windowSeconds);
    }
    await pipeline.exec();

    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': CONFIG.tweet.maxTweets,
      'X-RateLimit-Remaining': Math.max(0, CONFIG.tweet.maxTweets - count - 1),
      'X-RateLimit-Resource': 'tweets'
    });

    next();
  } catch (error) {
    console.error('Tweet rate limiter error:', error.message);
    next(); // Fail open on Redis errors
  }
};

// ============================================================================
// RATE LIMIT STATUS (for API endpoint)
// ============================================================================

/**
 * Get current rate limit status for a user
 */
const getRateLimitStatus = async (userId) => {
  if (!userId) return null;
  
  const key = `ratelimit:tweets:${userId}`;
  
  try {
    const [count, ttl] = await Promise.all([
      redis.get(key),
      redis.ttl(key)
    ]);
    
    const used = parseInt(count) || 0;
    const resetSeconds = ttl > 0 ? ttl : CONFIG.tweet.windowSeconds;
    
    return {
      resource: 'tweets',
      limit: CONFIG.tweet.maxTweets,
      used,
      remaining: Math.max(0, CONFIG.tweet.maxTweets - used),
      resetsInSeconds: resetSeconds,
      resetsAt: new Date(Date.now() + resetSeconds * 1000).toISOString()
    };
  } catch (error) {
    console.error('Error getting rate limit status:', error.message);
    return null;
  }
};

/**
 * Reset rate limit for a user (admin use)
 */
const resetRateLimit = async (userId) => {
  const key = `ratelimit:tweets:${userId}`;
  return redis.del(key);
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Middleware
  authLimiter,
  tweetLimiter,
  
  // Utilities
  getRateLimitStatus,
  resetRateLimit,
  
  // Config (for testing/reference)
  CONFIG
};
