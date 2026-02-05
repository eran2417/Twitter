const avro = require('avsc');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class AvroSchemaRegistry {
  constructor() {
    this.schemas = {};
    this.types = {};
    this.loadSchemas();
  }

  loadSchemas() {
    const schemaDir = path.join(__dirname, 'avro');
    const schemaFiles = fs.readdirSync(schemaDir);

    schemaFiles.forEach(file => {
      if (file.endsWith('.avsc')) {
        const schemaName = file.replace('.avsc', '');
        const schemaPath = path.join(schemaDir, file);
        const schemaJSON = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
        
        this.schemas[schemaName] = schemaJSON;
        this.types[schemaName] = avro.Type.forSchema(schemaJSON);
        
        logger.info(`Loaded Avro schema: ${schemaName}`);
      }
    });
  }

  encode(schemaName, data) {
    const type = this.types[schemaName];
    if (!type) {
      throw new Error(`Schema not found: ${schemaName}`);
    }

    try {
      // Validate data against schema
      if (!type.isValid(data)) {
        const errors = [];
        type.isValid(data, {
          errorHook: (path, any, type) => {
            errors.push({ path, value: any, expectedType: type.toString() });
          }
        });
        throw new Error(`Invalid data for schema ${schemaName}: ${JSON.stringify(errors)}`);
      }

      // Encode to Avro binary format
      return type.toBuffer(data);
    } catch (error) {
      logger.error(`Avro encoding error for ${schemaName}:`, error);
      throw error;
    }
  }

  decode(schemaName, buffer) {
    const type = this.types[schemaName];
    if (!type) {
      throw new Error(`Schema not found: ${schemaName}`);
    }

    try {
      return type.fromBuffer(buffer);
    } catch (error) {
      logger.error(`Avro decoding error for ${schemaName}:`, error);
      throw error;
    }
  }

  getSchema(schemaName) {
    return this.schemas[schemaName];
  }

  getType(schemaName) {
    return this.types[schemaName];
  }

  // Helper to create Kafka message with Avro encoding
  createKafkaMessage(schemaName, data, key) {
    const value = this.encode(schemaName, data);
    
    return {
      key: key ? key.toString() : undefined,
      value,
      headers: {
        'schema-name': schemaName,
        'content-type': 'application/avro'
      }
    };
  }
}

// Singleton instance
const schemaRegistry = new AvroSchemaRegistry();

module.exports = schemaRegistry;
