#!/bin/bash
set -euo pipefail

# Function for logging
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [JANITOR] $1"
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

# Function to upload reports to S3
upload_reports() {
    if [[ -n "${S3_BUCKET:-}" ]]; then
        log "📤 Uploading reports to S3 bucket: $S3_BUCKET"
        for report in /app/reports/*.json; do
            if [[ -f "$report" ]]; then
                local filename=$(basename "$report")
                aws s3 cp "$report" "s3://$S3_BUCKET/reports/$filename" || log "⚠️  Failed to upload $report"
            fi
        done
        log "✅ All reports uploaded"
    else
        log "ℹ️  No S3_BUCKET specified, skipping upload"
    fi
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
    
    # Process repositories
    if [[ -n "${REPOS_FILE:-}" ]] && [[ -f "$REPOS_FILE" ]]; then
        process_repositories "$REPOS_FILE"
    else
        log "❌ REPOS_FILE not specified or file not found: ${REPOS_FILE:-}"
        exit 1
    fi
    
    # Upload reports
    upload_reports
    
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