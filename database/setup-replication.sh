#!/bin/bash
set -e

# Wait for primary to be ready
until pg_isready -h postgres-primary -p 5432 -U twitter_user
do
  echo "Waiting for primary to be ready..."
  sleep 2
done

echo "Primary is ready. Checking if replica needs initialization..."

# Check if data directory is empty or needs re-initialization
if [ ! -f "/var/lib/postgresql/data/PG_VERSION" ]; then
    echo "Initializing replica from primary using pg_basebackup..."
    
    # Remove any existing data
    rm -rf /var/lib/postgresql/data/*
    
    # Create base backup from primary
    PGPASSWORD=password pg_basebackup \
        -h postgres-primary \
        -p 5432 \
        -U twitter_user \
        -D /var/lib/postgresql/data \
        -Fp \
        -Xs \
        -P \
        -R
    
    echo "Base backup completed successfully!"
    
    # Ensure correct permissions
    chmod 700 /var/lib/postgresql/data
    chown -R postgres:postgres /var/lib/postgresql/data
    
    echo "Replica initialization complete!"
else
    echo "Data directory already exists. Checking standby configuration..."
    
    # Ensure standby.signal exists
    if [ ! -f "/var/lib/postgresql/data/standby.signal" ]; then
        touch /var/lib/postgresql/data/standby.signal
        chown postgres:postgres /var/lib/postgresql/data/standby.signal
        echo "Created standby.signal"
    fi
    
    # Ensure primary_conninfo is set
    if ! grep -q "primary_conninfo" /var/lib/postgresql/data/postgresql.auto.conf 2>/dev/null; then
        echo "primary_conninfo = 'host=postgres-primary port=5432 user=twitter_user password=password'" >> /var/lib/postgresql/data/postgresql.auto.conf
        chown postgres:postgres /var/lib/postgresql/data/postgresql.auto.conf
        echo "Added primary_conninfo to postgresql.auto.conf"
    fi
fi

echo "Starting PostgreSQL replica..."
exec su-exec postgres postgres -c config_file=/etc/postgresql/postgresql.conf
