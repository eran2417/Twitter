-- Partitioning Strategy for Tweets Table (Range Partitioning by created_at)
-- This implements partitioning from "Designing Data-Intensive Applications"

-- First, rename the existing tweets table
ALTER TABLE tweets RENAME TO tweets_old;

-- Create partitioned tweets table
CREATE TABLE tweets (
    id BIGSERIAL,
    user_id BIGINT NOT NULL,
    content TEXT NOT NULL CHECK (length(content) <= 280),
    reply_to_tweet_id BIGINT,
    media_urls TEXT[],
    hashtags TEXT[],
    mentions BIGINT[],
    like_count INTEGER DEFAULT 0,
    retweet_count INTEGER DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create partitions for different time periods
-- 2024 partitions
CREATE TABLE tweets_2024_q1 PARTITION OF tweets
    FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');

CREATE TABLE tweets_2024_q2 PARTITION OF tweets
    FOR VALUES FROM ('2024-04-01') TO ('2024-07-01');

CREATE TABLE tweets_2024_q3 PARTITION OF tweets
    FOR VALUES FROM ('2024-07-01') TO ('2024-10-01');

CREATE TABLE tweets_2024_q4 PARTITION OF tweets
    FOR VALUES FROM ('2024-10-01') TO ('2025-01-01');

-- 2025 partitions
CREATE TABLE tweets_2025_q1 PARTITION OF tweets
    FOR VALUES FROM ('2025-01-01') TO ('2025-04-01');

CREATE TABLE tweets_2025_q2 PARTITION OF tweets
    FOR VALUES FROM ('2025-04-01') TO ('2025-07-01');

CREATE TABLE tweets_2025_q3 PARTITION OF tweets
    FOR VALUES FROM ('2025-07-01') TO ('2025-10-01');

CREATE TABLE tweets_2025_q4 PARTITION OF tweets
    FOR VALUES FROM ('2025-10-01') TO ('2026-01-01');

-- 2026 partitions
CREATE TABLE tweets_2026_q1 PARTITION OF tweets
    FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');

CREATE TABLE tweets_2026_q2 PARTITION OF tweets
    FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');

CREATE TABLE tweets_2026_q3 PARTITION OF tweets
    FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');

CREATE TABLE tweets_2026_q4 PARTITION OF tweets
    FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');

-- Default partition for future data
CREATE TABLE tweets_default PARTITION OF tweets DEFAULT;

-- Recreate indexes on partitioned table
CREATE INDEX idx_tweets_timeline ON tweets (user_id, created_at DESC);
CREATE INDEX idx_tweets_mentions ON tweets USING GIN (mentions);
CREATE INDEX idx_tweets_hashtags ON tweets USING GIN (hashtags);

-- Migrate data from old table if exists
INSERT INTO tweets SELECT * FROM tweets_old WHERE EXISTS (SELECT 1 FROM tweets_old);

-- Drop old table with cascade to remove dependent objects
DROP TABLE IF EXISTS tweets_old CASCADE;

-- Add foreign key constraints (after partitioning setup)
ALTER TABLE tweets ADD CONSTRAINT fk_tweets_user 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Note: Self-referencing foreign keys on partitioned tables require special handling
-- We'll handle reply_to_tweet_id validation in application layer

-- Update triggers for partitioned table
CREATE TRIGGER update_tweets_updated_at BEFORE UPDATE ON tweets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER tweet_count_trigger
AFTER INSERT OR DELETE ON tweets
FOR EACH ROW EXECUTE FUNCTION update_tweet_count();

-- Note: Users table partitioning is DISABLED because PostgreSQL requires unique
-- constraints (username, email) to include the partition key, which would break uniqueness
-- Tweets partitioning alone provides sufficient horizontal scalability

-- Note: Foreign keys for likes and retweets already exist from init-primary.sql
-- They were automatically dropped when tweets_old was dropped with CASCADE

-- Create materialized view for trending hashtags (for analytics)
CREATE MATERIALIZED VIEW trending_hashtags AS
SELECT 
    unnest(hashtags) as hashtag,
    COUNT(*) as tweet_count,
    MAX(created_at) as last_used
FROM tweets
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hashtag
ORDER BY tweet_count DESC
LIMIT 100;

CREATE UNIQUE INDEX idx_trending_hashtags ON trending_hashtags (hashtag);

-- Function to refresh trending hashtags
CREATE OR REPLACE FUNCTION refresh_trending_hashtags()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY trending_hashtags;
END;
$$ LANGUAGE plpgsql;

-- Create a view for timeline (optimized for read replicas)
CREATE OR REPLACE VIEW user_timeline AS
SELECT 
    t.id,
    t.user_id,
    t.content,
    t.reply_to_tweet_id,
    t.media_urls,
    t.hashtags,
    t.mentions,
    t.like_count,
    t.retweet_count,
    t.reply_count,
    t.created_at,
    u.username,
    u.display_name,
    u.avatar_url,
    u.verified
FROM tweets t
JOIN users u ON t.user_id = u.id;