#!/bin/bash
# Script to truncate all Twitter database tables

set -e

echo "=========================================="
echo "Truncate All Twitter Database Tables"
echo "=========================================="

# Check if services are running
if ! docker-compose ps postgres-primary | grep -q "Up"; then
    echo "❌ ERROR: PostgreSQL primary is not running!"
    exit 1
fi

echo "Truncating all Twitter database tables..."

# Execute truncation with error handling
if docker-compose exec -T postgres-primary psql -U twitter_user -d twitter -c "
-- Truncate all main tables
TRUNCATE TABLE users CASCADE;
TRUNCATE TABLE follows CASCADE;
TRUNCATE TABLE likes CASCADE;
TRUNCATE TABLE retweets CASCADE;

-- Truncate all tweet partitions
TRUNCATE TABLE tweets_2024_q1 CASCADE;
TRUNCATE TABLE tweets_2024_q2 CASCADE;
TRUNCATE TABLE tweets_2024_q3 CASCADE;
TRUNCATE TABLE tweets_2024_q4 CASCADE;
TRUNCATE TABLE tweets_2025_q1 CASCADE;
TRUNCATE TABLE tweets_2025_q2 CASCADE;
TRUNCATE TABLE tweets_2025_q3 CASCADE;
TRUNCATE TABLE tweets_2025_q4 CASCADE;
TRUNCATE TABLE tweets_2026_q1 CASCADE;
TRUNCATE TABLE tweets_2026_q2 CASCADE;
TRUNCATE TABLE tweets_2026_q3 CASCADE;
TRUNCATE TABLE tweets_2026_q4 CASCADE;
TRUNCATE TABLE tweets_default CASCADE;

SELECT 'All tables truncated successfully' as status;
" 2>/dev/null; then
    echo "✅ All tables truncated successfully!"
else
    echo "❌ ERROR: Failed to truncate tables!"
    exit 1
fi

echo "=========================================="

echo "Data truncation complete!"