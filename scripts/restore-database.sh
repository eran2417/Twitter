#!/bin/bash

# PostgreSQL Restore Script
# Restores a backup to the Twitter database

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/Users/erachaudhary/workspace/twitter/backups}"
CONTAINER_NAME="${CONTAINER_NAME:-twitter-postgres-primary}"
DB_NAME="${DB_NAME:-twitter}"
DB_USER="${DB_USER:-twitter_user}"

echo "=========================================="
echo "PostgreSQL Restore Script"
echo "=========================================="

# Check if backup file is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <backup_file.sql.gz>"
    echo ""
    echo "Available backups:"
    ls -lht "$BACKUP_DIR"/${DB_NAME}_backup_*.sql.gz 2>/dev/null || echo "No backups found in $BACKUP_DIR"
    echo ""
    echo "Or specify 'latest' to restore the most recent backup:"
    echo "  $0 latest"
    exit 1
fi

# Determine backup file
if [ "$1" == "latest" ]; then
    BACKUP_FILE=$(ls -t "$BACKUP_DIR"/${DB_NAME}_backup_*.sql.gz 2>/dev/null | head -1)
    if [ -z "$BACKUP_FILE" ]; then
        echo "ERROR: No backups found in $BACKUP_DIR"
        exit 1
    fi
    echo "Using latest backup: $BACKUP_FILE"
else
    BACKUP_FILE="$1"
fi

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "Backup file: $BACKUP_FILE"
echo "Database: $DB_NAME"
echo "Container: $CONTAINER_NAME"
echo ""

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "ERROR: Container $CONTAINER_NAME is not running!"
    exit 1
fi

# Confirm restore
echo "⚠️  WARNING: This will OVERWRITE the current database!"
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

echo ""
echo "Starting restore..."

# Decompress and restore (with error filtering for pg_dump comments)
if [[ "$BACKUP_FILE" == *.gz ]]; then
    gunzip -c "$BACKUP_FILE" | grep -v "^pg_dump:" | docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" --quiet 2>&1
else
    grep -v "^pg_dump:" "$BACKUP_FILE" | docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" --quiet 2>&1
fi

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Restore completed successfully!"
    
    # Show record counts
    echo ""
    echo "Database statistics:"
    docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "
        SELECT 'users' as table_name, COUNT(*) as count FROM users
        UNION ALL
        SELECT 'tweets', COUNT(*) FROM tweets
        UNION ALL
        SELECT 'follows', COUNT(*) FROM follows
        UNION ALL
        SELECT 'likes', COUNT(*) FROM likes;
    "

    # Sync Elasticsearch with restored data
    echo ""
    echo "Syncing Elasticsearch with restored data..."
    if command -v curl >/dev/null 2>&1; then
        echo "Reindexing users..."
        curl -s -X POST http://localhost:3001/api/search/reindex-users >/dev/null
        echo "Reindexing tweets..."
        curl -s -X POST http://localhost:3001/api/search/reindex >/dev/null
        echo "✅ Elasticsearch synced with restored database!"
    else
        echo "⚠️  WARNING: curl not found. Please run './scripts/sync-elasticsearch.sh' manually."
    fi
else
    echo ""
    echo "❌ Restore failed!"
    exit 1
fi

echo ""
echo "=========================================="
echo "Restore complete!"
echo "=========================================="
