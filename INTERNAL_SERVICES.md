# Internal Service Communication Patterns

This document demonstrates how microservices communicate internally in the Twitter clone architecture.

## Overview

In a microservices architecture, services need to communicate with each other to fulfill business requirements. This Twitter clone uses HTTP-based internal service calls with proper error handling and service identification.

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Feed Service  │◄──►│   Auth Service  │    │  User Service   │
│                 │    │                 │    │                 │
│ • Timeline      │    │ • Token         │    │ • User Profiles │
│ • Tweets        │    │   Validation    │    │ • Followers     │
│ • Interactions  │    │ • Permissions   │    │ • Following     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       ▲                     │
         ▼                       │                     ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Search Service  │    │Notification Svc│    │   API Gateway   │
│                 │    │                 │    │                 │
│ • Tweet Search  │    │ • Push Notifs   │    │ • Route External│
│ • User Search   │    │ • Email Notifs  │    │   Requests      │
│ • Hashtag Trends│    │ • In-App Notifs │    └─────────────────┘
└─────────────────┘    └─────────────────┘
```

## Internal Service Calls

### Service Client Pattern

Each service uses a centralized client for internal communication:

```javascript
class InternalServiceClient {
  constructor(serviceName, baseURL) {
    this.client = axios.create({
      baseURL,
      timeout: 5000,
      headers: {
        'X-Internal-Service': 'calling-service-name'
      }
    });
  }
}
```

### Key Features

1. **Service Identification**: `X-Internal-Service` header identifies the calling service
2. **Timeout Handling**: 5-second timeout for all internal calls
3. **Error Handling**: Graceful degradation when services are unavailable
4. **Centralized Configuration**: Service URLs from environment variables

## Example Usage

### 1. Auth Service Validation

```javascript
// In feed-service/routes/timeline.js
const tokenValidation = await authService.validateToken(req.headers.authorization);
if (!tokenValidation.valid) {
  return res.status(401).json({ error: 'Invalid token' });
}
```

### 2. User Profile Enrichment

```javascript
// In feed-service/routes/tweets.js
const userProfile = await userService.getUserProfile(tweet.user_id);
// Enrich tweet data with full user information
```

### 3. Search Index Updates

```javascript
// In feed-service/routes/tweets.js
await searchService.indexTweet({
  id: tweet.id,
  content: tweet.content,
  hashtags: tweet.hashtags,
  user_id: tweet.user_id
});
```

### 4. Notification Sending

```javascript
// In feed-service/routes/tweets.js
await notificationService.sendNotification(userId, {
  type: 'tweet_liked',
  message: 'Your tweet was liked',
  tweet_id: tweetId
});
```

## Error Handling Patterns

### Graceful Degradation

```javascript
try {
  const userProfile = await userService.getUserProfile(userId);
  // Use enriched data
} catch (error) {
  logger.warn('User service unavailable, using basic data');
  // Continue with basic data
}
```

### Circuit Breaker Pattern

For production systems, implement circuit breakers to prevent cascading failures:

```javascript
// Conceptual circuit breaker
if (authService.isCircuitOpen()) {
  // Fallback: validate token locally or cache result
  return cachedValidation;
}
```

## Testing Internal Communication

Run the test script to verify internal service communication:

```bash
cd backend/feed-service
node test-internal-services.js
```

This demonstrates:
- Service discovery and calling patterns
- Error handling when services are unavailable
- Proper headers and timeouts
- Graceful degradation

## Environment Variables

```bash
# Service URLs for internal communication
AUTH_SERVICE_URL=http://auth-service:3001
USER_SERVICE_URL=http://user-service:3002
SEARCH_SERVICE_URL=http://search-service:3004
NOTIFICATION_SERVICE_URL=http://notification-service:3005
```

## Security Considerations

1. **Internal Network**: Services communicate over internal network only
2. **Service Authentication**: Use mutual TLS or service mesh authentication
3. **Rate Limiting**: Implement rate limiting for internal calls
4. **Monitoring**: Log all internal service calls for observability

## Performance Optimization

1. **Connection Pooling**: Reuse HTTP connections
2. **Caching**: Cache frequently accessed data
3. **Async Processing**: Use message queues for non-critical updates
4. **Load Balancing**: Distribute calls across service instances

## Migration to gRPC

For high-performance internal communication, consider migrating to gRPC:

- **Protocol Buffers**: Efficient serialization
- **Streaming**: Support for streaming responses
- **Bidirectional**: Full-duplex communication
- **Service Discovery**: Built-in service discovery

Example gRPC service definition:

```protobuf
service AuthService {
  rpc ValidateToken(ValidateTokenRequest) returns (ValidateTokenResponse);
  rpc GetUserPermissions(GetUserPermissionsRequest) returns (GetUserPermissionsResponse);
}
```

## Monitoring and Observability

1. **Distributed Tracing**: Track requests across services
2. **Metrics**: Monitor latency, error rates, throughput
3. **Health Checks**: Ensure service availability
4. **Logging**: Centralized logging for debugging

## Next Steps

1. Implement service mesh (Istio/Linkerd) for advanced features
2. Add circuit breakers and retry logic
3. Implement distributed caching (Redis Cluster)
4. Add comprehensive monitoring and alerting
5. Consider gRPC migration for performance-critical paths