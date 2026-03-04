const axios = require('axios');
const logger = require('../utils/logger');

// Service URLs (in production, use service discovery)
const SERVICE_URLS = {
  auth: process.env.AUTH_SERVICE_URL || 'http://auth-service:3002',
  user: process.env.USER_SERVICE_URL || 'http://user-service:3003',
  feed: process.env.FEED_SERVICE_URL || 'http://feed-service:3004',
  search: process.env.SEARCH_SERVICE_URL || 'http://search-service:3005',
  notification: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3006'
};

// Create axios instance with default config
const internalClient = axios.create({
  timeout: 5000, // 5 second timeout for internal calls
  headers: {
    'Content-Type': 'application/json',
    'X-Internal-Service': 'feed-service' // Identify the calling service
  }
});

// Add request/response interceptors for logging
internalClient.interceptors.request.use(
  (config) => {
    logger.info(`Internal call: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    logger.error('Internal call failed:', error.message);
    return Promise.reject(error);
  }
);

internalClient.interceptors.response.use(
  (response) => {
    logger.debug(`Internal response: ${response.status} from ${response.config.url}`);
    return response;
  },
  (error) => {
    logger.error(`Internal call error: ${error.response?.status} from ${error.config?.url}`, error.message);
    return Promise.reject(error);
  }
);

// Auth service calls
const authService = {
  // Validate JWT token and get user info
  validateToken: async (token) => {
    try {
      const response = await internalClient.post(`${SERVICE_URLS.auth}/auth/verify`, {}, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return response.data;
    } catch (error) {
      logger.error('Token validation failed:', error.message);
      throw new Error('Invalid token');
    }
  },

};

// User service calls
const userService = {
  // Get user profile
  getUserProfile: async (userId) => {
    try {
      const response = await internalClient.get(`${SERVICE_URLS.user}/users/${userId}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get user profile:', error.message);
      throw error;
    }
  },

  // Check if users are following each other
  getFollowStatus: async (followerId, followingId) => {
    try {
      const response = await internalClient.get(`${SERVICE_URLS.user}/follows/status`, {
        params: { follower: followerId, following: followingId }
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to get follow status:', error.message);
      return { isFollowing: false };
    }
  }
};

// Search service calls
const searchService = {
  // Index a tweet for search
  indexTweet: async (tweetData) => {
    try {
      await internalClient.post(`${SERVICE_URLS.search}/search/index/tweet`, tweetData);
      logger.info(`Tweet ${tweetData.id} indexed for search`);
    } catch (error) {
      logger.error('Failed to index tweet:', error.message);
      // Don't throw - search indexing failures shouldn't break tweet creation
    }
  },

  // Search tweets
  searchTweets: async (query, filters = {}) => {
    try {
      const response = await internalClient.get(`${SERVICE_URLS.search}/search/tweets`, {
        params: { q: query, ...filters }
      });
      return response.data;
    } catch (error) {
      logger.error('Search failed:', error.message);
      return { tweets: [], total: 0 };
    }
  }
};

// Notification service calls
const notificationService = {
  // Send notification to user
  sendNotification: async (userId, notification) => {
    try {
      await internalClient.post(`${SERVICE_URLS.notification}/notifications`, {
        userId,
        ...notification
      });
      logger.info(`Notification sent to user ${userId}`);
    } catch (error) {
      logger.error('Failed to send notification:', error.message);
      // Queue for retry or log for manual processing
    }
  },

  // Get user notification preferences
  getNotificationPreferences: async (userId) => {
    try {
      const response = await internalClient.get(`${SERVICE_URLS.notification}/notifications/preferences/${userId}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get notification preferences:', error.message);
      return { email: true, push: true, sms: false }; // Default preferences
    }
  }
};

module.exports = {
  authService,
  userService,
  searchService,
  notificationService,
  internalClient
};