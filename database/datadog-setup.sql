-- Datadog Database Monitoring Setup for PostgreSQL
-- This script creates the datadog user and grants necessary permissions

-- Enable pg_stat_statements extension for query metrics
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Create datadog user for monitoring
CREATE USER datadog WITH PASSWORD 'datadog_password';

-- Grant necessary permissions for basic monitoring
GRANT pg_monitor TO datadog;
GRANT SELECT ON pg_stat_database TO datadog;

-- Create schema for Datadog functions (optional but recommended)
CREATE SCHEMA IF NOT EXISTS datadog;
GRANT USAGE ON SCHEMA datadog TO datadog;
GRANT USAGE ON SCHEMA public TO datadog;

-- Function to explain queries (for query samples)
CREATE OR REPLACE FUNCTION datadog.explain_statement(
   l_query TEXT,
   OUT explain JSON
)
RETURNS SETOF JSON AS
$$
DECLARE
curs REFCURSOR;
plan JSON;
BEGIN
   OPEN curs FOR EXECUTE 'EXPLAIN (FORMAT JSON) ' || l_query;
   FETCH curs INTO plan;
   CLOSE curs;
   RETURN QUERY SELECT plan;
END;
$$
LANGUAGE plpgsql
RETURNS NULL ON NULL INPUT
SECURITY DEFINER;

-- Grant execute on the explain function
GRANT EXECUTE ON FUNCTION datadog.explain_statement(TEXT) TO datadog;

-- Grant SELECT on all tables in public schema for deep monitoring
GRANT SELECT ON ALL TABLES IN SCHEMA public TO datadog;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO datadog;

-- Grant access to pg_stat_activity for monitoring active queries
GRANT SELECT ON pg_stat_activity TO datadog;

-- For tracking query statistics
GRANT SELECT ON pg_stat_statements TO datadog;

-- Log a message indicating setup is complete
DO $$
BEGIN
    RAISE NOTICE 'Datadog user created and permissions granted successfully';
END
$$;
