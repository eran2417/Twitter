#!/bin/bash

# Initialize Kafka topics with proper configuration

echo "Initializing Kafka topics..."

# Wait for Kafka to be ready
echo "Waiting for Kafka..."
until docker exec twitter-kafka kafka-topics --bootstrap-server localhost:9092 --list &> /dev/null; do
  sleep 2
done

echo "Kafka is ready"

# Create topics with specific configurations
# Tweets topic - high throughput, longer retention
docker exec twitter-kafka kafka-topics --create \
  --bootstrap-server localhost:9092 \
  --topic tweets \
  --partitions 3 \
  --replication-factor 1 \
  --config retention.ms=604800000 \
  --config segment.ms=86400000 \
  --config compression.type=snappy \
  --if-not-exists

# Tweet interactions - high volume
docker exec twitter-kafka kafka-topics --create \
  --bootstrap-server localhost:9092 \
  --topic tweet-interactions \
  --partitions 5 \
  --replication-factor 1 \
  --config retention.ms=259200000 \
  --config compression.type=snappy \
  --if-not-exists

# User interactions
docker exec twitter-kafka kafka-topics --create \
  --bootstrap-server localhost:9092 \
  --topic user-interactions \
  --partitions 3 \
  --replication-factor 1 \
  --config retention.ms=259200000 \
  --config compression.type=snappy \
  --if-not-exists

# User events
docker exec twitter-kafka kafka-topics --create \
  --bootstrap-server localhost:9092 \
  --topic user-events \
  --partitions 2 \
  --replication-factor 1 \
  --config retention.ms=604800000 \
  --if-not-exists

echo "Kafka topics created successfully"

# List all topics
echo "Current topics:"
docker exec twitter-kafka kafka-topics --bootstrap-server localhost:9092 --list

# Show topic details
echo ""
echo "Topic details:"
docker exec twitter-kafka kafka-topics --bootstrap-server localhost:9092 --describe
