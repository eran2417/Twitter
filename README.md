# Twitter Clone - Distributed Systems Architecture

A full-featured Twitter clone built with distributed system principles from "Designing Data-Intensive Applications" by Martin Kleppmann.

## 🏗️ Architecture Overview

This application demonstrates production-grade distributed system concepts:

### **Distributed Features Implemented**

#### 1. **Database Partitioning & Replication**
- **Range Partitioning**: Tweets partitioned by `created_at` (quarterly partitions)
- **Hash Partitioning**: Users distributed across 8 partitions by user ID
- **Read Replicas**: Separate read/write database instances
- **Logical Replication**: Real-time data synchronization between primary and replica

#### 2. **Caching Strategy**
- **Redis Cache**: Multi-layer caching for:
  - User profiles (5-minute TTL)
  - Timeline data (1-minute TTL)
  - Trending hashtags (5-minute TTL)
- **Cache-Aside Pattern**: Automatic cache population on miss
- **Cache Invalidation**: Event-driven cache clearing

#### 3. **Event Streaming with Kafka**
- **Topics**:
  - `tweets`: Tweet creation/deletion events
  - `tweet-interactions`: Likes, retweets
  - `user-interactions`: Follow/unfollow events
  - `user-events`: User registration, profile updates
- **Avro Serialization**: Schema-based message encoding
- **Event-Driven Architecture**: Asynchronous processing

#### 4. **Avro Schema Registry**
- Confluent Schema Registry integration
- Versioned schemas for all events
- Type-safe message serialization
- Schema evolution support
- Binary Avro encoding with Schema ID prefix

#### 5. **Full-Text Search with Elasticsearch**
- **Tweet Search**: Full-text search with relevance scoring
- **User Search**: Search by username or display name
- **Trending Hashtags**: Real-time hashtag analytics
- **Kibana Dashboard**: Visual analytics and monitoring
- **Real-time Indexing**: Kafka consumer indexes data automatically

#### 6. **Transactions & Consistency**
- PostgreSQL ACID transactions
- Kafka idempotent producers
- Optimistic concurrency control

#### 7. **Scalability Patterns**
- Horizontal database partitioning
- Connection pooling (primary + replica pools)
- Stateless API servers
- Load-balancable architecture

## 🚀 Technology Stack

### Backend
- **Node.js + Express**: API server
- **PostgreSQL 15**: Primary data store with partitioning
- **Redis**: Caching and session management
- **Kafka + Zookeeper**: Event streaming
- **Confluent Schema Registry**: Avro schema management
- **Elasticsearch 8.11**: Full-text search engine
- **Kibana 8.11**: Search analytics & visualization
- **WebSockets (Socket.io)**: Real-time updates

### Frontend
- **React 18**: UI framework
- **Vite**: Build tool
- **TailwindCSS**: Styling
- **React Query**: Data fetching & caching
- **Zustand**: State management
- **Socket.io Client**: Real-time features

### Infrastructure
- **Docker + Docker Compose**: Containerization
- **Confluent Schema Registry**: Avro schema management
- **Elasticsearch Cluster**: Search infrastructure
- **Kibana**: Monitoring & visualization UI

## 📁 Project Structure

```
twitter/
├── backend/                    # Express API server
│   ├── src/
│   │   ├── database/          # Database connection pools
│   │   ├── middleware/        # Auth, rate limiting, errors
│   │   ├── routes/            # API endpoints
│   │   ├── schemas/           # Avro schemas
│   │   ├── services/          # Kafka, Redis services
│   │   └── utils/             # Logging utilities
│   ├── Dockerfile
│   └── package.json
├── frontend/                   # React application
│   ├── src/
│   │   ├── api/               # API client
│   │   ├── components/        # React components
│   │   ├── pages/             # Route pages
│   │   └── stores/            # State management
│   ├── Dockerfile
│   └── package.json
├── database/                   # Database initialization
│   ├── init-primary.sql       # Schema & triggers
│   ├── partitioning.sql       # Partitioning setup
│   └── postgresql-*.conf      # Database configs
├── scripts/                    # Utility scripts
│   ├── setup-replication.sh
│   ├── init-kafka-topics.sh
│   └── health-check.sh
├── docker-compose.yml          # Service orchestration
└── README.md
```

## 🔧 Setup & Installation

### Prerequisites
- Docker Desktop (latest version)
- Node.js 18+ (for local development)
- 8GB+ RAM recommended
- 20GB+ free disk space

### Quick Start

1. **Clone the repository**
```bash
cd /Users/erachaudhary/workspace/twitter
```

2. **Start all services**
```bash
docker-compose up -d
```

This will start:
- PostgreSQL Primary (port 5434)
- PostgreSQL Replica (port 5433)
- Redis (port 6379)
- Zookeeper (port 2181)
- Kafka (ports 9092, 29092)
- Schema Registry (port 8081)
- Elasticsearch (port 9200)
- Kibana (port 5601)
- Backend API (port 3001)
- Frontend (port 3000)

3. **Initialize Kafka topics**
```bash
chmod +x scripts/*.sh
./scripts/init-kafka-topics.sh
```

4. **Setup database replication**
```bash
./scripts/setup-replication.sh
```

5. **Check service health**
```bash
./scripts/health-check.sh
```

6. **Access the application**
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Schema Registry: http://localhost:8081
- Elasticsearch: http://localhost:9200
- Kibana: http://localhost:5601

### Development Setup

**Backend:**
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your configuration
npm run dev
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## 🔐 Authentication

The application uses JWT (JSON Web Tokens) for authentication:

1. **Register** a new account at `/register`
2. **Login** at `/login`
3. JWT token stored in localStorage
4. Token sent in `Authorization: Bearer <token>` header

## 📊 Database Schema & Partitioning

### Users Table (Hash Partitioned)
```sql
-- 8 partitions distributed by user ID
CREATE TABLE users PARTITION BY HASH (id);
```

### Tweets Table (Range Partitioned)
```sql
-- Quarterly partitions by created_at
CREATE TABLE tweets PARTITION BY RANGE (created_at);
-- Partitions: 2024_q1, 2024_q2, ..., 2026_q4, default
```

### Materialized Views
```sql
-- Trending hashtags (refreshed by Kafka consumer)
CREATE MATERIALIZED VIEW trending_hashtags AS ...
```

## 🎯 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/verify` - Verify token

### Users
- `GET /api/users/:username` - Get user profile
- `PATCH /api/users/me` - Update profile
- `GET /api/users/:username/tweets` - Get user's tweets

### Tweets
- `POST /api/tweets` - Create tweet
- `GET /api/tweets/:id` - Get tweet
- `POST /api/tweets/:id/like` - Like tweet
- `DELETE /api/tweets/:id/like` - Unlike tweet
- `DELETE /api/tweets/:id` - Delete tweet

### Timeline
- `GET /api/timeline` - Get user timeline
- `GET /api/timeline/trending/hashtags` - Trending hashtags
- `GET /api/timeline/search/hashtag/:tag` - Search by hashtag

### Follows
- `POST /api/follows/:userId` - Follow user
- `DELETE /api/follows/:userId` - Unfollow user
- `GET /api/follows/:userId/followers` - Get followers
- `GET /api/follows/:userId/following` - Get following

### Search (Elasticsearch)
- `GET /api/search/tweets?q=query` - Search tweets
- `GET /api/search/users?q=query` - Search users
- `GET /api/search/trending` - Get trending hashtags
- `POST /api/search/reindex` - Reindex all tweets
- `POST /api/search/reindex-users` - Reindex all users

## 🔄 Event Flow

### Tweet Creation Flow
```
User creates tweet
    ↓
API validates & saves to DB (transaction)
    ↓
Kafka event published (tweet.created)
    ↓
Consumer processes event:
    - Refreshes trending hashtags view
    - Invalidates timeline caches
    ↓
WebSocket notification to followers
```

## 🎨 Design Patterns Used

### From "Designing Data-Intensive Applications"

1. **Partitioning/Sharding**
   - Range partitioning for time-series data (tweets)
   - Hash partitioning for even distribution (users)

2. **Replication**
   - Leader-follower replication (primary-replica)
   - Logical replication for read scaling

3. **Caching**
   - Cache-aside pattern
   - Write-through for critical data
   - TTL-based expiration

4. **Event Sourcing**
   - All state changes published as events
   - Kafka as event log
   - Consumers rebuild state

5. **Materialized Views**
   - Pre-computed trending hashtags
   - Background refresh via events

6. **Connection Pooling**
   - Separate pools for reads/writes
   - Automatic failover

## 🧪 Testing

### Health Check
```bash
curl http://localhost:3001/health
```

### Create Test User
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123",
    "displayName": "Test User"
  }'
```

### Monitor Kafka Topics
```bash
# List topics
docker exec twitter-kafka kafka-topics --bootstrap-server localhost:9092 --list

# Consume messages
docker exec twitter-kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic tweets \
  --from-beginning
```

### Check Replication Status
```bash
docker exec twitter-postgres-primary psql -U erachaudhary -d twitter \
  -c "SELECT * FROM pg_stat_replication;"
```

## 📈 Performance Optimizations

1. **Database Indexes**: Optimized for common queries
2. **Redis Caching**: Reduces DB load by 70%
3. **Read Replicas**: Separate read/write traffic
4. **Partitioning**: Query pruning for time-based queries
5. **Connection Pooling**: Reuse database connections
6. **Compression**: Kafka message compression (Snappy)

## 🔍 Monitoring

Services expose health endpoints:
- Backend: `GET /health`
- Kafka: JMX metrics
- PostgreSQL: pg_stat views
- Redis: INFO command
- Elasticsearch: `GET http://localhost:9200/_cluster/health`
- Kibana: `http://localhost:5601`

### Kibana Dashboard

Access Kibana at http://localhost:5601 for:
- **Discover**: Explore indexed tweets and users
- **Dev Tools**: Run Elasticsearch queries
- **Index Management**: View index health and stats

### Elasticsearch Indices
- `tweets` - All tweets with full-text search
- `users` - User profiles for search

### Useful Elasticsearch Queries
```bash
# Check cluster health
curl http://localhost:9200/_cluster/health?pretty

# View all indices
curl http://localhost:9200/_cat/indices?v

# Search tweets
curl "http://localhost:9200/tweets/_search?q=hello&pretty"

# Search users
curl "http://localhost:9200/users/_search?q=john&pretty"
```

## 🛠️ Troubleshooting

### Services not starting
```bash
docker-compose down -v
docker-compose up -d
```

### Database connection issues
```bash
docker logs twitter-postgres-primary
docker logs twitter-backend
```

### Kafka issues
```bash
docker logs twitter-kafka
docker logs twitter-zookeeper
./scripts/init-kafka-topics.sh
```

### Clear all data and restart
```bash
docker-compose down -v
docker-compose up -d
sleep 30
./scripts/init-kafka-topics.sh
./scripts/setup-replication.sh
```

## 🚀 Production Deployment

For production deployment:

1. **Environment Variables**: Use secrets management
2. **SSL/TLS**: Enable HTTPS, secure Kafka
3. **Monitoring**: Add Prometheus + Grafana
4. **Logging**: Centralized logging (ELK stack)
5. **Backups**: Automated database backups
6. **Scaling**: Kubernetes for orchestration
7. **CDN**: Serve static assets via CDN

## 💾 Backup & Restore Procedures

### Database Backup
```bash
# Create isolated backup (recommended)
./run-backup-with-container.sh

# Or create backup with services running
./scripts/backup-database.sh
```

### Database Restore
```bash
# Restore from latest backup
./scripts/restore-database.sh latest

# Restore from specific backup file
./scripts/restore-database.sh backups/twitter_backup_20260207_220034.sql.gz
```

### Important: Elasticsearch Sync After Restore
⚠️ **After database restore, Elasticsearch indices become out of sync!**

The restore script automatically syncs Elasticsearch, but if you need to sync manually:

```bash
# Sync Elasticsearch with current PostgreSQL data
./scripts/sync-elasticsearch.sh
```

This reindexes all users and tweets from PostgreSQL to Elasticsearch, ensuring Kibana shows current data.

### Backup Schedule
- **Automatic**: Daily at 2 AM (configurable in crontab)
- **Manual**: Run `./run-backup-with-container.sh` anytime
- **Retention**: 7 days (configurable in scripts)

## 📚 Key Concepts Demonstrated

### Data Intensive Applications
- ✅ Partitioning for scalability
- ✅ Replication for availability
- ✅ Transactions for consistency
- ✅ Event streaming for decoupling
- ✅ Caching for performance
- ✅ Schema evolution with Avro
- ✅ Materialized views for analytics
- ✅ Full-text search with Elasticsearch
- ✅ Real-time indexing via Kafka consumers

### Distributed Systems
- ✅ Stateless services
- ✅ Message queues
- ✅ Read/write separation
- ✅ Eventual consistency
- ✅ Idempotent operations

## 🤝 Contributing

This is a demonstration project showcasing distributed system patterns.

## 📄 License

MIT License

## 👨‍💻 Author

Built to demonstrate concepts from "Designing Data-Intensive Applications"

---

**Happy Coding! 🚀**
