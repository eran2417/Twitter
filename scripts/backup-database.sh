#!/bin/bash

# PostgreSQL Backup Script
# Creates timestamped backups of the Twitter database

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/Users/erachaudhary/workspace/twitter/backups}"
CONTAINER_NAME="${CONTAINER_NAME:-twitter-postgres-primary}"
DB_NAME="${DB_NAME:-twitter}"
DB_USER="${DB_USER:-twitter_user}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"  # Keep backups for 7 days

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Generate timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_backup_${TIMESTAMP}.sql"
BACKUP_FILE_GZ="${BACKUP_FILE}.gz"

echo "=========================================="
echo "PostgreSQL Backup Script"
echo "=========================================="
echo "Timestamp: $TIMESTAMP"
echo "Database: $DB_NAME"
echo "Container: $CONTAINER_NAME"
echo "Backup Directory: $BACKUP_DIR"
echo ""

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "ERROR: Container $CONTAINER_NAME is not running!"
    exit 1
fi

echo "Starting backup..."

# Create backup using pg_dump (clean format for reliable restores)
docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" \
    --no-owner \
    --no-acl \
    --clean \
    --if-exists \
    --no-comments \
    --no-publications \
    --no-subscriptions \
    --no-tablespaces \
    > "$BACKUP_FILE" 2>&1

# Check if backup was successful
if [ $? -eq 0 ] && [ -s "$BACKUP_FILE" ]; then
    # Compress the backup
    gzip "$BACKUP_FILE"
    
    BACKUP_SIZE=$(du -h "$BACKUP_FILE_GZ" | cut -f1)
    echo ""
    echo "✅ Backup completed successfully!"
    echo "   File: $BACKUP_FILE_GZ"
    echo "   Size: $BACKUP_SIZE"
else
    echo "❌ Backup failed!"
    rm -f "$BACKUP_FILE"
    exit 1
fi

# Clean up old backups (older than RETENTION_DAYS)
echo ""
echo "Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "${DB_NAME}_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true

# List current backups
echo ""
echo "Current backups:"
ls -lh "$BACKUP_DIR"/${DB_NAME}_backup_*.sql.gz 2>/dev/null || echo "No backups found"

echo ""
echo "=========================================="
echo "Backup complete!"
echo "=========================================="
