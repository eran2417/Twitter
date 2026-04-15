
┌─────────────────────────────────────────────────────────────────┐
│                          CHIRPR APP                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   👤 Users can:                                                  │
│      • Register & Login                                          │
│      • Post chirps (280 chars)                                   │
│      • Like & Rechirp                                            │
│      • Follow other users                                        │
│      • Search chirps & users                                     │
│      • View real-time timeline via SSE (Server-Sent Events)      │
│                                                                  │
│   🔧 Behind the scenes:                                          │
│      • Data stored in PostgreSQL (primary + replica)            │
│      • Fast reads via Redis (cache)                             │
│      • Events processed via Kafka (message queue)               │
│      • Search powered by Elasticsearch                          │
│      • Deployed on AWS EC2 with k3s (Kubernetes)               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│                      PROJECT STRUCTURE                               │
└─────────────────────────────────────────────────────────────────────┘

chirpr/
│
├── frontend/                  ← 🎨 React + Vite (served via nginx)
│   ├── Dockerfile             ← Multi-stage build: Node → nginx:alpine
│   ├── nginx.conf             ← SPA fallback, serves static assets
│   └── src/
│       ├── pages/             ← Home, Profile, Search, Login, Register
│       ├── components/        ← TweetCard, Sidebar, ComposeTweet, Trending
│       ├── api/               ← Axios clients for each service
│       └── stores/            ← Zustand global state (auth)
│
├── backend/
│   ├── api-gateway/           ← 🚦 Entry point for all API traffic
│   │   ├── middleware/        ← JWT verification, rate limiting
│   │   └── routes/            ← Proxies to downstream services
│   ├── auth-service/          ← 🔐 Register, login, JWT issuance
│   ├── feed-service/          ← 📰 Chirps, timeline, likes, rechirps
│   ├── user-service/          ← 👤 Profiles, follows
│   ├── search-service/        ← 🔍 Elasticsearch search + reindex
│   ├── notification-service/  ← 🔔 Kafka consumer → notifications
│   └── shared/                ← DB pool, Redis, Kafka, ES clients
│
├── k8s-prod/                  ← ☸️ Kubernetes manifests for AWS
│   ├── shared-config.yaml     ← ConfigMap + Secrets for all services
│   ├── ingress.yaml           ← nginx ingress: /api → gateway, / → frontend
│   └── *-deployment.yaml      ← One per service
│
└── database/
    ├── init-primary.sql       ← Schema: users, tweets, likes, follows
    └── partitioning.sql       ← Quarterly range partitions on tweets


┌─────────────────────────────────────────────────────────────────────┐
│                     MICROSERVICES ARCHITECTURE                       │
└─────────────────────────────────────────────────────────────────────┘

                        chirpwithlove.com
                              │
                              ▼
                    ┌─────────────────┐
                    │  nginx Ingress  │
                    │  /api → gateway │
                    │  /    → frontend│
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   API Gateway   │  ← JWT verify, rate limiting
                    │   (port 3001)   │    proxy to services
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
  │ auth-service│   │ feed-service│   │user-service │
  │  (port 3002)│   │  (port 3004)│   │  (port 3003)│
  └─────────────┘   └─────────────┘   └─────────────┘
         ▼                   ▼
  ┌─────────────┐   ┌─────────────────┐
  │search-service   │notification-svc │
  │  (port 3005)│   │  (port 3006)    │
  └─────────────┘   └─────────────────┘
         │                   │
         ▼                   ▼
  ┌─────────────────────────────────────┐
  │           Shared Infrastructure      │
  │                                      │
  │  ┌──────────┐  ┌──────────────────┐  │
  │  │ Postgres │  │ Postgres Replica │  │
  │  │ Primary  │  │  (read-only)     │  │
  │  └──────────┘  └──────────────────┘  │
  │  ┌──────────┐  ┌──────────────────┐  │
  │  │  Redis   │  │  Elasticsearch   │  │
  │  │  Cache   │  │  + Kibana        │  │
  │  └──────────┘  └──────────────────┘  │
  │  ┌──────────┐  ┌──────────────────┐  │
  │  │  Kafka   │  │   Zookeeper      │  │
  │  └──────────┘  └──────────────────┘  │
  └─────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│                     AWS DEPLOYMENT (k3s on EC2)                      │
└─────────────────────────────────────────────────────────────────────┘

  Internet
     │
     ▼
┌────────────────────────────────────────────────────────────────┐
│  EC2 t3.medium (4GB RAM, 2 vCPU) — ~$65/month                  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  k3s Kubernetes Cluster                   │   │
│  │                                                           │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │   │
│  │  │ frontend │ │ api-gtwy │ │  auth    │ │  feed    │    │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │   │
│  │  │  user    │ │ search   │ │  notify  │ │ postgres │    │   │
│  │  └──────────┘ └──────────┘ └──────────┘ │ primary  │    │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ └──────────┘    │   │
│  │  │ postgres │ │  redis   │ │  kafka   │ ┌──────────┐    │   │
│  │  │ replica  │ └──────────┘ └──────────┘ │zookeeper │    │   │
│  │  └──────────┘ ┌──────────┐              └──────────┘    │   │
│  │               │ elastic  │                               │   │
│  │               └──────────┘                               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Images: public.ecr.aws/j8v9z0p1/twitter-{service}:latest       │
└────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│                       API GATEWAY FLOW                               │
└─────────────────────────────────────────────────────────────────────┘

Request from chirpwithlove.com
        │
        ▼
┌───────────────┐
│  helmet()     │  ← Security headers
└───────┬───────┘
        ▼
┌───────────────┐
│  cors()       │  ← Only allows chirpwithlove.com
└───────┬───────┘
        ▼
┌───────────────┐
│ authLimiter() │  ← IP-based: 10 attempts / 15 min (auth routes only)
└───────┬───────┘
        ▼
┌───────────────┐
│ verifyJwt()   │  ← Validates Bearer token, attaches req.user
└───────┬───────┘
        ▼
┌───────────────┐
│tweetLimiter() │  ← Redis-backed: 10 chirps / hour per user
└───────┬───────┘
        ▼
┌───────────────┐
│ proxy to svc  │  ← Forwards with X-User-Id, X-User-Username headers
└───────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│                    POSTING A CHIRP - FULL FLOW                       │
└─────────────────────────────────────────────────────────────────────┘

1️⃣  USER ACTION
┌──────────────┐
│   Browser    │  User types "Hello!" and clicks Chirp
│   (React)    │
└──────┬───────┘
       │  POST chirpwithlove.com/api/v1/tweets
       │  { "content": "Hello!" }
       │  Headers: { Authorization: "Bearer eyJhbG..." }
       ▼

2️⃣  API GATEWAY
┌──────────────┐
│ API Gateway  │  Verifies JWT → proxies with X-User-Id header
└──────┬───────┘
       ▼

3️⃣  FEED SERVICE
┌──────────────────────────────────────────────────────┐
│  a. INSERT INTO tweets (user_id, content)            │
│  b. UPDATE reply_count if it's a reply               │
│  c. Check if hot user (follower_count >= 5000)       │
│                                                      │
│  If NOT hot user:                                    │
│    Fan-out to followers' Redis caches (push)         │
│  If hot user:                                        │
│    Skip fan-out, followers pull on next request      │
│                                                      │
│  d. Invalidate creator's timeline + feed cache       │
│  e. Publish tweet.created event to Kafka             │
└──────┬───────────────────────────────────────────────┘
       │
       ▼

4️⃣  KAFKA (async - user doesn't wait)
┌──────────────────────────────────────────┐
│  Topic: "tweets"                         │
│  Event: { type: "tweet.created", ... }   │
└───────┬──────────────────────────────────┘
        │
   ┌────┴────────────────────┐
   ▼                         ▼
┌──────────────┐    ┌──────────────────┐
│ Search       │    │ Notification     │
│ Indexing     │    │ Consumer         │
│ Consumer     │    │                  │
│              │    │ Notifies         │
│ Indexes chirp│    │ mentioned users  │
│ in ES        │    │ & followers      │
└──────────────┘    └──────────────────┘

5️⃣  RESPONSE
┌──────────────┐
│   Browser    │◄──── 201 Created { id, content, ... }
│   (React)    │
└──────────────┘
  React prepends chirp to feed instantly via SSE 🎉


┌─────────────────────────────────────────────────────────────────────┐
│                    HYBRID FEED DELIVERY STRATEGY                     │
└─────────────────────────────────────────────────────────────────────┘

REGULAR USER (< 5000 followers) — Fan-out on Write:

  User posts chirp
        │
        ▼
  For each follower:
    Read their Redis feed cache
    Prepend new chirp
    Write back to cache
        │
        ▼
  Follower opens app → feed loaded from Redis instantly ⚡


HOT USER (≥ 5000 followers) — Pull on Read:

  Hot user posts chirp → saved to DB only (no fan-out)
                                    │
  Follower opens app                │
        │                           │
        ▼                           │
  Load feed from DB ◄───────────────┘
  (merges hot user's tweets at read time)
  Cache result with TTL


WHY?
  Fan-out to 5000+ followers on every post = O(n) writes = too slow
  Pull-based for hot users = O(1) write, slightly slower read = worth it


┌─────────────────────────────────────────────────────────────────────┐
│                    POSTGRESQL REPLICATION                            │
└─────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────┐         ┌──────────────────────┐
  │  postgres-primary   │────────►│  postgres-replica    │
  │                     │ stream  │                      │
  │  Writes (INSERT,    │  WAL    │  Reads (SELECT)      │
  │  UPDATE, DELETE)    │         │  (read-only)         │
  └─────────────────────┘         └──────────────────────┘
           ▲                               ▲
           │                               │
     DB client routes                DB client routes
     write queries here             read queries here


Replication lag: ~0ms (confirmed: sent_lsn = replay_lsn)


┌─────────────────────────────────────────────────────────────────────┐
│                         CACHE-ASIDE PATTERN                          │
└─────────────────────────────────────────────────────────────────────┘

READING FEED:

User requests timeline
        │
        ▼
┌───────────────────┐
│  1. Check Redis   │───── Cache HIT? ─────► Return feed (< 1ms)
│  feed:{userId}    │
└───────────────────┘
        │ Cache MISS
        ▼
┌───────────────────┐   ┌───────────────────┐
│ 2. Query Postgres │──►│ 3. Store in Redis │
│    replica        │   │    with TTL       │
└───────────────────┘   └───────────────────┘
        │
        ▼
  Return feed

Speed comparison:
┌─────────────────────────────────────────────────────────────┐
│ Redis (RAM)      : ~0.5 ms  ████                            │
│ PostgreSQL (Disk): ~5-50 ms ████████████████████████████████│
└─────────────────────────────────────────────────────────────┘
                    Redis is 10-100x faster!


┌─────────────────────────────────────────────────────────────────────┐
│                    ELASTICSEARCH SEARCH PIPELINE                     │
└─────────────────────────────────────────────────────────────────────┘

NEW CHIRP CREATED
        │
        ▼
  Kafka tweet.created event
        │
        ▼
  searchIndexingConsumer
        │
        ▼
  ES index: tweets
  {
    content: "Hello!",
    username: "era2417",
    display_name: "Era",
    created_at: "2026-04-14T...",
    hashtags: [],
    mentions: []
  }
        │
        ▼
  Available in search instantly ⚡

SEARCH QUERY:
  multi_match on content^3, username^2, display_name
  + term match on hashtags and mentions
  + edge_ngram autocomplete on username
  + fuzzy matching for typo tolerance
  + sort by relevance or recent


┌─────────────────────────────────────────────────────────────────────┐
│                         WEBSOCKET FLOW                               │
└─────────────────────────────────────────────────────────────────────┘

User opens chirpwithlove.com
        │
        ▼
  Browser opens SSE connection: GET /api/v1/timeline/stream?token=JWT
        │
        ▼
  Server verifies JWT → subscribes to Redis channel sse:feed:{userId}
        │
        ▼
  When someone they follow posts a chirp:
  Fan-out publishes to Redis → SSE pushes event to browser
        │
        ▼
  React prepends new chirp to feed without refresh 🔄
  (falls back to 30s polling if SSE disconnects)


HOT USER FOLLOW:
  When user follows a hot user (≥5000 followers)
  → Does NOT join their room (pull-based strategy)
  → Feed refreshes on next page load instead


┌─────────────────────────────────────────────────────────────────────┐
│                       DATABASE TABLES                                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ USERS TABLE                                                          │
├──────────────────┬───────────────┬──────────────────────────────────┤
│ id               │ BIGSERIAL     │ Unique ID (auto-generated)       │
│ username         │ VARCHAR(15)   │ @handle (unique)                 │
│ email            │ VARCHAR(254)  │ Email address (unique)           │
│ password_hash    │ VARCHAR(255)  │ bcrypt hashed password           │
│ display_name     │ VARCHAR(50)   │ Shown name                       │
│ bio              │ TEXT          │ Profile description              │
│ follower_count   │ INTEGER       │ Cached follower count            │
│ following_count  │ INTEGER       │ Cached following count           │
│ tweet_count      │ INTEGER       │ Total chirps                     │
│ created_at       │ TIMESTAMP     │ When account was created         │
└──────────────────┴───────────────┴──────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ TWEETS TABLE (range partitioned by created_at, quarterly)           │
├──────────────────┬───────────────┬──────────────────────────────────┤
│ id               │ BIGSERIAL     │ Unique chirp ID                  │
│ user_id          │ BIGINT        │ Who posted it (→ users.id)       │
│ content          │ TEXT          │ Chirp text (max 280 chars)       │
│ reply_to_tweet_id│ BIGINT        │ Parent chirp if reply            │
│ media_urls       │ TEXT[]        │ Attached media                   │
│ hashtags         │ TEXT[]        │ Extracted hashtags               │
│ mentions         │ TEXT[]        │ Extracted @mentions              │
│ like_count       │ INTEGER       │ Cached like count                │
│ retweet_count    │ INTEGER       │ Cached rechirp count             │
│ reply_count      │ INTEGER       │ Cached reply count               │
│ created_at       │ TIMESTAMP     │ Partition key                    │
└──────────────────┴───────────────┴──────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ FOLLOWS TABLE                                                        │
├──────────────────┬───────────────┬──────────────────────────────────┤
│ follower_id      │ BIGINT        │ Who is following (→ users.id)    │
│ following_id     │ BIGINT        │ Who is being followed            │
│ created_at       │ TIMESTAMP     │ When follow happened             │
└──────────────────┴───────────────┴──────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ LIKES / RETWEETS / NOTIFICATIONS tables follow same pattern         │
└─────────────────────────────────────────────────────────────────────┘


WITHOUT PARTITIONING:
┌─────────────────────────────────────────────────────────────────┐
│                    tweets (1 BILLION rows)                       │
│  All chirps from 2024-2026 in ONE HUGE table                    │
│  Query: "Get today's chirps" → Must scan EVERYTHING             │
└─────────────────────────────────────────────────────────────────┘

WITH PARTITIONING (by quarter):
┌─────────────────────────────────────────────────────────────────┐
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ 2024_Q1  │  │ 2024_Q2  │  │ 2025_Q1  │  │ 2025_Q2  │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│  ┌──────────┐  ┌──────────┐                                     │
│  │ 2026_Q1  │  │ 2026_Q2  │  ← Query for Apr 2026 only         │
│  │ Jan-Mar  │  │ Apr-Jun  │    scans this ONE partition!       │
│  └──────────┘  └──────────┘                                     │
└─────────────────────────────────────────────────────────────────┘


WITHOUT KAFKA (Synchronous):
┌──────────┐                          ┌──────────┐
│  User    │───── Post Chirp ────────►│  Backend │
│  waits   │                          │          │
│   ...    │                          │ 1. Save to DB       (50ms)
│   ...    │                          │ 2. Index in ES      (100ms)
│   ...    │                          │ 3. Send notifs      (200ms)
│   ...    │◄───── Response (350ms) ──│          │
└──────────┘                          └──────────┘

WITH KAFKA (Asynchronous):
┌──────────┐                          ┌──────────┐
│  User    │───── Post Chirp ────────►│  Backend │
│          │◄───── Response (50ms) ───│ 1. Save to DB
│          │                          │ 2. Publish to Kafka
└──────────┘                          └──────────┘
     User gets response in 50ms! 🚀        │
                                          ▼
                                    ┌──────────┐
                                    │  KAFKA   │
                                    └────┬─────┘
                    ┌────────────────────┤
                    ▼                    ▼
             ┌──────────┐         ┌──────────┐
             │  Search  │         │  Notify  │
             │ Indexing │         │ Consumer │
             │ Consumer │         │          │
             └──────────┘         └──────────┘
             Runs in background — user doesn't wait!
