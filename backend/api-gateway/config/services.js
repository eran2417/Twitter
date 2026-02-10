/**
 * Service Configuration
 * Central configuration for all microservices
 */

const services = {
  'auth-service': {
    url: process.env.AUTH_SERVICE_URL || 'http://auth-service:3002',
    health: '/health',
    timeout: 5000,
    retries: 3
  },
  'user-service': {
    url: process.env.USER_SERVICE_URL || 'http://user-service:3003',
    health: '/health',
    timeout: 5000,
    retries: 3
  },
  'feed-service': {
    url: process.env.FEED_SERVICE_URL || 'http://feed-service:3004',
    health: '/health',
    timeout: 5000,
    retries: 3
  },
  'search-service': {
    url: process.env.SEARCH_SERVICE_URL || 'http://search-service:3005',
    health: '/health',
    timeout: 5000,
    retries: 3
  },
  'notification-service': {
    url: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3006',
    health: '/health',
    timeout: 5000,
    retries: 3
  }
};

/**
 * Check health of all services
 */
async function checkServiceHealth() {
  const results = {};

  for (const [name, config] of Object.entries(services)) {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);

      const response = await fetch(`${config.url}${config.health}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'API-Gateway-Health-Check' }
      });

      clearTimeout(timeoutId);

      results[name] = {
        status: response.ok ? 'healthy' : 'unhealthy',
        responseTime: Date.now() - start,
        statusCode: response.status
      };
    } catch (error) {
      results[name] = {
        status: 'unreachable',
        responseTime: Date.now() - start,
        error: error.message
      };
    }
  }

  return results;
}

/**
 * Get service configuration by name
 */
function getServiceConfig(serviceName) {
  return services[serviceName];
}

/**
 * Get all service configurations
 */
function getAllServices() {
  return services;
}

module.exports = {
  services,
  checkServiceHealth,
  getServiceConfig,
  getAllServices
};