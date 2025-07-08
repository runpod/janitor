#!/bin/bash
set -euo pipefail

# Function for logging
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [JANITOR] $1"
}

# Function to fetch database credentials from AWS and set as environment variables
setup_database_credentials() {
    log "🔐 Setting up database credentials..."
    
    # If credentials are already set (for local development), use them
    if [[ -n "${DATABASE_HOST:-}" && -n "${DATABASE_PASSWORD:-}" ]]; then
        log "✅ Database credentials already provided via environment variables"
        return 0
    fi
    
    # For production, fetch from AWS Secrets Manager
    if [[ -n "${DATABASE_AGENT_SECRET_ARN:-}" ]]; then
        log "🔑 Fetching database credentials from AWS Secrets Manager..."
        
        local secret_json
        
        # Use AWS profile only for local development, not in production
        local aws_profile_flag=""
        if [[ "${ENVIRONMENT:-}" == "local" ]]; then
            aws_profile_flag="--profile ${AWS_PROFILE:-janitor}"
        fi
        
        secret_json=$(aws secretsmanager get-secret-value \
            --secret-id "$DATABASE_AGENT_SECRET_ARN" \
            --query "SecretString" \
            --output text \
            $aws_profile_flag 2>/dev/null) || {
            log "⚠️  Failed to fetch database credentials from AWS, continuing without database"
            return 1
        }
        
        # Parse the secret JSON and export as environment variables
        export DATABASE_HOST=$(echo "$secret_json" | jq -r '.host')
        export DATABASE_PORT=$(echo "$secret_json" | jq -r '.port // "5432"')
        export DATABASE_NAME=$(echo "$secret_json" | jq -r '.database')
        export DATABASE_USER=$(echo "$secret_json" | jq -r '.username')
        export DATABASE_PASSWORD=$(echo "$secret_json" | jq -r '.password')
        
        log "✅ Database credentials fetched and configured"
        return 0
    else
        log "⚠️  No DATABASE_AGENT_SECRET_ARN provided, continuing without database"
        return 1
    fi
}

# Function to process repositories from YAML file
process_repositories() {
    local repos_file="$1"
    
    if [[ ! -f "$repos_file" ]]; then
        log "❌ Repository file not found: $repos_file"
        exit 1
    fi
    
    log "📋 Processing repositories from: $repos_file"
    
    # Parse YAML and extract repository URLs
    # This is a simple parser - in production might want to use a proper YAML parser
    local repos
    repos=$(grep -E '^\s*url:\s*' "$repos_file" | sed 's/^\s*url:\s*["\x27]*//' | sed 's/["\x27]*\s*$//')
    
    if [[ -z "$repos" ]]; then
        log "❌ No repositories found in $repos_file"
        exit 1
    fi
    
    log "📁 Found $(echo "$repos" | wc -l) repositories to process"
    
    # Process each repository
    while IFS= read -r repo_url; do
        if [[ -n "$repo_url" ]]; then
            process_single_repository "$repo_url"
        fi
    done <<< "$repos"
}

# Function to process a single repository
process_single_repository() {
    local repo_url="$1"
    local repo_name
    repo_name=$(basename "$repo_url" .git)
    
    log "🔍 Processing repository: $repo_name"
    log "📂 Repository URL: $repo_url"
    
    # Create a temporary report file
    local report_file="/app/reports/${repo_name}-report.json"
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    
    # Run the actual Janitor agent
    log "🤖 Running Janitor agent for $repo_name..."
    
    # Run the Janitor agent with environment variables
    REPO_URL="$repo_url" REPO_NAME="$repo_name" node /app/run-janitor.js
    
    log "✅ Completed processing $repo_name"
}

# Function to store reports in database
store_reports_in_database() {
    if [[ -z "${RUN_ID:-}" ]]; then
        log "⚠️  No RUN_ID available, skipping database storage"
        return
    fi
    
    log "📊 Storing validation results in database..."
    
    for report in /app/reports/*.json; do
        if [[ -f "$report" ]]; then
            local filename=$(basename "$report")
            local repo_name=$(echo "$filename" | sed 's/-report\.json$//' | sed 's/-error-report\.json$//')
            
            log "💾 Processing report for: $repo_name"
            
            # Parse the JSON report to extract results
            local status=$(jq -r '.status // "unknown"' "$report")
            local error_message=$(jq -r '.error // null' "$report")
            local organization="runpod"  # Default organization
            
            # Determine validation status and success flags
            local validation_status="failed"
            local build_success="false"
            local container_success="false"
            
            if [[ "$status" == "success" ]]; then
                validation_status="success"
                build_success="true"
                container_success="true"
            fi
            
            # Store in database
            local validation_id=$(node /app/db-operations.js store-repo \
                "$RUN_ID" \
                "$repo_name" \
                "$organization" \
                "$validation_status" \
                "docker_validation" \
                "$build_success" \
                "$container_success" \
                "false" \
                "false" \
                "$error_message" \
                "60" 2>/dev/null)
            
            if [[ -n "$validation_id" && "$validation_id" != "Database"* ]]; then
                # Store the detailed report
                node /app/db-operations.js store-report "$validation_id" "build_log" "$report" 2>/dev/null || true
                log "✅ Stored results for $repo_name (ID: $validation_id)"
            else
                log "⚠️  Failed to store results for $repo_name"
            fi
        fi
    done
    
    log "✅ All reports stored in database"
}

# Main execution
main() {
    log "🚀 Starting Janitor Agent container"
    log "🌍 Environment: ${ENVIRONMENT:-dev}"
    log "🔧 AWS Region: ${AWS_REGION:-us-east-1}"
    
    # Check required environment variables
    if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
        log "❌ ANTHROPIC_API_KEY is required but not set"
        exit 1
    fi
    
    # Set up database credentials (fetched from AWS, not by the agent)
    setup_database_credentials
    
    # Create validation run in database
    if [[ -n "${REPOS_FILE:-}" ]] && [[ -f "$REPOS_FILE" ]]; then
        local repo_count=$(grep -c '^[[:space:]]*url:' "$REPOS_FILE" || echo "0")
        log "📊 Creating validation run for $repo_count repositories..."
        
        export RUN_ID=$(node /app/db-operations.js start-run \
            "${ENVIRONMENT:-dev}" \
            "${HOSTNAME:-unknown}" \
            "$repo_count" \
            "$REPOS_FILE" 2>/dev/null)
        
        if [[ -n "$RUN_ID" && "$RUN_ID" != "Database"* ]]; then
            log "✅ Created validation run: $RUN_ID"
        else
            log "⚠️  Failed to create validation run, continuing without database storage"
            export RUN_ID=""
        fi
    fi
    
    # Process repositories
    if [[ -n "${REPOS_FILE:-}" ]] && [[ -f "$REPOS_FILE" ]]; then
        process_repositories "$REPOS_FILE"
    else
        log "❌ REPOS_FILE not specified or file not found: ${REPOS_FILE:-}"
        exit 1
    fi
    
    # Store reports in database
    store_reports_in_database
    
    # Mark validation run as complete
    if [[ -n "${RUN_ID:-}" ]]; then
        node /app/db-operations.js complete-run "$RUN_ID" "completed" 2>/dev/null || true
        log "📊 Marked validation run as completed"
    fi
    
    log "🎉 Janitor Agent execution completed successfully"
}

# Check if running as main script
if [[ "${1:-}" == "main" ]]; then
    main
else
    # Default: start a simple HTTP server for health checks
    log "🌐 Starting health check server on port ${PORT:-3000}"
    
    node /app/health-server.js
fi 