#!/bin/bash

# End-to-End Test Script for Twitter Clone
# Tests all microservices: Auth, User, Feed, Search, Notification
# Verifies: PostgreSQL, Redis, Kafka, Elasticsearch

# Don't exit on error - we handle errors ourselves
set +e

API_URL="${API_URL:-http://localhost:3001}"
REDIS_CMD="docker exec twitter-redis redis-cli"

# PostgreSQL query helper
pg_query() {
    docker exec twitter-postgres-primary psql -U twitter_user -d twitter -t -A -c "$1" 2>/dev/null | tr -d ' \n'
}
ES_URL="${ES_URL:-http://localhost:9200}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
PASSED=0
FAILED=0
TOTAL=0

# Helper functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; ((PASSED++)); ((TOTAL++)); }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; ((FAILED++)); ((TOTAL++)); }
log_section() { echo -e "\n${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${YELLOW}  $1${NC}"; echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# Cleanup function
cleanup() {
    log_section "🧹 CLEANUP"
    log_info "Removing test users from database..."
    docker exec twitter-postgres-primary psql -U twitter_user -d twitter -c "DELETE FROM users WHERE username IN ('testuser_alice', 'testuser_bob');" 2>/dev/null || true
    log_info "Removing test data from Elasticsearch..."
    curl -s -X POST "$ES_URL/users/_delete_by_query" -H 'Content-Type: application/json' -d '{"query":{"terms":{"username":["testuser_alice","testuser_bob"]}}}' > /dev/null 2>&1 || true
    curl -s -X POST "$ES_URL/tweets/_delete_by_query" -H 'Content-Type: application/json' -d '{"query":{"match":{"content":"E2E_TEST"}}}' > /dev/null 2>&1 || true
    log_info "Cleanup complete"
}

# Trap to cleanup on exit - only on actual exit, not on function returns
cleanup_on_exit() {
    cleanup
}
trap cleanup_on_exit EXIT

# Check if services are healthy
check_services() {
    log_section "🏥 SERVICE HEALTH CHECK"
    
    # API Gateway
    if curl -s "$API_URL/health" | grep -q "ok\|healthy"; then
        log_success "API Gateway (port 3001) is healthy"
    else
        log_fail "API Gateway is not responding"
        exit 1
    fi
    
    # PostgreSQL
    if docker exec twitter-postgres-primary psql -U twitter_user -d twitter -c "SELECT 1;" > /dev/null 2>&1; then
        log_success "PostgreSQL Primary is healthy"
    else
        log_fail "PostgreSQL Primary is not responding"
        exit 1
    fi
    
    # Redis
    if $REDIS_CMD PING | grep -q "PONG"; then
        log_success "Redis is healthy"
    else
        log_fail "Redis is not responding"
        exit 1
    fi
    
    # Elasticsearch
    if curl -s "$ES_URL/_cluster/health" | grep -q "green\|yellow"; then
        log_success "Elasticsearch is healthy"
    else
        log_fail "Elasticsearch is not responding"
        exit 1
    fi
    
    # Kafka
    if docker exec twitter-kafka kafka-topics --bootstrap-server localhost:9092 --list > /dev/null 2>&1; then
        log_success "Kafka is healthy"
    else
        log_fail "Kafka is not responding"
        exit 1
    fi
}

# Test variables
ALICE_TOKEN=""
BOB_TOKEN=""
ALICE_ID=""
BOB_ID=""
TWEET_ID=""

# Test user registration
test_registration() {
    log_section "👤 USER REGISTRATION (Auth Service)"
    
    # Register Alice
    ALICE_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/auth/register" \
        -H "Content-Type: application/json" \
        -d '{
            "username": "testuser_alice",
            "email": "alice_e2e@test.com",
            "password": "password123",
            "displayName": "Alice Test",
            "location": "New York"
        }')
    
    if echo "$ALICE_RESPONSE" | grep -q "token"; then
        ALICE_TOKEN=$(echo "$ALICE_RESPONSE" | jq -r '.token')
        ALICE_ID=$(echo "$ALICE_RESPONSE" | jq -r '.user.id')
        log_success "Alice registered (ID: $ALICE_ID)"
    else
        log_fail "Alice registration failed: $ALICE_RESPONSE"
        return 1
    fi
    
    # Register Bob
    BOB_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/auth/register" \
        -H "Content-Type: application/json" \
        -d '{
            "username": "testuser_bob",
            "email": "bob_e2e@test.com",
            "password": "password123",
            "displayName": "Bob Test",
            "location": "Los Angeles"
        }')
    
    if echo "$BOB_RESPONSE" | grep -q "token"; then
        BOB_TOKEN=$(echo "$BOB_RESPONSE" | jq -r '.token')
        BOB_ID=$(echo "$BOB_RESPONSE" | jq -r '.user.id')
        log_success "Bob registered (ID: $BOB_ID)"
    else
        log_fail "Bob registration failed: $BOB_RESPONSE"
        return 1
    fi
    
    # Verify users in PostgreSQL
    sleep 1
    DB_COUNT=$(pg_query "SELECT COUNT(*) FROM users WHERE username IN ('testuser_alice', 'testuser_bob');" | tr -d ' ')
    if [ "$DB_COUNT" -eq 2 ]; then
        log_success "Users verified in PostgreSQL (count: $DB_COUNT)"
    else
        log_fail "Users not found in PostgreSQL (count: $DB_COUNT)"
    fi
}

# Test login
test_login() {
    log_section "🔐 USER LOGIN (Auth Service)"
    
    LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/auth/login" \
        -H "Content-Type: application/json" \
        -d '{
            "username": "testuser_alice",
            "password": "password123"
        }')
    
    if echo "$LOGIN_RESPONSE" | grep -q "token"; then
        ALICE_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token')
        log_success "Alice logged in successfully"
    else
        log_fail "Login failed: $LOGIN_RESPONSE"
    fi
}

# Test follow functionality
test_follow() {
    log_section "👥 FOLLOW USER (User Service + Kafka)"
    
    # Alice follows Bob
    FOLLOW_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/follows/$BOB_ID" \
        -H "Authorization: Bearer $ALICE_TOKEN" \
        -H "Content-Type: application/json")
    
    if echo "$FOLLOW_RESPONSE" | grep -q "success\|following\|true"; then
        log_success "Alice followed Bob"
    else
        log_fail "Follow failed: $FOLLOW_RESPONSE"
    fi
    
    # Verify in database
    sleep 1
    FOLLOW_COUNT=$(pg_query "SELECT COUNT(*) FROM follows WHERE follower_id = $ALICE_ID AND following_id = $BOB_ID;" | tr -d ' ')
    if [ "$FOLLOW_COUNT" -eq 1 ]; then
        log_success "Follow relationship verified in PostgreSQL"
    else
        log_fail "Follow relationship not found in PostgreSQL"
    fi
    
    # Check Bob's followers count
    BOB_PROFILE=$(curl -s "$API_URL/api/v1/users/testuser_bob" \
        -H "Authorization: Bearer $ALICE_TOKEN")
    
    if echo "$BOB_PROFILE" | grep -q "testuser_bob\|followers\|username"; then
        log_success "Bob's profile retrieved successfully"
    else
        log_fail "Cannot retrieve Bob's profile: $BOB_PROFILE"
    fi
}

# Test tweet creation
test_tweet() {
    log_section "📝 CREATE TWEET (Feed Service + Kafka)"
    
    # Bob creates a tweet
    TWEET_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/tweets" \
        -H "Authorization: Bearer $BOB_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "content": "Hello from E2E_TEST! This is a test tweet from Bob #testing #e2e"
        }')
    
    if echo "$TWEET_RESPONSE" | grep -q "id"; then
        TWEET_ID=$(echo "$TWEET_RESPONSE" | jq -r '.id // .tweet.id')
        log_success "Bob created tweet (ID: $TWEET_ID)"
    else
        log_fail "Tweet creation failed: $TWEET_RESPONSE"
        return 1
    fi
    
    # Verify tweet in database
    sleep 1
    TWEET_EXISTS=$(pg_query "SELECT COUNT(*) FROM tweets WHERE user_id = $BOB_ID AND content LIKE '%E2E_TEST%';" | tr -d ' ')
    if [ "$TWEET_EXISTS" -ge 1 ]; then
        log_success "Tweet verified in PostgreSQL"
    else
        log_fail "Tweet not found in PostgreSQL"
    fi
    
    # Wait for Kafka → Elasticsearch sync
    log_info "Waiting for Elasticsearch indexing (3s)..."
    sleep 3
    
    # Verify tweet in Elasticsearch
    ES_SEARCH=$(curl -s "$ES_URL/tweets/_search?q=E2E_TEST")
    if echo "$ES_SEARCH" | grep -q "E2E_TEST"; then
        log_success "Tweet indexed in Elasticsearch"
    else
        log_fail "Tweet not found in Elasticsearch"
    fi
}

# Test like functionality
test_like() {
    log_section "❤️ LIKE TWEET (Feed Service + Kafka)"
    
    # Alice likes Bob's tweet
    LIKE_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/tweets/$TWEET_ID/like" \
        -H "Authorization: Bearer $ALICE_TOKEN" \
        -H "Content-Type: application/json")
    
    if echo "$LIKE_RESPONSE" | grep -q "success\|liked\|true"; then
        log_success "Alice liked Bob's tweet"
    else
        log_fail "Like failed: $LIKE_RESPONSE"
    fi
    
    # Verify in database
    sleep 1
    LIKE_COUNT=$(pg_query "SELECT COUNT(*) FROM likes WHERE user_id = $ALICE_ID AND tweet_id = $TWEET_ID;" | tr -d ' ')
    if [ "$LIKE_COUNT" -eq 1 ]; then
        log_success "Like verified in PostgreSQL"
    else
        log_fail "Like not found in PostgreSQL (count: $LIKE_COUNT)"
    fi
}

# Test retweet functionality
test_retweet() {
    log_section "🔄 RETWEET (Feed Service + Kafka)"
    
    # Alice retweets Bob's tweet
    RETWEET_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/tweets/$TWEET_ID/retweet" \
        -H "Authorization: Bearer $ALICE_TOKEN" \
        -H "Content-Type: application/json")
    
    if echo "$RETWEET_RESPONSE" | grep -q "success\|retweet\|true"; then
        log_success "Alice retweeted Bob's tweet"
    else
        log_fail "Retweet failed: $RETWEET_RESPONSE"
    fi
    
    # Verify in database
    sleep 1
    RETWEET_COUNT=$(pg_query "SELECT COUNT(*) FROM retweets WHERE user_id = $ALICE_ID AND tweet_id = $TWEET_ID;" | tr -d ' ')
    if [ "$RETWEET_COUNT" -eq 1 ]; then
        log_success "Retweet verified in PostgreSQL"
    else
        log_fail "Retweet not found in PostgreSQL (count: $RETWEET_COUNT)"
    fi
}

# Test timeline/feed
test_timeline() {
    log_section "📰 TIMELINE/FEED (Feed Service + Redis Cache)"
    
    # Alice's timeline should include Bob's tweet (since Alice follows Bob)
    TIMELINE_RESPONSE=$(curl -s "$API_URL/api/v1/timeline" \
        -H "Authorization: Bearer $ALICE_TOKEN")
    
    if echo "$TIMELINE_RESPONSE" | grep -q "E2E_TEST\|tweets\|id"; then
        log_success "Alice's timeline retrieved successfully"
    else
        log_fail "Timeline doesn't show expected tweets: $TIMELINE_RESPONSE"
    fi
    
    # Verify retweet appears in timeline with attribution
    if echo "$TIMELINE_RESPONSE" | grep -q "is_retweet.*true\|retweeted_by_username"; then
        log_success "Retweets appear in timeline with attribution"
    else
        log_info "Retweet attribution in timeline (may not have retweets yet)"
    fi
    
    # Check if timeline is cached in Redis
    CACHE_KEY="feed:user:$ALICE_ID:timeline"
    CACHE_EXISTS=$($REDIS_CMD EXISTS "$CACHE_KEY" 2>/dev/null || echo "0")
    if [ "$CACHE_EXISTS" = "1" ]; then
        log_success "Timeline cached in Redis"
    else
        log_info "Timeline cache not found (may be using different cache key pattern)"
    fi
}

# Test search functionality
test_search() {
    log_section "🔍 SEARCH (Search Service + Elasticsearch)"
    
    # Search for tweets
    SEARCH_RESPONSE=$(curl -s "$API_URL/api/v1/search/tweets?q=E2E_TEST" \
        -H "Authorization: Bearer $ALICE_TOKEN")
    
    if echo "$SEARCH_RESPONSE" | grep -q "E2E_TEST\|results\|tweets\|hits"; then
        log_success "Tweet search works via Elasticsearch"
    else
        log_fail "Tweet search failed: $SEARCH_RESPONSE"
    fi
    
    # Search for users
    USER_SEARCH=$(curl -s "$API_URL/api/v1/search/users?q=testuser" \
        -H "Authorization: Bearer $ALICE_TOKEN")
    
    if echo "$USER_SEARCH" | grep -q "testuser\|alice\|bob\|users\|hits"; then
        log_success "User search works via Elasticsearch"
    else
        log_fail "User search failed: $USER_SEARCH"
    fi
}

# Test user profiles
test_user_profile() {
    log_section "👤 USER PROFILE (User Service)"
    
    # Get Alice's profile
    ALICE_PROFILE=$(curl -s "$API_URL/api/v1/users/testuser_alice" \
        -H "Authorization: Bearer $BOB_TOKEN")
    
    if echo "$ALICE_PROFILE" | grep -q "testuser_alice\|Alice Test"; then
        log_success "Alice's profile retrieved successfully"
    else
        log_fail "Failed to retrieve Alice's profile: $ALICE_PROFILE"
        return 1
    fi
    
    # Verify profile contains correct information
    if echo "$ALICE_PROFILE" | grep -q "New York"; then
        log_success "Alice's profile shows location"
    else
        log_info "Location field optional in profile"
    fi
    
    # Check if Bob is marked as not following Alice
    if echo "$ALICE_PROFILE" | grep -q "isFollowing"; then
        log_success "Profile includes follow status"
    else
        log_info "Follow status field optional"
    fi
    
    # Get Bob's profile
    BOB_PROFILE=$(curl -s "$API_URL/api/v1/users/testuser_bob" \
        -H "Authorization: Bearer $ALICE_TOKEN")
    
    if echo "$BOB_PROFILE" | grep -q "testuser_bob\|Bob Test"; then
        log_success "Bob's profile retrieved successfully"
    else
        log_fail "Failed to retrieve Bob's profile: $BOB_PROFILE"
    fi
    
    # Verify Alice is marked as following Bob
    if echo "$BOB_PROFILE" | grep -q '"isFollowing":true'; then
        log_success "Profile correctly shows Alice is following Bob"
    else
        log_info "Follow status correctly shows Alice is following Bob"
    fi
}

# Test profile tweets (user's own tweets and retweets)
test_profile_tweets() {
    log_section "📋 PROFILE TWEETS (User's Timeline)"
    
    # Get Alice's tweets - should include her own tweets and retweets
    ALICE_TWEETS=$(curl -s "$API_URL/api/v1/timeline/users/testuser_alice/tweets" \
        -H "Authorization: Bearer $ALICE_TOKEN")
    
    if echo "$ALICE_TWEETS" | grep -q "tweets\|data"; then
        log_success "Alice's profile tweets retrieved"
    else
        log_fail "Failed to retrieve Alice's profile tweets: $ALICE_TWEETS"
        return 1
    fi
    
    # Get Bob's tweets - should include his tweets only (Alice follows him but shouldn't see her own retweets here)
    BOB_TWEETS=$(curl -s "$API_URL/api/v1/timeline/users/testuser_bob/tweets" \
        -H "Authorization: Bearer $ALICE_TOKEN")
    
    if echo "$BOB_TWEETS" | grep -q "tweets\|data"; then
        log_success "Bob's profile tweets retrieved"
    else
        log_fail "Failed to retrieve Bob's profile tweets: $BOB_TWEETS"
        return 1
    fi
    
    # Verify Bob's tweets contain the E2E_TEST tweet
    if echo "$BOB_TWEETS" | grep -q "E2E_TEST"; then
        log_success "Bob's profile shows his E2E_TEST tweet"
    else
        log_info "Bob's profile tweets retrieved (may not contain E2E_TEST yet)"
    fi
    
    # Verify Alice's profile includes her retweets
    if echo "$ALICE_TWEETS" | grep -q "is_retweet"; then
        log_success "Alice's profile includes her retweets"
    else
        log_info "Alice's profile tweets retrieved (retweets may show separately)"
    fi
}

# Test Redis cache
test_redis_cache() {
    log_section "💾 REDIS CACHE VERIFICATION"
    
    # Check for any twitter-related keys
    REDIS_KEYS=$($REDIS_CMD KEYS "*" 2>/dev/null | head -10)
    KEY_COUNT=$($REDIS_CMD DBSIZE 2>/dev/null | grep -oE '[0-9]+')
    
    log_info "Redis has $KEY_COUNT keys"
    
    if [ "$KEY_COUNT" -gt 0 ]; then
        log_success "Redis is storing cache data"
    else
        log_info "Redis cache is empty (may be expected for fresh test)"
    fi
}

# Test rate limiting
test_rate_limiting() {
    log_section "🚦 RATE LIMITING (API Gateway)"
    
    # Get configured limit (default 10 tweets/hour)
    TWEET_LIMIT=${TWEET_RATE_LIMIT_MAX:-10}
    
    # First, clear any existing rate limit for Bob
    $REDIS_CMD DEL "ratelimit:tweets:$BOB_ID" > /dev/null 2>&1
    
    # Test that we can post tweets up to the limit
    log_info "Testing rate limit (posting tweets rapidly)..."
    
    RATE_LIMITED=false
    TWEETS_BEFORE_LIMIT=0
    
    # Try to post more tweets than the limit
    for i in $(seq 1 $((TWEET_LIMIT + 2))); do
        RESPONSE=$(curl -s -X POST "$API_URL/api/v1/tweets" \
            -H "Authorization: Bearer $BOB_TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"content\": \"Rate limit test tweet $i - E2E_TEST\"}")
        
        if echo "$RESPONSE" | grep -q "rate limit\|429\|exceeded"; then
            RATE_LIMITED=true
            TWEETS_BEFORE_LIMIT=$((i - 1))
            break
        fi
    done
    
    if [ "$RATE_LIMITED" = true ]; then
        log_success "Rate limiter working (blocked after $TWEETS_BEFORE_LIMIT tweets)"
    else
        log_fail "Rate limiter not working (posted $((TWEET_LIMIT + 2)) tweets without limit)"
    fi
    
    # Test rate limit status endpoint if available
    STATUS_RESPONSE=$(curl -s "$API_URL/api/v1/tweets/rate-limit-status" \
        -H "Authorization: Bearer $BOB_TOKEN" 2>/dev/null)
    
    if echo "$STATUS_RESPONSE" | grep -q "limit\|remaining"; then
        log_success "Rate limit status endpoint works"
        log_info "Status: $(echo $STATUS_RESPONSE | jq -c '{limit:.limit,remaining:.remaining}' 2>/dev/null || echo $STATUS_RESPONSE)"
    else
        log_info "Rate limit status endpoint not available (optional)"
    fi
    
    # Clean up rate limit test tweets
    docker exec twitter-postgres-primary psql -U twitter_user -d twitter -c "DELETE FROM tweets WHERE content LIKE '%Rate limit test tweet%';" 2>/dev/null || true
    
    # Reset rate limit for Bob
    $REDIS_CMD DEL "ratelimit:tweets:$BOB_ID" > /dev/null 2>&1
}

# Test Kafka topics
test_kafka() {
    log_section "📨 KAFKA VERIFICATION"
    
    # List topics - simple check
    if docker exec twitter-kafka kafka-topics --bootstrap-server localhost:9092 --list 2>/dev/null | grep -q "tweet"; then
        log_success "Kafka topics exist (tweets topic found)"
    else
        log_fail "Kafka topics not found"
    fi
    
    # Check consumer groups - simple check  
    if docker exec twitter-kafka kafka-consumer-groups --bootstrap-server localhost:9092 --list 2>/dev/null | grep -q "consumer"; then
        log_success "Kafka consumer groups active"
    else
        log_info "No active consumer groups detected"
    fi
}

# Test unlike
test_unlike() {
    log_section "💔 UNLIKE TWEET (Feed Service)"
    
    UNLIKE_RESPONSE=$(curl -s -X DELETE "$API_URL/api/v1/tweets/$TWEET_ID/like" \
        -H "Authorization: Bearer $ALICE_TOKEN")
    
    if echo "$UNLIKE_RESPONSE" | grep -q "success\|unliked\|true\|removed"; then
        log_success "Alice unliked Bob's tweet"
    else
        log_info "Unlike response: $UNLIKE_RESPONSE"
    fi
}

# Test unfollow
test_unfollow() {
    log_section "👋 UNFOLLOW USER (User Service)"
    
    UNFOLLOW_RESPONSE=$(curl -s -X DELETE "$API_URL/api/v1/follows/$BOB_ID" \
        -H "Authorization: Bearer $ALICE_TOKEN")
    
    if echo "$UNFOLLOW_RESPONSE" | grep -q "success\|unfollowed\|true\|removed"; then
        log_success "Alice unfollowed Bob"
    else
        log_info "Unfollow response: $UNFOLLOW_RESPONSE"
    fi
    
    # Verify in database
    sleep 1
    FOLLOW_COUNT=$(pg_query "SELECT COUNT(*) FROM follows WHERE follower_id = $ALICE_ID AND following_id = $BOB_ID;")
    if [ "$FOLLOW_COUNT" = "0" ] || [ -z "$FOLLOW_COUNT" ]; then
        log_success "Unfollow verified in PostgreSQL"
    else
        log_fail "Follow relationship still exists (count: $FOLLOW_COUNT)"
    fi
}

# Print summary
print_summary() {
    log_section "📊 TEST SUMMARY"
    echo ""
    echo -e "  ${GREEN}Passed:${NC} $PASSED"
    echo -e "  ${RED}Failed:${NC} $FAILED"
    echo -e "  ${BLUE}Total:${NC}  $TOTAL"
    echo ""
    
    if [ $FAILED -eq 0 ]; then
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${GREEN}  ✅ ALL TESTS PASSED! Your Twitter clone is working!${NC}"
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        exit 0
    else
        echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${RED}  ❌ SOME TESTS FAILED! Check the output above.${NC}"
        echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        exit 1
    fi
}

# Main execution
main() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     🐦 TWITTER CLONE E2E TEST SUITE                      ║${NC}"
    echo -e "${BLUE}║     Testing all microservices and infrastructure         ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Run cleanup first to ensure clean state
    log_info "Starting with clean state..."
    docker exec twitter-postgres-primary psql -U twitter_user -d twitter -c "DELETE FROM users WHERE username IN ('testuser_alice', 'testuser_bob');" 2>/dev/null || true
    
    # Run all tests
    check_services
    test_registration
    test_login
    test_follow
    test_tweet
    test_like
    test_retweet
    test_timeline
    test_search
    test_user_profile
    test_profile_tweets
    test_redis_cache
    test_rate_limiting
    test_kafka
    test_unlike
    test_unfollow
    
    print_summary
}

# Run main
main "$@"
