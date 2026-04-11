const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { 
    service: process.env.SERVICE_NAME || 'twitter-backend',
    env: process.env.NODE_ENV || 'development'
  },
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production'
        ? winston.format.json()
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ level, message, timestamp, ...meta }) => {
              return `${timestamp} ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
            })
          )
    })
  ]
});

// Log levels reference:
// error: 0 - Errors that need immediate attention
// warn: 1 - Warning conditions
// info: 2 - General operational information
// http: 3 - HTTP request logging
// verbose: 4 - More detailed information
// debug: 5 - Debug-level messages
// silly: 6 - Most detailed logging

module.exports = logger;
