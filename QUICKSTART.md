# Chirpr — Quick Start

## Local Kubernetes (Docker Desktop)

### Prerequisites
- Docker Desktop with Kubernetes enabled
- kubectl

### Step 1 — Set kubectl context
```bash
kubectl config use-context docker-desktop
```

### Step 2 — Install nginx ingress controller (one-time)
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml
```
Wait ~30 seconds for it to start:
```bash
kubectl get pods -n ingress-nginx
```

### Step 3 — Build local images
```bash
# Build all backend services
docker build -t twitter-auth-service:latest ./backend -f backend/auth-service/Dockerfile
docker build -t twitter-feed-service:latest ./backend -f backend/feed-service/Dockerfile
docker build -t twitter-user-service:latest ./backend -f backend/user-service/Dockerfile
docker build -t twitter-search-service:latest ./backend -f backend/search-service/Dockerfile
docker build -t twitter-notification-service:latest ./backend -f backend/notification-service/Dockerfile
docker build -t twitter-api-gateway:latest ./backend -f backend/api-gateway/Dockerfile

# Build frontend — VITE_API_URL must be passed at build time (overrides .env which defaults to localhost:3001)
# For local k8s use http://localhost (nginx ingress on port 80)
docker build \
  --build-arg VITE_API_URL=http://localhost \
  --build-arg VITE_WS_URL=ws://localhost \
  -t twitter-frontend:latest ./frontend
```

### Step 4 — Apply k8s configs
```bash
kubectl apply -f k8s/
```

### Step 5 — Initialize database schema
```bash
kubectl exec -i postgres-primary-0 -- psql -U twitter_user -d twitter < database/init-primary.sql
```

### Step 6 — Access the app
- **Frontend**: http://localhost
- **API**: http://localhost/api

### Start / Stop
```bash
# Stop all pods (data preserved)
kubectl scale deployment --all --replicas=0
kubectl scale statefulset --all --replicas=0

# Start all pods
kubectl scale deployment --all --replicas=1
kubectl scale statefulset --all --replicas=1
```

---

## Production (AWS — chirpwithlove.com)

### Prerequisites
- kubectl configured with EC2 k3s kubeconfig
- Docker with buildx
- AWS CLI logged into ECR Public

### Deploy a service update
```bash
# 1. Login to ECR
aws ecr-public get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin public.ecr.aws

# 2. Build and push (replace SERVICE_NAME)
docker buildx build --platform linux/amd64 \
  -t public.ecr.aws/j8v9z0p1/twitter-SERVICE_NAME:latest \
  --push ./backend -f backend/SERVICE_NAME/Dockerfile

# 3. Restart deployment
kubectl rollout restart deployment/SERVICE_NAME
kubectl rollout status deployment/SERVICE_NAME
```

### Check pod status
```bash
kubectl get pods
kubectl logs deployment/SERVICE_NAME --tail=50
```

### Check replication
```bash
# Primary
kubectl exec -it postgres-primary-0 -- \
  psql -U twitter_user -d twitter \
  -c "SELECT client_addr, state, sent_lsn, replay_lsn FROM pg_stat_replication;"

# Replica
kubectl exec -it postgres-replica-0 -- \
  psql -U twitter_user -d twitter \
  -c "SELECT status, last_msg_receipt_time FROM pg_stat_wal_receiver;"
```

### Reindex Elasticsearch
```bash
# Tweets
kubectl exec -it $(kubectl get pod -l app=search-service -o jsonpath='{.items[0].metadata.name}') -- \
  wget -qO- --post-data='' http://localhost:3005/api/v1/search/reindex

# Users
kubectl exec -it $(kubectl get pod -l app=search-service -o jsonpath='{.items[0].metadata.name}') -- \
  wget -qO- --post-data='' http://localhost:3005/api/v1/search/reindex-users
```

### Kibana (local, points to production ES)
```bash
# Terminal 1 — port-forward ES
kubectl port-forward pod/$(kubectl get pod -l app=elasticsearch -o jsonpath='{.items[0].metadata.name}') 9201:9200

# Terminal 2 — run Kibana
docker run --rm -p 5602:5601 \
  -e ELASTICSEARCH_HOSTS=http://host.docker.internal:9201 \
  docker.elastic.co/kibana/kibana:8.11.1
```

Open http://localhost:5602

---

## Service Ports

| Service            | Port |
|--------------------|------|
| Frontend           | 3000 |
| API Gateway        | 3001 |
| Auth Service       | 3002 |
| User Service       | 3003 |
| Feed Service       | 3004 |
| Search Service     | 3005 |
| Notification Svc   | 3006 |
| Postgres Primary   | 5432 |
| Postgres Replica   | 5433 |
| Redis              | 6379 |
| Kafka              | 9092 |
| Elasticsearch      | 9200 |
| Kibana             | 5601 |
| Zookeeper          | 2181 |

---

## Tech Stack

| Layer          | Technology                              |
|----------------|-----------------------------------------|
| Frontend       | React, Vite, TailwindCSS, React Query   |
| API Gateway    | Node.js, Express, http-proxy-middleware |
| Services       | Node.js, Express                        |
| Database       | PostgreSQL (primary + replica)          |
| Cache          | Redis                                   |
| Message Queue  | Kafka + Zookeeper                       |
| Search         | Elasticsearch                           |
| Real-time      | SSE (feed updates) + Socket.io (future chat) |
| Infra          | Docker, k3s, AWS EC2, ECR Public        |
