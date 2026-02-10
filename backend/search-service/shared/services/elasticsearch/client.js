const { Client } = require('@elastic/elasticsearch');
const logger = require('../../utils/logger');
const { db } = require('../../index');

const client = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  maxRetries: 5,
  requestTimeout: 60000,
  sniffOnStart: false
});

let isConnected = false;

// Index mappings for tweets
const TWEETS_INDEX = 'tweets';
const TWEETS_MAPPING = {
  mappings: {
    properties: {
      id: { type: 'keyword' },
      content: { 
        type: 'text',
        analyzer: 'standard',
        fields: {
          keyword: { type: 'keyword' }
        }
      },
      user_id: { type: 'keyword' },
      username: { 
        type: 'text',
        fields: {
          keyword: { type: 'keyword' }
        }
      },
      display_name: { 
        type: 'text',
        fields: {
          keyword: { type: 'keyword' }
        }
      },
      created_at: { type: 'date' },
      like_count: { type: 'integer' },
      retweet_count: { type: 'integer' },
      reply_count: { type: 'integer' },
      hashtags: { type: 'keyword' },
      mentions: { type: 'keyword' }
    }
  },
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
    analysis: {
      analyzer: {
        tweet_analyzer: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'stop', 'snowball']
        }
      }
    }
  }
};

// Users index mapping
const USERS_INDEX = 'users';
const USERS_MAPPING = {
  mappings: {
    properties: {
      id: { type: 'keyword' },
      username: { 
        type: 'text',
        fields: {
          keyword: { type: 'keyword' },
          autocomplete: {
            type: 'text',
            analyzer: 'autocomplete'
          }
        }
      },
      display_name: { 
        type: 'text',
        fields: {
          keyword: { type: 'keyword' },
          autocomplete: {
            type: 'text',
            analyzer: 'autocomplete'
          }
        }
      },
      bio: { type: 'text' },
      created_at: { type: 'date' },
      followers_count: { type: 'integer' },
      following_count: { type: 'integer' },
      tweets_count: { type: 'integer' }
    }
  },
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
    analysis: {
      analyzer: {
        autocomplete: {
          type: 'custom',
          tokenizer: 'autocomplete_tokenizer',
          filter: ['lowercase']
        }
      },
      tokenizer: {
        autocomplete_tokenizer: {
          type: 'edge_ngram',
          min_gram: 1,
          max_gram: 20,
          token_chars: ['letter', 'digit']
        }
      }
    }
  }
};

/**
 * Initialize Elasticsearch connection and create indices
 */
const connect = async () => {
  try {
    // Check cluster health
    const health = await client.cluster.health({});
    logger.info('Elasticsearch cluster health:', health);
    
    // Create tweets index if not exists
    const tweetsIndexExists = await client.indices.exists({ index: TWEETS_INDEX });
    if (!tweetsIndexExists) {
      await client.indices.create({
        index: TWEETS_INDEX,
        body: TWEETS_MAPPING
      });
      logger.info('Created tweets index');
    }
    
    // Create users index if not exists
    const usersIndexExists = await client.indices.exists({ index: USERS_INDEX });
    if (!usersIndexExists) {
      await client.indices.create({
        index: USERS_INDEX,
        body: USERS_MAPPING
      });
      logger.info('Created users index');
    }
    
    isConnected = true;
    logger.info('Elasticsearch connected and indices ready');
    return true;
  } catch (error) {
    logger.error('Elasticsearch connection error:', error);
    isConnected = false;
    throw error;
  }
};

/**
 * Index a tweet document
 */
const indexTweet = async (tweet) => {
  try {
    // Extract hashtags and mentions from content
    const hashtags = (tweet.content.match(/#\w+/g) || []).map(h => h.toLowerCase());
    const mentions = (tweet.content.match(/@\w+/g) || []).map(m => m.toLowerCase());
    
    const document = {
      id: tweet.id.toString(),
      content: tweet.content,
      user_id: tweet.user_id.toString(),
      username: tweet.username,
      display_name: tweet.display_name,
      created_at: tweet.created_at,
      like_count: tweet.like_count || 0,
      retweet_count: tweet.retweet_count || 0,
      reply_count: tweet.reply_count || 0,
      hashtags,
      mentions
    };
    
    await client.index({
      index: TWEETS_INDEX,
      id: tweet.id.toString(),
      document,
      refresh: true
    });
    
    logger.info(`Indexed tweet ${tweet.id}`);
    return true;
  } catch (error) {
    logger.error('Error indexing tweet:', error);
    throw error;
  }
};

/**
 * Index a user document
 */
const indexUser = async (user) => {
  try {
    const document = {
      id: user.id.toString(),
      username: user.username,
      display_name: user.display_name,
      bio: user.bio || '',
      created_at: user.created_at,
      followers_count: user.follower_count || user.followers_count || 0,
      following_count: user.following_count || 0,
      tweets_count: user.tweet_count || user.tweets_count || 0
    };
    
    await client.index({
      index: USERS_INDEX,
      id: user.id.toString(),
      document,
      refresh: true
    });
    
    logger.info(`Indexed user ${user.id}`);
    return true;
  } catch (error) {
    logger.error('Error indexing user:', error);
    throw error;
  }
};

/**
 * Delete a tweet from the index
 */
const deleteTweet = async (tweetId) => {
  try {
    await client.delete({
      index: TWEETS_INDEX,
      id: tweetId.toString(),
      refresh: true
    });
    logger.info(`Deleted tweet ${tweetId} from index`);
    return true;
  } catch (error) {
    if (error.meta?.statusCode === 404) {
      logger.warn(`Tweet ${tweetId} not found in index`);
      return false;
    }
    logger.error('Error deleting tweet:', error);
    throw error;
  }
};

/**
 * Search tweets by content, hashtags, or mentions
 */
const searchTweets = async (query, options = {}) => {
  const { page = 1, limit = 20, sortBy = 'relevance', userId } = options;
  const from = (page - 1) * limit;
  
  try {
    // Get users that the current user follows (including themselves)
    let allowedUserIds = [];
    if (userId) {
      // Get following list from database
      const followsResult = await db.query(
        'SELECT following_id FROM follows WHERE follower_id = $1',
        [userId]
      );
      const followingIds = followsResult.rows.map(row => row.following_id.toString());
      
      // Include the user's own tweets
      allowedUserIds = [userId, ...followingIds];
    }
    
    const searchQuery = {
      bool: {
        should: [
          {
            multi_match: {
              query,
              fields: ['content^3', 'username^2', 'display_name'],
              fuzziness: 'AUTO'
            }
          },
          {
            term: {
              hashtags: query.toLowerCase().replace('#', '')
            }
          },
          {
            term: {
              mentions: query.toLowerCase().replace('@', '')
            }
          }
        ],
        minimum_should_match: 1,
        filter: userId ? [{
          terms: {
            user_id: allowedUserIds
          }
        }] : []
      }
    };
    
    const sort = sortBy === 'recent' 
      ? [{ created_at: 'desc' }]
      : [{ _score: 'desc' }, { created_at: 'desc' }];
    
    const result = await client.search({
      index: TWEETS_INDEX,
      body: {
        query: searchQuery,
        sort,
        from,
        size: limit,
        highlight: {
          fields: {
            content: {
              pre_tags: ['<mark>'],
              post_tags: ['</mark>']
            }
          }
        }
      }
    });
    
    const tweets = result.hits.hits.map(hit => ({
      ...hit._source,
      score: hit._score,
      highlight: hit.highlight
    }));
    
    return {
      tweets,
      total: result.hits.total.value,
      page,
      limit,
      totalPages: Math.ceil(result.hits.total.value / limit)
    };
  } catch (error) {
    logger.error('Error searching tweets:', error);
    throw error;
  }
};

/**
 * Search users by username or display name with autocomplete
 */
const searchUsers = async (query, options = {}) => {
  const { page = 1, limit = 10 } = options;
  const from = (page - 1) * limit;
  
  try {
    const result = await client.search({
      index: USERS_INDEX,
      body: {
        query: {
          bool: {
            should: [
              {
                match: {
                  'username.autocomplete': {
                    query,
                    boost: 2
                  }
                }
              },
              {
                match: {
                  'display_name.autocomplete': query
                }
              },
              {
                prefix: {
                  'username.keyword': {
                    value: query,
                    boost: 3
                  }
                }
              }
            ]
          }
        },
        from,
        size: limit,
        sort: [
          { _score: 'desc' },
          { followers_count: 'desc' }
        ]
      }
    });
    
    const users = result.hits.hits.map(hit => ({
      ...hit._source,
      score: hit._score
    }));
    
    return {
      users,
      total: result.hits.total.value,
      page,
      limit
    };
  } catch (error) {
    logger.error('Error searching users:', error);
    throw error;
  }
};

/**
 * Get trending hashtags
 */
const getTrendingHashtags = async (limit = 10) => {
  try {
    const result = await client.search({
      index: TWEETS_INDEX,
      body: {
        size: 0,
        query: {
          range: {
            created_at: {
              gte: 'now-24h'
            }
          }
        },
        aggs: {
          trending_hashtags: {
            terms: {
              field: 'hashtags',
              size: limit
            }
          }
        }
      }
    });
    
    return result.aggregations.trending_hashtags.buckets.map(bucket => ({
      hashtag: bucket.key,
      count: bucket.doc_count
    }));
  } catch (error) {
    logger.error('Error getting trending hashtags:', error);
    throw error;
  }
};

/**
 * Bulk index tweets (for initial data migration)
 */
const bulkIndexTweets = async (tweets) => {
  try {
    const operations = tweets.flatMap(tweet => {
      const hashtags = (tweet.content.match(/#\w+/g) || []).map(h => h.toLowerCase());
      const mentions = (tweet.content.match(/@\w+/g) || []).map(m => m.toLowerCase());
      
      return [
        { index: { _index: TWEETS_INDEX, _id: tweet.id.toString() } },
        {
          id: tweet.id.toString(),
          content: tweet.content,
          user_id: tweet.user_id.toString(),
          username: tweet.username,
          display_name: tweet.display_name,
          created_at: tweet.created_at,
          like_count: tweet.like_count || 0,
          retweet_count: tweet.retweet_count || 0,
          reply_count: tweet.reply_count || 0,
          hashtags,
          mentions
        }
      ];
    });
    
    const result = await client.bulk({ 
      operations,
      refresh: true 
    });
    
    if (result.errors) {
      const erroredDocs = result.items.filter(item => item.index?.error);
      logger.error('Bulk indexing errors:', erroredDocs);
    }
    
    logger.info(`Bulk indexed ${tweets.length} tweets`);
    return result;
  } catch (error) {
    logger.error('Error bulk indexing tweets:', error);
    throw error;
  }
};

/**
 * Update tweet engagement counts
 */
const updateTweetCounts = async (tweetId, counts) => {
  try {
    await client.update({
      index: TWEETS_INDEX,
      id: tweetId.toString(),
      body: {
        doc: counts
      },
      refresh: true
    });
    logger.info(`Updated counts for tweet ${tweetId}`);
    return true;
  } catch (error) {
    if (error.meta?.statusCode === 404) {
      logger.warn(`Tweet ${tweetId} not found in index for update`);
      return false;
    }
    logger.error('Error updating tweet counts:', error);
    throw error;
  }
};

module.exports = {
  client,
  connect,
  isConnected: () => isConnected,
  indexTweet,
  indexUser,
  deleteTweet,
  searchTweets,
  searchUsers,
  getTrendingHashtags,
  bulkIndexTweets,
  updateTweetCounts,
  TWEETS_INDEX,
  USERS_INDEX,
  USERS_MAPPING
};
