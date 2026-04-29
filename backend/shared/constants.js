/**
 * Global constants for all services
 */

// User classification threshold
const HOT_USER_THRESHOLD = 5000;

// Cache configuration
const CACHE_KEYS = {
  FEED: (userId) => `feed:${userId}`,
  TWEET: (tweetId) => `tweet:${tweetId}`,
  HOT_USERS: 'hot_users',
  USER_FOLLOWING: (userId) => `user:${userId}:following`,
  USER_FOLLOWERS: (userId) => `user:${userId}:followers`
};

// Cache TTL in seconds
const CACHE_TTL = {
  FEED: 300,        // 5 minutes
  TWEET: 600,       // 10 minutes
};

// Feed limits
const FEED_LIMITS = {
  MAX_CACHED_TWEETS: 500,
};

// Tweet constraints
const TWEET_CONSTRAINTS = {
  MIN_LENGTH: 1,
  MAX_LENGTH: 280
};

// Pagination
const PAGINATION = {
  DEFAULT_LIMIT: 2,
};

module.exports = {
  HOT_USER_THRESHOLD,
  CACHE_KEYS,
  CACHE_TTL,
  FEED_LIMITS,
  TWEET_CONSTRAINTS,
  PAGINATION
};
