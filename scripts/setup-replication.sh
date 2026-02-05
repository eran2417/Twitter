#!/bin/bash

# Script to setup database replication

echo "Setting up PostgreSQL replication..."

# Wait for primary to be ready
until docker exec twitter-postgres-primary pg_isready -U twitter_user; do
  echo "Waiting for primary database..."
  sleep 2
done

echo "Primary database is ready"

# Create replication slot on primary
docker exec twitter-postgres-primary psql -U twitter_user -d twitter -c "SELECT pg_create_physical_replication_slot('replica_slot');" 2>/dev/null || echo "Replication slot already exists"

# Backup from primary
echo "Creating base backup from primary..."
docker exec twitter-postgres-replica rm -rf /var/lib/postgresql/data/*
docker exec twitter-postgres-replica pg_basebackup -h postgres-primary -D /var/lib/postgresql/data -U replicator -v -P -W

# Create recovery configuration
echo "Configuring replica..."
docker exec twitter-postgres-replica bash -c "cat > /var/lib/postgresql/data/postgresql.auto.conf << EOF
primary_conninfo = 'host=postgres-primary port=5432 user=replicator password=replicator_password'
primary_slot_name = 'replica_slot'
EOF"

docker exec twitter-postgres-replica touch /var/lib/postgresql/data/standby.signal

# Restart replica
echo "Restarting replica..."
docker restart twitter-postgres-replica

sleep 5

# Verify replication
echo "Verifying replication status..."
docker exec twitter-postgres-primary psql -U twitter_user -d twitter -c "SELECT * FROM pg_stat_replication;"

echo "Replication setup complete!"
