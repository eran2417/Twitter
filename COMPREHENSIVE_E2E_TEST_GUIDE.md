# Comprehensive E2E Test Guide

## Overview
The enhanced `e2e-test.sh` script provides comprehensive testing of the Twitter clone application, covering all microservices and both **Timeline** and **Profile** features.

## Test Coverage (39 Tests Total)

### 🏥 Service Health Check (5 tests)
- ✅ API Gateway health check
- ✅ PostgreSQL Primary connectivity
- ✅ Redis connectivity
- ✅ Elasticsearch availability
- ✅ Kafka broker health

### 👤 User Management (8 tests)
- ✅ User registration (Alice & Bob)
- ✅ Users verified in PostgreSQL
- ✅ User login functionality
- ✅ Get user profiles
- ✅ Verify profile contains location
- ✅ Check follow status in profile
- ✅ Retrieve other user's profile
- ✅ Verify follow relationship shown in profile

### 👥 Social Features (3 tests)
- ✅ Alice follows Bob
- ✅ Follow relationship verified in PostgreSQL
- ✅ Bob's profile retrieved successfully

### 📝 Tweet Operations (3 tests)
- ✅ Create tweet (Bob posts)
- ✅ Tweet verified in PostgreSQL
- ✅ Tweet indexed in Elasticsearch

### ❤️ Tweet Interactions (4 tests)
- ✅ Like tweet functionality
- ✅ Like verified in database
- ✅ Unlike tweet functionality
- ✅ Unlike verified in database

### 🔄 Retweet Features (2 tests)
- ✅ Retweet functionality
- ✅ Retweet verified in PostgreSQL

### 📰 Timeline Features (3 tests)
- ✅ Timeline retrieval for current user
- ✅ **Retweets appear with attribution** (`retweeted_by_username`)
- ✅ Timeline cached in Redis

### 📋 Profile Tweets (4 tests)
- ✅ Get user's profile tweets
- ✅ Get other user's profile tweets
- ✅ Profile shows user's original tweets
- ✅ **Profile shows user's retweets** with `is_retweet` flag

### 🔍 Search Features (2 tests)
- ✅ Tweet search via Elasticsearch
- ✅ User search via Elasticsearch

### 💾 Cache Verification (1 test)
- ✅ Redis storing cache data

### 🚦 Rate Limiting (1 test)
- ✅ Rate limiter working (blocks after 10 tweets/hour)

### 📨 Infrastructure (2 tests)
- ✅ Kafka topics exist
- ✅ Kafka consumer groups active

## Running the Tests

```bash
cd /Users/erachaudhary/workspace/twitter

# Run all tests
./scripts/e2e-test.sh

# Expected output: 38/39 passing
# (1 optional: Elasticsearch indexing timing)
```

## Timeline vs Profile: What's Tested

### Timeline Tests
**Your Home Feed Shows:**
- Tweets from people you follow
- **Your own retweets** (even if you don't follow the original author)
- Retweets from people you follow
- Each retweet shows **"Retweeted by X"** attribution
- Field: `is_retweet: true` and `retweeted_by_username: "X"`

**Verification:**
```bash
GET /api/v1/timeline
# Response includes retweets with:
{
  "id": "174664",
  "content": "Original tweet...",
  "username": "original_author",
  "is_retweet": true,
  "retweeted_by_username": "alice",
  "retweeted_at": "2026-04-09T21:18:00Z"
}
```

### Profile Tests
**Your Profile Shows:**
- Only YOUR tweets
- Only YOUR retweets (with attribution to original author)
- Your stats (followers, following, tweet count)
- ❌ NOT tweets from people you follow

**Other User's Profile Shows:**
- Only THEIR tweets
- Only THEIR retweets
- Their stats
- Your follow status (`isFollowing: true/false`)

**Verification:**
```bash
GET /api/v1/timeline/users/testuser_alice/tweets
# Response includes only Alice's tweets and retweets:
{
  "tweets": [
    {
      "id": "174664",
      "content": "Alice's tweet",
      "username": "alice",
      "is_retweet": false
    },
    {
      "id": "174663",
      "content": "Original tweet from Bob",
      "username": "bob",
      "is_retweet": true,
      "retweeted_by_username": "alice"
    }
  ]
}
```

## Key Features Verified

✅ **Retweet Attribution:** When viewing timeline, retweets show:
- Original tweet content
- Original author
- Who retweeted it (`retweeted_by_username`)
- When it was retweeted (`retweeted_at`)

✅ **Own Retweets in Timeline:** Your retweets appear in your timeline even if:
- You don't follow the original author
- The retweet is very recent
- You follow the original author (no duplicate hiding)

✅ **Profile Shows Retweets:** Your profile page shows:
- Your original tweets
- Your retweets with attribution
- No tweets from accounts you follow

✅ **Follow Relationships:** Each user's profile shows:
- If you follow them
- If they follow you
- Follow/Unfollow buttons

## Test Data

**Alice** (testuser_alice)
- Email: alice_e2e@test.com
- Location: New York
- Status: Follows Bob

**Bob** (testuser_bob)
- Email: bob_e2e@test.com
- Location: Los Angeles
- Status: Followed by Alice
- Creates E2E_TEST tweet

## Performance Metrics

- Total test suite runtime: ~30 seconds
- Service health checks: <1 second
- Database operations: <2 seconds per query
- Redis caching: <100ms
- Elasticsearch indexing: 3+ seconds (asynchronous)

## Notes

1. **Elasticsearch Indexing:** The tweet indexing test may fail if Elasticsearch takes >3 seconds to index. This is not a failure of the application but a timing issue in the test.

2. **Cache Keys:** Timeline cache uses `feed:${userId}` Redis key pattern.

3. **Database:** All data is automatically cleaned up after tests complete.

4. **Rate Limiting:** Auth limiter resets when API Gateway restarts. Tweet limiter is per-user, per-hour in Redis.

## Troubleshooting

If tests fail:

```bash
# Clear rate limits
docker exec twitter-redis redis-cli FLUSHALL

# Restart API Gateway
docker restart twitter-api-gateway

# Check service logs
docker logs twitter-feed-service
docker logs twitter-api-gateway
docker logs twitter-user-service

# Re-run tests
./scripts/e2e-test.sh
```
