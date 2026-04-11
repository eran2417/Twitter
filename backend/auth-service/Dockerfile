FROM node:18-alpine

WORKDIR /app

# Copy shared utilities
COPY shared ./shared

# Copy service code
COPY auth-service ./auth-service

# Install shared dependencies
RUN cd shared && npm install --only=production 2>/dev/null || true

# Install service dependencies
RUN cd auth-service && npm install --only=production

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:3002/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Start application
WORKDIR /app/auth-service
CMD ["npm", "start"]
