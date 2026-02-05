# Twitter Clone - Distributed Systems Project

## Quick Start Guide

### Step 1: Start Services

```bash
# Start all Docker containers
docker-compose up -d

# Wait for services to initialize (about 60 seconds)
# You can watch logs with:
docker-compose logs -f
```

### Step 2: Initialize Infrastructure

```bash
# Make scripts executable
chmod +x scripts/*.sh

# Initialize Kafka topics
./scripts/init-kafka-topics.sh

# Setup database replication (optional but recommended)
./scripts/setup-replication.sh

# Verify all services are healthy
./scripts/health-check.sh
```

### Step 3: Access the Application

- **Frontend**: Open http://localhost:3000
- **Backend API**: http://localhost:3001
- **API Health**: http://localhost:3001/health

### Step 4: Create Account & Test

1. Register a new account
2. Create some tweets
3. Follow other users
4. Like and interact with tweets

## Architecture Highlights

### Database Partitioning
- Users: Hash partitioned (8 partitions)
- Tweets: Range partitioned (quarterly)

### Replication
- Primary database for writes (port 5432)
- Replica database for reads (port 5433)

### Event Streaming
- Kafka topics for all events
- Avro schema serialization
- Consumer processing in background

### Caching
- Redis for user profiles, timelines
- Automatic invalidation on updates

## Distributed System Concepts

This application demonstrates:

1. **Partitioning** - Data distributed across partitions
2. **Replication** - Read replicas for scalability
3. **Caching** - Multi-layer caching strategy
4. **Event Streaming** - Kafka for async processing
5. **Transactions** - ACID guarantees where needed
6. **Schema Evolution** - Avro schemas

## Monitoring

```bash
# View logs
docker-compose logs -f backend

# Check database replication
docker exec twitter-postgres-primary psql -U erachaudhary -d twitter \
  -c "SELECT * FROM pg_stat_replication;"

# Monitor Kafka topics
docker exec twitter-kafka kafka-consumer-groups \
  --bootstrap-server localhost:9092 --list

# Redis stats
docker exec twitter-redis redis-cli INFO
```

## Troubleshooting

### Reset Everything
```bash
docker-compose down -v
docker-compose up -d
sleep 60
./scripts/init-kafka-topics.sh
./scripts/setup-replication.sh
```

### Check Individual Services
```bash
# Backend logs
docker logs twitter-backend

# Database logs
docker logs twitter-postgres-primary

# Kafka logs
docker logs twitter-kafka
```

### Service Ports
- Frontend: 3000
- Backend: 3001
- Postgres Primary: 5432
- Postgres Replica: 5433
- Redis: 6379
- Kafka: 9092 (internal), 29092 (external)
- Schema Registry: 8081
- Zookeeper: 2181

## Development

### Backend Development
```bash
cd backend
npm install
npm run dev
```

### Frontend Development
```bash
cd frontend
npm install
npm run dev
```

## Key Features

✅ User authentication (JWT)
✅ Create, read, delete tweets
✅ Like/unlike tweets
✅ Follow/unfollow users
✅ Real-time timeline
✅ Trending hashtags
✅ User profiles
✅ Hashtag search

## Technical Stack

- **Backend**: Node.js, Express, PostgreSQL, Redis, Kafka
- **Frontend**: React, Vite, TailwindCSS, React Query
- **Infrastructure**: Docker, Docker Compose
- **Patterns**: Event-driven, CQRS, Cache-aside

## Production Considerations

For production deployment:
- Change JWT_SECRET
- Update database passwords
- Enable SSL/TLS
- Add monitoring (Prometheus/Grafana)
- Configure backups
- Use managed services (RDS, ElastiCache, MSK)
- Set up CI/CD pipeline
- Add rate limiting
- Implement proper error tracking

---

Enjoy exploring distributed systems! 🚀
