const Redis = require('ioredis');
const logger = require('../utils/logger');

const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false
});

redisClient.on('connect', () => {
  logger.info('Redis client connected');
});

redisClient.on('ready', () => {
  logger.info('Redis client ready');
});

redisClient.on('error', (err) => {
  logger.error('Redis client error:', err);
});

redisClient.on('close', () => {
  logger.warn('Redis client connection closed');
});

redisClient.on('reconnecting', () => {
  logger.info('Redis client reconnecting');
});

// Cache helper functions
const cacheHelper = {
  // Get cached data
  get: async (key) => {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  },
  
  // Set cached data with TTL
  set: async (key, value, ttl = parseInt(process.env.CACHE_TTL) || 300) => {
    try {
      await redisClient.setex(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  },
  
  // Delete cached data
  del: async (key) => {
    try {
      await redisClient.del(key);
      return true;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  },
  
  // Delete multiple keys by pattern
  delPattern: async (pattern) => {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
      return true;
    } catch (error) {
      logger.error('Cache delete pattern error:', error);
      return false;
    }
  },
  
  // Increment counter
  incr: async (key, ttl = 3600) => {
    try {
      const value = await redisClient.incr(key);
      if (value === 1 && ttl) {
        await redisClient.expire(key, ttl);
      }
      return value;
    } catch (error) {
      logger.error('Cache increment error:', error);
      return null;
    }
  },
  
  // Get or set (cache-aside pattern)
  getOrSet: async (key, fetchFunction, ttl = 300) => {
    try {
      // Try to get from cache
      const cached = await cacheHelper.get(key);
      if (cached !== null) {
        return cached;
      }
      
      // Fetch from source
      const data = await fetchFunction();
      
      // Store in cache
      if (data !== null && data !== undefined) {
        await cacheHelper.set(key, data, ttl);
      }
      
      return data;
    } catch (error) {
      logger.error('Cache getOrSet error:', error);
      // Return data from source on cache failure
      return await fetchFunction();
    }
  }
};

module.exports = Object.assign(redisClient, { helper: cacheHelper });
