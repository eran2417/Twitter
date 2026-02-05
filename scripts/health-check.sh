#!/bin/bash

# Health check script for all services

echo "Checking service health..."
echo ""

# Function to check service health
check_service() {
  service_name=$1
  health_command=$2
  
  echo -n "Checking $service_name... "
  if eval $health_command &> /dev/null; then
    echo "✓ Healthy"
    return 0
  else
    echo "✗ Unhealthy"
    return 1
  fi
}

# Check PostgreSQL Primary
check_service "PostgreSQL Primary" \
  "docker exec twitter-postgres-primary pg_isready -U twitter_user"

# Check PostgreSQL Replica
check_service "PostgreSQL Replica" \
  "docker exec twitter-postgres-replica pg_isready -U twitter_user"
# Check Redis
check_service "Redis" \
  "docker exec twitter-redis redis-cli ping | grep -q PONG"

# Check Kafka
check_service "Kafka" \
  "docker exec twitter-kafka kafka-broker-api-versions --bootstrap-server localhost:9092"

# Check Schema Registry
check_service "Schema Registry" \
  "curl -sf http://localhost:8081"

# Check Backend
check_service "Backend API" \
  "curl -sf http://localhost:3001/health"

# Check Frontend
check_service "Frontend" \
  "curl -sf http://localhost:3000"

echo ""
echo "Health check complete!"
