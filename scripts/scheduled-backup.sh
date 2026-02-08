#!/bin/bash

# Scheduled Backup Script
# Run this script via cron for automated backups
#
# Example crontab entries:
# 
# Backup every 6 hours:
# 0 */6 * * * /Users/erachaudhary/workspace/twitter/scripts/scheduled-backup.sh >> /Users/erachaudhary/workspace/twitter/backups/backup.log 2>&1
#
# Backup daily at 2 AM:
# 0 2 * * * /Users/erachaudhary/workspace/twitter/scripts/scheduled-backup.sh >> /Users/erachaudhary/workspace/twitter/backups/backup.log 2>&1
#
# To edit crontab: crontab -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Source environment if exists
if [ -f "$PROJECT_DIR/.env" ]; then
    source "$PROJECT_DIR/.env"
fi

# Set backup directory
export BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"

# Log timestamp
echo ""
echo "=========================================="
echo "Scheduled Backup - $(date)"
echo "=========================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "ERROR: Docker is not running!"
    exit 1
fi

# Check if postgres container is running
if ! docker ps --format '{{.Names}}' | grep -q "twitter-postgres-primary"; then
    echo "WARNING: PostgreSQL container is not running. Skipping backup."
    exit 0
fi

# Run backup
"$SCRIPT_DIR/backup-database.sh"

exit $?
