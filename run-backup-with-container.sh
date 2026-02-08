#!/bin/bash
# Script to create a clean database backup by isolating PostgreSQL

set -e

echo "=========================================="
echo "Clean Database Backup Script"
echo "=========================================="

# Change to project directory
cd "$(dirname "$0")"

echo "Stopping all services for clean backup..."
docker-compose stop

echo "Starting only PostgreSQL primary..."
docker-compose up -d postgres-primary

echo "Waiting for PostgreSQL to be ready..."
# Wait up to 30 seconds for PostgreSQL to be healthy
for i in {1..30}; do
    if docker-compose exec -T postgres-primary pg_isready -U twitter_user -d twitter >/dev/null 2>&1; then
        echo "✅ PostgreSQL is ready!"
        break
    fi
    echo "Waiting... ($i/30)"
    sleep 1
    if [ $i -eq 30 ]; then
        echo "❌ ERROR: PostgreSQL primary failed to start properly!"
        docker-compose up -d
        exit 1
    fi
done

echo "Creating backup..."
if ./scripts/scheduled-backup.sh; then
    echo "✅ Backup completed successfully!"
else
    echo "❌ ERROR: Backup failed!"
    docker-compose up -d
    exit 1
fi

echo "Restarting all services..."
docker-compose up -d

echo "Waiting for services to be ready..."
sleep 5

echo "=========================================="
echo "Clean backup process complete!"
echo "=========================================="