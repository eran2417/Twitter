/**
 * Datadog APM Tracer Configuration
 * 
 * This file MUST be imported before any other modules in server.js
 * to ensure all libraries are properly instrumented.
 * 
 * Features:
 * - Automatic instrumentation for Express, PostgreSQL, Redis, Kafka, Elasticsearch
 * - Distributed tracing across microservices
 * - Custom spans for business logic
 * - Error tracking
 * - Runtime metrics
 */

const tracer = require('dd-trace').init({
  // Service identification
  service: process.env.DD_SERVICE || 'twitter-backend',
  env: process.env.DD_ENV || process.env.NODE_ENV || 'development',
  version: process.env.DD_VERSION || '1.0.0',
  
  // Tracing configuration
  enabled: process.env.DD_TRACE_ENABLED !== 'false',
  logInjection: true, // Inject trace IDs into logs
  runtimeMetrics: true, // Collect Node.js runtime metrics
  profiling: true, // Enable continuous profiling
  
  // Sampling - adjust for production
  sampleRate: parseFloat(process.env.DD_TRACE_SAMPLE_RATE) || 1.0,
  
  // Agent connection
  hostname: process.env.DD_AGENT_HOST || 'datadog-agent',
  port: parseInt(process.env.DD_TRACE_AGENT_PORT) || 8126,
  
  // Tags applied to all traces
  tags: {
    'app.type': 'api',
    'app.framework': 'express',
    'app.language': 'nodejs'
  },
  
  // Plugins configuration for auto-instrumentation
  plugins: true
});

// Configure specific integrations
tracer.use('express', {
  service: 'twitter-api',
  headers: ['x-request-id', 'x-correlation-id']
});

tracer.use('pg', {
  service: 'twitter-postgres',
  dbmPropagationMode: 'full'
});

tracer.use('ioredis', {
  service: 'twitter-redis'
});

tracer.use('kafkajs', {
  service: 'twitter-kafka'
});

tracer.use('elasticsearch', {
  service: 'twitter-elasticsearch'
});

tracer.use('http', {
  client: true,
  server: true
});

// Custom span helpers
const createSpan = (operationName, options = {}) => {
  return tracer.startSpan(operationName, {
    childOf: tracer.scope().active(),
    tags: options.tags || {}
  });
};

const wrapAsync = (operationName, fn, tags = {}) => {
  return async (...args) => {
    const span = createSpan(operationName, { tags });
    try {
      const result = await fn(...args);
      span.finish();
      return result;
    } catch (error) {
      span.setTag('error', true);
      span.setTag('error.message', error.message);
      span.setTag('error.stack', error.stack);
      span.finish();
      throw error;
    }
  };
};

// Track custom metrics
const trackMetric = (metricName, value, tags = []) => {
  const metrics = tracer.dogstatsd;
  if (metrics) {
    metrics.gauge(metricName, value, tags);
  }
};

const incrementCounter = (metricName, tags = []) => {
  const metrics = tracer.dogstatsd;
  if (metrics) {
    metrics.increment(metricName, tags);
  }
};

const recordHistogram = (metricName, value, tags = []) => {
  const metrics = tracer.dogstatsd;
  if (metrics) {
    metrics.histogram(metricName, value, tags);
  }
};

module.exports = {
  tracer,
  createSpan,
  wrapAsync,
  trackMetric,
  incrementCounter,
  recordHistogram
};
