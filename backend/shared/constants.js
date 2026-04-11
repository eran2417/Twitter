/**
 * Global constants for all services
 */

// User classification threshold
const HOT_USER_THRESHOLD = 5000;

// Cache configuration
const CACHE_KEYS = {
  FEED: (userId) => `feed:${userId}`,
  TWEET: (tweetId) => `tweet:${tweetId}`,
  TIMELINE: (userId, page) => `timeline:${userId}:${page}`
};

// Cache TTL in seconds
const CACHE_TTL = {
  FEED: 300,        // 5 minutes
  TWEET: 600,       // 10 minutes
  TIMELINE: 300     // 5 minutes
};

// Feed limits
const FEED_LIMITS = {
  MAX_CACHED_TWEETS: 500,    // Maximum tweets to keep in cache
  MAX_PAGE_SIZE: 100,        // Maximum tweets per page request
  DEFAULT_PAGE_SIZE: 20      // Default tweets per page
};

// Tweet constraints
const TWEET_CONSTRAINTS = {
  MIN_LENGTH: 1,
  MAX_LENGTH: 280
};

// Pagination
const PAGINATION = {
  DEFAULT_LIMIT: 5,
  MAX_LIMIT: 100
};

module.exports = {
  HOT_USER_THRESHOLD,
  CACHE_KEYS,
  CACHE_TTL,
  FEED_LIMITS,
  TWEET_CONSTRAINTS,
  PAGINATION
};
