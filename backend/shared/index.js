const db = require('./database/pool');
const logger = require('./utils/logger');
const kafkaProducer = require('./services/kafka/producer');
const redisClient = require('./services/redis');
const { authenticate, optionalAuth } = require('./middleware/auth');

module.exports = {
  db,
  logger,
  kafkaProducer,
  redisClient,
  authenticate,
  optionalAuth
};