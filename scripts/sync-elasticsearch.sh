#!/bin/bash
# Script to sync Elasticsearch with PostgreSQL after database restore

set -e

echo "=========================================="
echo "Sync Elasticsearch with PostgreSQL"
echo "=========================================="

# Check if services are running
if ! docker-compose ps postgres-primary | grep -q "Up"; then
    echo "❌ ERROR: PostgreSQL primary is not running!"
    exit 1
fi

if ! docker-compose ps elasticsearch | grep -q "Up"; then
    echo "❌ ERROR: Elasticsearch is not running!"
    exit 1
fi

if ! docker-compose ps backend | grep -q "Up"; then
    echo "❌ ERROR: Backend is not running!"
    exit 1
fi

echo "Reindexing users from PostgreSQL to Elasticsearch..."
USER_RESPONSE=$(curl -s -X POST http://localhost:3001/api/search/reindex-users)
USER_COUNT=$(echo $USER_RESPONSE | grep -o '"count":[0-9]*' | cut -d':' -f2)

echo "Reindexing tweets from PostgreSQL to Elasticsearch..."
TWEET_RESPONSE=$(curl -s -X POST http://localhost:3001/api/search/reindex)
TWEET_COUNT=$(echo $TWEET_RESPONSE | grep -o '"count":[0-9]*' | cut -d':' -f2)

echo ""
echo "✅ Sync complete!"
echo "   Users indexed: $USER_COUNT"
echo "   Tweets indexed: $TWEET_COUNT"
echo ""
echo "Your Kibana data is now synchronized with the restored database."
echo "=========================================="