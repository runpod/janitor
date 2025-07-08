#!/bin/bash
set -e

ENV=${1:-dev}

echo "🗄️ Running database migration locally for $ENV..."

# Get database credentials from Secrets Manager
echo "🔐 Getting database credentials..."
MASTER_CREDS=$(aws secretsmanager get-secret-value \
    --secret-id "janitor-$ENV-db-master-password" \
    --region eu-west-2 \
    --profile janitor \
    --query "SecretString" \
    --output text)

MASTER_USERNAME=$(echo $MASTER_CREDS | jq -r '.username')
MASTER_PASSWORD=$(echo $MASTER_CREDS | jq -r '.password')

AGENT_CREDS=$(aws secretsmanager get-secret-value \
    --secret-id "janitor-$ENV-db-agent-credentials" \
    --region eu-west-2 \
    --profile janitor \
    --query "SecretString" \
    --output text)

AGENT_PASSWORD=$(echo $AGENT_CREDS | jq -r '.password')

QUERY_CREDS=$(aws secretsmanager get-secret-value \
    --secret-id "janitor-$ENV-db-query-credentials" \
    --region eu-west-2 \
    --profile janitor \
    --query "SecretString" \
    --output text)

QUERY_PASSWORD=$(echo $QUERY_CREDS | jq -r '.password')

# Database details
DB_ENDPOINT="janitor-$ENV-db-cluster.cluster-chw0cak0anui.eu-west-2.rds.amazonaws.com"
DB_NAME="janitor"

echo "✅ Got credentials for user: $MASTER_USERNAME"

# Test connection
echo "🔌 Testing database connection..."
export PGPASSWORD="$MASTER_PASSWORD"
if psql -h "$DB_ENDPOINT" -U "$MASTER_USERNAME" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
    echo "✅ Database connection successful"
else
    echo "❌ Database connection failed"
    exit 1
fi

# Create proper schema matching user story
echo "📋 Creating database schema..."
psql -h "$DB_ENDPOINT" -U "$MASTER_USERNAME" -d "$DB_NAME" << 'EOF'
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables to recreate with proper schema
DROP TABLE IF EXISTS validation_reports CASCADE;
DROP TABLE IF EXISTS repository_validations CASCADE;
DROP TABLE IF EXISTS validation_runs CASCADE;

-- Validation runs table (matches user story)
CREATE TABLE validation_runs (
    id SERIAL PRIMARY KEY,
    run_id UUID UNIQUE NOT NULL DEFAULT uuid_generate_v4(),
    environment VARCHAR(50) NOT NULL,
    instance_id VARCHAR(50),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
    repository_count INTEGER DEFAULT 0,
    repos_file_path VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Repository validation results (matches user story)
CREATE TABLE repository_validations (
    id SERIAL PRIMARY KEY,
    run_id UUID NOT NULL REFERENCES validation_runs(run_id) ON DELETE CASCADE,
    repository_name VARCHAR(255) NOT NULL,
    organization VARCHAR(255) NOT NULL,
    validation_status VARCHAR(50) NOT NULL, -- 'success', 'failed', 'skipped'
    validation_type VARCHAR(50) NOT NULL, -- 'docker_validation', 'feature_addition'
    build_success BOOLEAN,
    container_execution_success BOOLEAN,
    gpu_available BOOLEAN,
    cuda_detected BOOLEAN,
    error_message TEXT,
    execution_time_seconds INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Detailed validation reports (matches user story)
CREATE TABLE validation_reports (
    id SERIAL PRIMARY KEY,
    validation_id INTEGER NOT NULL REFERENCES repository_validations(id) ON DELETE CASCADE,
    report_type VARCHAR(50) NOT NULL, -- 'build_log', 'container_log', 'error_details', 'feature_changes'
    report_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient querying (matches user story)
CREATE INDEX idx_repo_validations_repo_name ON repository_validations(repository_name);
CREATE INDEX idx_repo_validations_run_id ON repository_validations(run_id);
CREATE INDEX idx_repo_validations_status ON repository_validations(validation_status);
CREATE INDEX idx_validation_runs_environment ON validation_runs(environment);
CREATE INDEX idx_validation_runs_started_at ON validation_runs(started_at);
CREATE INDEX idx_validation_runs_run_id ON validation_runs(run_id);

EOF

# Create/update database users with proper permissions
echo "👤 Creating database users..."
psql -h "$DB_ENDPOINT" -U "$MASTER_USERNAME" -d "$DB_NAME" << EOF
-- Create janitor_agent user (minimal permissions)
DO \$\$ 
BEGIN 
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'janitor_agent') THEN 
        CREATE USER janitor_agent WITH PASSWORD '$AGENT_PASSWORD'; 
    ELSE 
        ALTER USER janitor_agent WITH PASSWORD '$AGENT_PASSWORD'; 
    END IF; 
END \$\$;

-- Create janitor_query user (read-only)
DO \$\$ 
BEGIN 
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'janitor_query') THEN 
        CREATE USER janitor_query WITH PASSWORD '$QUERY_PASSWORD'; 
    ELSE 
        ALTER USER janitor_query WITH PASSWORD '$QUERY_PASSWORD'; 
    END IF; 
END \$\$;

-- Grant minimal permissions to janitor_agent (INSERT/UPDATE only)
GRANT USAGE ON SCHEMA public TO janitor_agent;
GRANT SELECT, INSERT, UPDATE ON validation_runs TO janitor_agent;
GRANT SELECT, INSERT ON repository_validations TO janitor_agent;
GRANT SELECT, INSERT ON validation_reports TO janitor_agent;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO janitor_agent;

-- Grant read-only permissions to janitor_query
GRANT USAGE ON SCHEMA public TO janitor_query;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO janitor_query;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO janitor_query;
EOF

# Test users
echo "🧪 Testing database users..."
export PGPASSWORD="$AGENT_PASSWORD"
if psql -h "$DB_ENDPOINT" -U "janitor_agent" -d "$DB_NAME" -c "SELECT 'Agent user works!';" > /dev/null 2>&1; then
    echo "✅ Agent user connection successful"
else
    echo "❌ Agent user connection failed"
    exit 1
fi

export PGPASSWORD="$QUERY_PASSWORD"
TABLE_COUNT=$(psql -h "$DB_ENDPOINT" -U "janitor_query" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" | tr -d ' ')

echo "🎉 Database migration completed!"
echo "   Tables created: $TABLE_COUNT"
echo "   Users: janitor_agent (INSERT/UPDATE), janitor_query (SELECT)"

# Insert test data
echo "🧪 Inserting test data..."
export PGPASSWORD="$AGENT_PASSWORD"
psql -h "$DB_ENDPOINT" -U "janitor_agent" -d "$DB_NAME" << EOF
-- Insert test validation run
INSERT INTO validation_runs (environment, instance_id, status, repository_count, repos_file_path)
VALUES ('$ENV', 'test-instance', 'completed', 1, 'infra/repos.yaml');

-- Insert test repository validation
INSERT INTO repository_validations (
    run_id, repository_name, organization, validation_status, validation_type,
    build_success, container_execution_success, gpu_available, cuda_detected,
    execution_time_seconds
)
SELECT 
    run_id, 'test-repo', 'runpod', 'success', 'docker_validation',
    true, true, true, true, 45
FROM validation_runs 
WHERE environment = '$ENV' AND instance_id = 'test-instance';
EOF

echo "✅ Test data inserted successfully!"
echo "🔥 Database is ready for use!"
echo ""
echo "🛠️  Next steps:"
echo "   make query-runs ENV=$ENV          # List recent validation runs"
echo "   make query-db ENV=$ENV REPO=name  # Query specific repository"
echo "   make db-connect ENV=$ENV          # Connect to database" 