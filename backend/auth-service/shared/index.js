const db = require('./database/pool');
const logger = require('./utils/logger');
const kafkaProducer = require('./services/kafka/producer');
const schemaRegistry = require('./schemas/schemaRegistry');
const { authenticate, optionalAuth } = require('./middleware/auth');

module.exports = {
  db,
  logger,
  kafkaProducer,
  schemaRegistry,
  authenticate,
  optionalAuth
};