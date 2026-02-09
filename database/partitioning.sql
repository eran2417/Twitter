-- Partitioning Strategy for Users and Tweets Tables
-- Users: List Partitioning by location first letter groups (13 partitions for location-based data distribution)
-- Tweets: Range Partitioning by created_at

-- First, partition the users table
ALTER TABLE users RENAME TO users_old;

-- Create function for location-based partitioning
CREATE OR REPLACE FUNCTION get_location_partition_key(loc VARCHAR(100))
RETURNS TEXT AS $$
BEGIN
    RETURN CASE 
        WHEN upper(substring(coalesce(loc, ''), 1, 1)) IN ('A','B') THEN 'AB'
        WHEN upper(substring(coalesce(loc, ''), 1, 1)) IN ('C','D') THEN 'CD'
        WHEN upper(substring(coalesce(loc, ''), 1, 1)) IN ('E','F') THEN 'EF'
        WHEN upper(substring(coalesce(loc, ''), 1, 1)) IN ('G','H') THEN 'GH'
        WHEN upper(substring(coalesce(loc, ''), 1, 1)) IN ('I','J') THEN 'IJ'
        WHEN upper(substring(coalesce(loc, ''), 1, 1)) IN ('K','L') THEN 'KL'
        WHEN upper(substring(coalesce(loc, ''), 1, 1)) IN ('M','N') THEN 'MN'
        WHEN upper(substring(coalesce(loc, ''), 1, 1)) IN ('O','P') THEN 'OP'
        WHEN upper(substring(coalesce(loc, ''), 1, 1)) IN ('Q','R') THEN 'QR'
        WHEN upper(substring(coalesce(loc, ''), 1, 1)) IN ('S','T') THEN 'ST'
        WHEN upper(substring(coalesce(loc, ''), 1, 1)) IN ('U','V') THEN 'UV'
        WHEN upper(substring(coalesce(loc, ''), 1, 1)) IN ('W','X') THEN 'WX'
        ELSE 'YZ'
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create partitioned users table
CREATE TABLE users (
    id BIGSERIAL,
    username VARCHAR(15) NOT NULL,
    email VARCHAR(254) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(50) NOT NULL,
    bio TEXT,
    avatar_url TEXT,
    location VARCHAR(100),
    verified BOOLEAN DEFAULT FALSE,
    follower_count INTEGER DEFAULT 0,
    following_count INTEGER DEFAULT 0,
    tweet_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) PARTITION BY LIST (get_location_partition_key(location));

-- Create partitions for location first letter groups (13 partitions)
CREATE TABLE users_ab PARTITION OF users FOR VALUES IN ('AB');
CREATE TABLE users_cd PARTITION OF users FOR VALUES IN ('CD');
CREATE TABLE users_ef PARTITION OF users FOR VALUES IN ('EF');
CREATE TABLE users_gh PARTITION OF users FOR VALUES IN ('GH');
CREATE TABLE users_ij PARTITION OF users FOR VALUES IN ('IJ');
CREATE TABLE users_kl PARTITION OF users FOR VALUES IN ('KL');
CREATE TABLE users_mn PARTITION OF users FOR VALUES IN ('MN');
CREATE TABLE users_op PARTITION OF users FOR VALUES IN ('OP');
CREATE TABLE users_qr PARTITION OF users FOR VALUES IN ('QR');
CREATE TABLE users_st PARTITION OF users FOR VALUES IN ('ST');
CREATE TABLE users_uv PARTITION OF users FOR VALUES IN ('UV');
CREATE TABLE users_wx PARTITION OF users FOR VALUES IN ('WX');
CREATE TABLE users_yz PARTITION OF users FOR VALUES IN ('YZ', '');

-- Create indexes on partitioned table
CREATE INDEX idx_users_username ON users (username);
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_location ON users (location);
CREATE INDEX idx_users_created_at ON users (created_at);

-- Migrate data from old users table
INSERT INTO users SELECT * FROM users_old;

-- Drop old users table
DROP TABLE IF EXISTS users_old CASCADE;

-- Update triggers for partitioned users table
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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

-- Note: Self-referencing foreign keys on partitioned tables require special handling
-- We'll handle reply_to_tweet_id validation in application layer

-- Update triggers for partitioned table
CREATE TRIGGER update_tweets_updated_at BEFORE UPDATE ON tweets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER tweet_count_trigger
AFTER INSERT OR DELETE ON tweets
FOR EACH ROW EXECUTE FUNCTION update_tweet_count();

-- Note: Users table is now partitioned by LIST(location first letter groups) with 13 partitions
-- Global uniqueness of username and email is enforced at application level
-- This provides location-based data distribution while maintaining global constraints
-- Tweets partitioning provides additional horizontal scalability

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