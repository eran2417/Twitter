-- Initialize Primary Database with Tables from schema.txt

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
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
);

CREATE TABLE follows (
    id BIGSERIAL PRIMARY KEY,
    follower_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(follower_id, following_id),
    CHECK (follower_id != following_id)
);

CREATE TABLE tweets (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (length(content) <= 280),
    reply_to_tweet_id BIGINT REFERENCES tweets(id) ON DELETE SET NULL,
    media_urls TEXT[],
    hashtags TEXT[],
    mentions BIGINT[],
    like_count INTEGER DEFAULT 0,
    retweet_count INTEGER DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Likes table for better tracking
CREATE TABLE likes (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tweet_id BIGINT NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, tweet_id)
);

-- Retweets table
CREATE TABLE retweets (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tweet_id BIGINT NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, tweet_id)
);

-- NOTE: Tweet indexes will be created in partitioning.sql after converting to partitioned table

-- Follower lookup: "Who follows this user?"
CREATE INDEX idx_follows_follower ON follows (following_id, created_at DESC);

-- Following lookup: "Who does this user follow?"
CREATE INDEX idx_follows_following ON follows (follower_id, created_at DESC);

-- NOTE: Tweet mention and hashtag indexes created in partitioning.sql

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
