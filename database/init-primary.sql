-- Initialize Primary Database with Tables from schema.txt

-- Clean up existing objects if needed
DROP VIEW IF EXISTS user_timeline CASCADE;
DROP MATERIALIZED VIEW IF EXISTS trending_hashtags CASCADE;
DROP FUNCTION IF EXISTS refresh_trending_hashtags() CASCADE;
DROP FUNCTION IF EXISTS update_retweet_count() CASCADE;
DROP FUNCTION IF EXISTS update_like_count() CASCADE;
DROP FUNCTION IF EXISTS update_tweet_count() CASCADE;
DROP FUNCTION IF EXISTS update_follow_counts() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP TABLE IF EXISTS retweets CASCADE;
DROP TABLE IF EXISTS likes CASCADE;
DROP TABLE IF EXISTS tweets CASCADE;
DROP TABLE IF EXISTS tweets_old CASCADE;
DROP TABLE IF EXISTS follows CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(15) NOT NULL UNIQUE,
    email VARCHAR(254) NOT NULL UNIQUE,
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
);

CREATE TABLE follows (
    id BIGSERIAL PRIMARY KEY,
    follower_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(follower_id, following_id),
    CHECK (follower_id != following_id)
);

-- Temporarily store old tweets if they exist
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tweets') THEN
        ALTER TABLE tweets RENAME TO tweets_old;
    END IF;
END $$;

-- Create partitioned tweets table with RANGE partitioning by created_at
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

-- Add foreign key constraint to partitioned table
ALTER TABLE tweets ADD CONSTRAINT fk_tweets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
-- Note: Self-referential FK (reply_to_tweet_id) is tricky with partitioned tables, so we handle it via application logic

-- Migrate data from old table if it exists
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tweets_old') THEN
        INSERT INTO tweets SELECT * FROM tweets_old;
        DROP TABLE tweets_old CASCADE;
    END IF;
END $$;

-- Likes table for better tracking
CREATE TABLE likes (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tweet_id BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, tweet_id)
);

-- Retweets table
CREATE TABLE retweets (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tweet_id BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, tweet_id)
);

-- NOTE: Tweet indexes created after partitioning setup above

-- Follower lookup: "Who follows this user?"
CREATE INDEX idx_follows_follower ON follows (following_id, created_at DESC);

-- Following lookup: "Who does this user follow?"
CREATE INDEX idx_follows_following ON follows (follower_id, created_at DESC);

-- Likes indexes
CREATE INDEX idx_likes_tweet ON likes (tweet_id, created_at DESC);
CREATE INDEX idx_likes_user ON likes (user_id, created_at DESC);

-- Retweets indexes
CREATE INDEX idx_retweets_tweet ON retweets (tweet_id, created_at DESC);
CREATE INDEX idx_retweets_user ON retweets (user_id, created_at DESC);

-- Enable logical replication for read replicas
ALTER SYSTEM SET wal_level = 'logical';
ALTER SYSTEM SET max_replication_slots = 10;
ALTER SYSTEM SET max_wal_senders = 10;

-- Create replication user
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'replicator_password';

-- Grant necessary permissions
GRANT CONNECT ON DATABASE twitter TO replicator;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO replicator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO replicator;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tweets_updated_at BEFORE UPDATE ON tweets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update follower/following counts
CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE users SET following_count = following_count + 1 WHERE id = NEW.follower_id;
        UPDATE users SET follower_count = follower_count + 1 WHERE id = NEW.following_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE users SET following_count = following_count - 1 WHERE id = OLD.follower_id;
        UPDATE users SET follower_count = follower_count - 1 WHERE id = OLD.following_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER follow_counts_trigger
AFTER INSERT OR DELETE ON follows
FOR EACH ROW EXECUTE FUNCTION update_follow_counts();

-- Function to update tweet count
CREATE OR REPLACE FUNCTION update_tweet_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE users SET tweet_count = tweet_count + 1 WHERE id = NEW.user_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE users SET tweet_count = tweet_count - 1 WHERE id = OLD.user_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tweet_count_trigger
AFTER INSERT OR DELETE ON tweets
FOR EACH ROW EXECUTE FUNCTION update_tweet_count();

-- Function to update like count
CREATE OR REPLACE FUNCTION update_like_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE tweets SET like_count = like_count + 1 WHERE id = NEW.tweet_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE tweets SET like_count = like_count - 1 WHERE id = OLD.tweet_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER like_count_trigger
AFTER INSERT OR DELETE ON likes
FOR EACH ROW EXECUTE FUNCTION update_like_count();

-- Function to update retweet count
CREATE OR REPLACE FUNCTION update_retweet_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE tweets SET retweet_count = retweet_count + 1 WHERE id = NEW.tweet_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE tweets SET retweet_count = retweet_count - 1 WHERE id = OLD.tweet_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER retweet_count_trigger
AFTER INSERT OR DELETE ON retweets
FOR EACH ROW EXECUTE FUNCTION update_retweet_count();
-- Tweet indexes for partitioned table (on parent table for all partitions)
CREATE INDEX idx_tweets_timeline ON tweets (user_id, created_at DESC);
CREATE INDEX idx_tweets_mentions ON tweets USING GIN (mentions);
CREATE INDEX idx_tweets_hashtags ON tweets USING GIN (hashtags);

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