#!/usr/bin/env node

/**
 * Internal Service Communication Test Script
 *
 * This script demonstrates how microservices communicate internally
 * using the internal service utilities we created.
 */

const axios = require('axios');

// Mock environment variables (in real deployment, these come from Docker/K8s)
const SERVICES = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  user: process.env.USER_SERVICE_URL || 'http://localhost:3002',
  feed: process.env.FEED_SERVICE_URL || 'http://localhost:3003',
  search: process.env.SEARCH_SERVICE_URL || 'http://localhost:3004',
  notification: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3005'
};

class InternalServiceClient {
  constructor(serviceName, baseURL) {
    this.serviceName = serviceName;
    this.client = axios.create({
      baseURL,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Service': 'feed-service' // Identify calling service
      }
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      error => {
        console.error(`❌ ${serviceName} service error:`, error.message);
        throw error;
      }
    );
  }

  async call(endpoint, method = 'GET', data = null) {
    try {
      console.log(`📡 Calling ${this.serviceName} service: ${method} ${endpoint}`);
      const response = await this.client.request({
        method,
        url: endpoint,
        data
      });
      console.log(`✅ ${this.serviceName} service responded successfully`);
      return response.data;
    } catch (error) {
      console.error(`❌ Failed to call ${this.serviceName} service:`, error.message);
      throw error;
    }
  }
}

// Create service clients
const authService = new InternalServiceClient('auth', SERVICES.auth);
const userService = new InternalServiceClient('user', SERVICES.user);
const searchService = new InternalServiceClient('search', SERVICES.search);
const notificationService = new InternalServiceClient('notification', SERVICES.notification);

async function testInternalCommunication() {
  console.log('🚀 Testing Internal Service Communication\n');

  try {
    // Test 1: Auth service - validate token
    console.log('1️⃣ Testing Auth Service - Token Validation');
    try {
      const tokenValidation = await authService.call('/internal/validate-token', 'POST', {
        token: 'mock-jwt-token-for-testing'
      });
      console.log('   Token validation result:', tokenValidation);
    } catch (error) {
      console.log('   Expected error (invalid token):', error.message);
    }

    // Test 2: User service - get user profile
    console.log('\n2️⃣ Testing User Service - Get User Profile');
    try {
      const userProfile = await userService.call('/internal/users/1/profile');
      console.log('   User profile:', userProfile);
    } catch (error) {
      console.log('   Expected error (user not found):', error.message);
    }

    // Test 3: Search service - index tweet
    console.log('\n3️⃣ Testing Search Service - Index Tweet');
    try {
      const indexResult = await searchService.call('/internal/tweets/index', 'POST', {
        id: 'test-tweet-123',
        content: 'Hello from internal service test! #microservices',
        user_id: 1,
        created_at: new Date().toISOString()
      });
      console.log('   Index result:', indexResult);
    } catch (error) {
      console.log('   Expected error (search service not running):', error.message);
    }

    // Test 4: Notification service - send notification
    console.log('\n4️⃣ Testing Notification Service - Send Notification');
    try {
      const notificationResult = await notificationService.call('/internal/notifications/send', 'POST', {
        user_id: 1,
        type: 'test_notification',
        message: 'This is a test notification from internal service communication'
      });
      console.log('   Notification result:', notificationResult);
    } catch (error) {
      console.log('   Expected error (notification service not running):', error.message);
    }

    console.log('\n🎉 Internal service communication test completed!');
    console.log('\n📝 Key Points Demonstrated:');
    console.log('   • Service-to-service HTTP calls with proper headers');
    console.log('   • Timeout and error handling');
    console.log('   • Service identification via X-Internal-Service header');
    console.log('   • Centralized service client pattern');
    console.log('   • Graceful degradation when services are unavailable');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
if (require.main === module) {
  testInternalCommunication();
}

module.exports = { InternalServiceClient, testInternalCommunication };