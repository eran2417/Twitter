const { SchemaRegistry, SchemaType } = require('@kafkajs/confluent-schema-registry');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Schema Registry Client
 * Connects to Confluent Schema Registry for Avro schema management
 * 
 * Why use Schema Registry?
 * 1. Schema Evolution: Manages schema versions and compatibility
 * 2. Centralized Storage: Single source of truth for all schemas
 * 3. Automatic Validation: Ensures data matches registered schema
 * 4. Efficiency: Schema ID (4 bytes) instead of full schema in each message
 */
class AvroSchemaRegistry {
  constructor() {
    this.registry = null;
    this.schemaIds = {}; // Cache: schemaName -> schemaId
    this.localSchemas = {}; // Local .avsc files for registration
    this.isConnected = false;
  }

  /**
   * Initialize connection to Schema Registry
   */
  async connect() {
    try {
      const registryUrl = process.env.SCHEMA_REGISTRY_URL || 'http://localhost:8081';
      
      this.registry = new SchemaRegistry({
        host: registryUrl
      });

      // Load local schemas from .avsc files
      await this.loadLocalSchemas();
      
      // Register schemas with Schema Registry
      await this.registerSchemas();
      
      this.isConnected = true;
      logger.info(`Connected to Schema Registry at ${registryUrl}`);
    } catch (error) {
      logger.error('Failed to connect to Schema Registry:', error);
      throw error;
    }
  }

  /**
   * Load Avro schemas from local .avsc files
   */
  async loadLocalSchemas() {
    const schemaDir = path.join(__dirname, 'avro');
    
    if (!fs.existsSync(schemaDir)) {
      logger.warn('Avro schema directory not found');
      return;
    }

    const schemaFiles = fs.readdirSync(schemaDir);

    for (const file of schemaFiles) {
      if (file.endsWith('.avsc')) {
        const schemaName = file.replace('.avsc', '');
        const schemaPath = path.join(schemaDir, file);
        const schemaJSON = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
        
        this.localSchemas[schemaName] = schemaJSON;
        logger.info(`Loaded local Avro schema: ${schemaName}`);
      }
    }
  }

  /**
   * Register all local schemas with Schema Registry
   * Uses subject naming: <topic>-value (e.g., tweets-value)
   */
  async registerSchemas() {
    // Map schema names to Kafka topics/subjects
    const schemaToSubject = {
      'tweet-created': 'tweets-value',
      'tweet-interaction': 'tweet-interactions-value',
      'user-registered': 'user-events-value',
      'user-followed': 'user-interactions-value'
    };

    for (const [schemaName, subject] of Object.entries(schemaToSubject)) {
      const schema = this.localSchemas[schemaName];
      if (!schema) {
        logger.warn(`Schema ${schemaName} not found locally`);
        continue;
      }

      try {
        // Register schema and get its ID
        const { id } = await this.registry.register({
          type: SchemaType.AVRO,
          schema: JSON.stringify(schema)
        }, { subject });

        this.schemaIds[schemaName] = id;
        logger.info(`Registered schema ${schemaName} with ID ${id} for subject ${subject}`);
      } catch (error) {
        // Schema might already exist with same definition
        if (error.message && error.message.includes('already registered')) {
          logger.info(`Schema ${schemaName} already registered`);
          // Get existing schema ID
          const existingId = await this.getSchemaIdBySubject(subject);
          this.schemaIds[schemaName] = existingId;
        } else {
          logger.error(`Failed to register schema ${schemaName}:`, error);
        }
      }
    }
  }

  /**
   * Get schema ID by subject name
   */
  async getSchemaIdBySubject(subject) {
    try {
      const latestSchema = await this.registry.getLatestSchemaId(subject);
      return latestSchema;
    } catch (error) {
      logger.error(`Failed to get schema ID for subject ${subject}:`, error);
      throw error;
    }
  }

  /**
   * Encode data using Schema Registry
   * The encoded message includes a magic byte + schema ID prefix
   * Format: [0x00][4-byte schema ID][Avro binary data]
   */
  async encode(schemaName, data) {
    if (!this.isConnected) {
      await this.connect();
    }

    const schemaId = this.schemaIds[schemaName];
    if (!schemaId) {
      throw new Error(`Schema not registered: ${schemaName}. Available: ${Object.keys(this.schemaIds).join(', ')}`);
    }

    try {
      // Encode data with schema ID prefix
      const encodedValue = await this.registry.encode(schemaId, data);
      return encodedValue;
    } catch (error) {
      logger.error(`Encoding error for schema ${schemaName}:`, error);
      throw error;
    }
  }

  /**
   * Decode Avro message using Schema Registry
   * Automatically reads schema ID from message prefix
   */
  async decode(buffer) {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      // Registry automatically extracts schema ID from the message
      const decodedValue = await this.registry.decode(buffer);
      return decodedValue;
    } catch (error) {
      logger.error('Decoding error:', error);
      throw error;
    }
  }

  /**
   * Get a registered schema by ID
   */
  async getSchemaById(id) {
    try {
      return await this.registry.getSchema(id);
    } catch (error) {
      logger.error(`Failed to get schema by ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Check schema compatibility before updates
   */
  async checkCompatibility(schemaName, newSchema) {
    const schemaToSubject = {
      'tweet-created': 'tweets-value',
      'tweet-interaction': 'tweet-interactions-value',
      'user-registered': 'user-events-value',
      'user-followed': 'user-interactions-value'
    };

    const subject = schemaToSubject[schemaName];
    if (!subject) {
      throw new Error(`Unknown schema: ${schemaName}`);
    }

    try {
      const isCompatible = await this.registry.testCompatibility({
        type: SchemaType.AVRO,
        schema: JSON.stringify(newSchema)
      }, { subject });

      return isCompatible;
    } catch (error) {
      logger.error(`Compatibility check failed for ${schemaName}:`, error);
      throw error;
    }
  }

  /**
   * Create a Kafka message with Avro encoding via Schema Registry
   */
  async createKafkaMessage(schemaName, data, key) {
    const value = await this.encode(schemaName, data);
    
    return {
      key: key ? key.toString() : undefined,
      value,
      headers: {
        'content-type': 'application/avro'
      }
    };
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.isConnected,
      registeredSchemas: Object.keys(this.schemaIds),
      schemaIds: this.schemaIds
    };
  }
}

// Singleton instance
const schemaRegistry = new AvroSchemaRegistry();

module.exports = schemaRegistry;
