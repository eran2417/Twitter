/**
 * Route Aggregator
 * Combines all service route configurations for easy access
 */

const { authRoutes } = require('./auth');
const { userRoutes } = require('./users');
const { feedRoutes } = require('./feed');
const { searchRoutes } = require('./search');
const { notificationRoutes } = require('./notifications');

/**
 * All service route configurations
 */
const allRoutes = {
  auth: authRoutes,
  users: userRoutes,
  feed: feedRoutes,
  search: searchRoutes,
  notifications: notificationRoutes
};

/**
 * Get all routes as a flat array for documentation
 */
const getAllRoutes = () => {
  return Object.values(allRoutes).flat();
};

/**
 * Get routes for a specific service
 */
const getRoutesForService = (serviceName) => {
  return allRoutes[serviceName] || [];
};

module.exports = {
  allRoutes,
  getAllRoutes,
  getRoutesForService,
  // Re-export individual route modules for convenience
  authRoutes,
  userRoutes,
  feedRoutes,
  searchRoutes,
  notificationRoutes
};