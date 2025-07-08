#!/bin/bash
set -euo pipefail

# Database Migration Script for Janitor
# Usage: ./migrate.sh [environment]

ENVIRONMENT=${1:-dev}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="${SCRIPT_DIR}/migrations"

echo "🗄️ Starting database migration for environment: ${ENVIRONMENT}"

# Function to get secret value from AWS Secrets Manager
get_secret() {
    local secret_arn=$1
    local key=$2
    aws secretsmanager get-secret-value \
        --secret-id "${secret_arn}" \
        --query "SecretString" \
        --output text \
        --profile janitor | jq -r ".${key}"
}

# Get database configuration from Terraform outputs
echo "🔍 Getting database configuration from Terraform..."
cd "${SCRIPT_DIR}/../terraform"

# Check if terraform is initialized
if [ ! -d ".terraform" ]; then
    echo "❌ Terraform not initialized. Run 'terraform init' first."
    exit 1
fi

# Get database connection details
DB_ENDPOINT=$(terraform output -raw database_cluster_endpoint 2>/dev/null || echo "")
DB_NAME=$(terraform output -raw database_name 2>/dev/null || echo "")
MASTER_SECRET_ARN=$(terraform output -raw database_master_secret_arn 2>/dev/null || echo "")
AGENT_SECRET_ARN=$(terraform output -raw database_agent_secret_arn 2>/dev/null || echo "")
QUERY_SECRET_ARN=$(terraform output -raw database_query_secret_arn 2>/dev/null || echo "")

if [ -z "${DB_ENDPOINT}" ] || [ -z "${DB_NAME}" ]; then
    echo "❌ Could not retrieve database configuration from Terraform outputs."
    echo "   Make sure the database infrastructure is deployed."
    exit 1
fi

echo "✅ Database endpoint: ${DB_ENDPOINT}"
echo "✅ Database name: ${DB_NAME}"

# Get master credentials
echo "🔐 Retrieving master database credentials..."
MASTER_USERNAME=$(get_secret "${MASTER_SECRET_ARN}" "username")
MASTER_PASSWORD=$(get_secret "${MASTER_SECRET_ARN}" "password")

# Get agent and query passwords
echo "🔐 Retrieving user passwords..."
AGENT_PASSWORD=$(get_secret "${AGENT_SECRET_ARN}" "password")
QUERY_PASSWORD=$(get_secret "${QUERY_SECRET_ARN}" "password")

# Test database connection
echo "🔌 Testing database connection..."
export PGPASSWORD="${MASTER_PASSWORD}"
if ! psql -h "${DB_ENDPOINT}" -U "${MASTER_USERNAME}" -d "${DB_NAME}" -c "SELECT 1;" > /dev/null 2>&1; then
    echo "❌ Cannot connect to database. Check if:"
    echo "   1. Database is running"
    echo "   2. Security groups allow connection"
    echo "   3. Credentials are correct"
    exit 1
fi

echo "✅ Database connection successful"

# Run migrations
echo "🚀 Running database migrations..."

# Execute migration 001: Initial schema
echo "📋 Running migration 001: Initial schema..."
psql -h "${DB_ENDPOINT}" -U "${MASTER_USERNAME}" -d "${DB_NAME}" \
     -f "${MIGRATIONS_DIR}/001_initial_schema.sql" \
     --quiet

# Execute migration 002: Set user passwords
echo "📋 Running migration 002: Set user passwords..."
psql -h "${DB_ENDPOINT}" -U "${MASTER_USERNAME}" -d "${DB_NAME}" \
     --set agent_password="'${AGENT_PASSWORD}'" \
     --set query_password="'${QUERY_PASSWORD}'" \
     -f "${MIGRATIONS_DIR}/002_set_user_passwords.sql" \
     --quiet

# Test user connections
echo "🧪 Testing user connections..."

# Test agent user
export PGPASSWORD="${AGENT_PASSWORD}"
if psql -h "${DB_ENDPOINT}" -U "janitor_agent" -d "${DB_NAME}" -c "SELECT 1;" > /dev/null 2>&1; then
    echo "✅ Agent user connection successful"
else
    echo "❌ Agent user connection failed"
    exit 1
fi

# Test query user
export PGPASSWORD="${QUERY_PASSWORD}"
if psql -h "${DB_ENDPOINT}" -U "janitor_query" -d "${DB_NAME}" -c "SELECT 1;" > /dev/null 2>&1; then
    echo "✅ Query user connection successful"
else
    echo "❌ Query user connection failed"
    exit 1
fi

# Verify schema
echo "🔍 Verifying database schema..."
export PGPASSWORD="${QUERY_PASSWORD}"
TABLE_COUNT=$(psql -h "${DB_ENDPOINT}" -U "janitor_query" -d "${DB_NAME}" \
              -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" \
              2>/dev/null | tr -d ' ')

if [ "${TABLE_COUNT}" -eq 3 ]; then
    echo "✅ All 3 tables created successfully"
else
    echo "❌ Expected 3 tables, found ${TABLE_COUNT}"
    exit 1
fi

# Show final status
echo ""
echo "🎉 Database migration completed successfully!"
echo ""
echo "📊 Database Summary:"
echo "   Environment: ${ENVIRONMENT}"
echo "   Endpoint: ${DB_ENDPOINT}"
echo "   Database: ${DB_NAME}"
echo "   Tables: validation_runs, repository_validations, validation_reports"
echo "   Users: janitor_agent (write), janitor_query (read-only)"
echo ""
echo "🔄 Next steps:"
echo "   1. Deploy agent with database tools: make image ENV=${ENVIRONMENT}"
echo "   2. Run validation: make launch-instance ENV=${ENVIRONMENT}"
echo "   3. Query results: make query-db ENV=${ENVIRONMENT} REPO=<repo-name>"

unset PGPASSWORD 