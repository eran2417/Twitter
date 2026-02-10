const winston = require('winston');

/**
 * Custom format to inject Datadog trace IDs into logs
 * This enables log correlation with APM traces in Datadog
 */
const datadogFormat = winston.format((info) => {
  // dd-trace automatically injects trace context when DD_LOGS_INJECTION=true
  // This adds additional context for better correlation
  let tracer;
  try {
    tracer = require('dd-trace');
  } catch (e) {
    // dd-trace not available, skip tracing
    return info;
  }
  const span = tracer.scope().active();
  
  if (span) {
    const spanContext = span.context();
    info.dd = {
      trace_id: spanContext.toTraceId(),
      span_id: spanContext.toSpanId(),
      service: process.env.DD_SERVICE || 'twitter-backend',
      env: process.env.DD_ENV || 'development',
      version: process.env.DD_VERSION || '1.0.0'
    };
  }
  
  return info;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    datadogFormat(),
    winston.format.json()
  ),
  defaultMeta: { 
    service: process.env.DD_SERVICE || 'twitter-backend',
    env: process.env.DD_ENV || 'development'
  },
  transports: [
    // Console transport with colors for local development
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production'
        ? winston.format.json() // JSON for Datadog in production
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ level, message, timestamp, dd, ...meta }) => {
              const traceInfo = dd ? ` [trace_id=${dd.trace_id}]` : '';
              return `${timestamp} ${level}${traceInfo}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
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
