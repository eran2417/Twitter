const { Pool } = require('pg');
const logger = require('../utils/logger');

// Primary database connection (for writes)
const primaryPool = new Pool({
  host: process.env.DB_PRIMARY_HOST || 'localhost',
  port: process.env.DB_PRIMARY_PORT || 5432,
  database: process.env.DB_NAME || 'twitter',
  user: process.env.DB_USER || 'twitter_user',
  password: process.env.DB_PASSWORD || 'password',
  min: parseInt(process.env.DB_POOL_MIN) || 2,
  max: parseInt(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Replica database connection (for reads)
const replicaPool = new Pool({
  host: process.env.DB_REPLICA_HOST || 'localhost',
  port: process.env.DB_REPLICA_PORT || 5433,
  database: process.env.DB_NAME || 'twitter',
  user: process.env.DB_USER || 'twitter_user',
  password: process.env.DB_PASSWORD || 'password',
  min: parseInt(process.env.DB_POOL_MIN) || 2,
  max: parseInt(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Connection event handlers
primaryPool.on('connect', () => {
  logger.info('Primary database pool connected');
});

primaryPool.on('error', (err) => {
  logger.error('Primary database pool error:', err);
});

replicaPool.on('connect', () => {
  logger.info('Replica database pool connected');
});

replicaPool.on('error', (err) => {
  logger.error('Replica database pool error:', err);
  // Fallback to primary on replica error
  logger.info('Falling back to primary database for reads');
});

// Query wrapper with automatic read/write routing
const query = async (text, params, options = {}) => {
  const { write = false, transaction = false } = options;
  
  // Use primary for writes and transactions
  const pool = (write || transaction) ? primaryPool : replicaPool;
  
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (duration > 1000) {
      logger.warn(`Slow query (${duration}ms):`, { text, params });
    }
    
    return result;
  } catch (error) {
    logger.error('Database query error:', { text, params, error: error.message });
    
    // Fallback to primary if replica fails
    if (!write && !transaction && pool === replicaPool) {
      logger.info('Retrying query on primary database');
      return await primaryPool.query(text, params);
    }
    
    throw error;
  }
};

// Transaction helper
const transaction = async (callback) => {
  const client = await primaryPool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Transaction rolled back:', error);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  primary: primaryPool,
  replica: replicaPool,
  query,
  transaction
};
