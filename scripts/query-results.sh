#!/bin/bash

# Query Validation Results Script for Janitor Agent
# Use this to check validation results from Supabase

set -e

# Load environment variables
if [ -f ".env" ]; then
    source .env
else
    echo "❌ Error: .env file not found. Please copy .env.example to .env and configure it."
    exit 1
fi

# Validate required environment variables
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
    echo "❌ Error: Required Supabase variables not set in .env:"
    echo "  SUPABASE_URL, SUPABASE_ANON_KEY"
    exit 1
fi

# Check for query type
if [ -n "$RUN_ID" ]; then
    # Query by run ID
    echo "🔍 Querying results for run ID: $RUN_ID"
    
    curl -s \
        -H "apikey: $SUPABASE_ANON_KEY" \
        -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
        -H "Content-Type: application/json" \
        "$SUPABASE_URL/rest/v1/validation_results?run_id=eq.$RUN_ID&order=created_at.desc" \
        | jq '.[] | {
            repository: "\(.organization)/\(.repository_name)",
            status: .validation_status,
            created_at: .created_at,
            results: .results_json
        }'

elif [ -n "$REPO" ]; then
    # Query by repository name
    echo "🔍 Querying results for repository: $REPO"
    
    curl -s \
        -H "apikey: $SUPABASE_ANON_KEY" \
        -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
        -H "Content-Type: application/json" \
        "$SUPABASE_URL/rest/v1/validation_results?repository_name=eq.$REPO&order=created_at.desc&limit=10" \
        | jq '.[] | {
            run_id: .run_id,
            repository: "\(.organization)/\(.repository_name)",
            status: .validation_status,
            created_at: .created_at,
            results: .results_json
        }'

else
    # Show recent results
    echo "📊 Showing recent validation results (last 20)..."
    
    curl -s \
        -H "apikey: $SUPABASE_ANON_KEY" \
        -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
        -H "Content-Type: application/json" \
        "$SUPABASE_URL/rest/v1/validation_results?order=created_at.desc&limit=20" \
        | jq '.[] | {
            run_id: .run_id,
            repository: "\(.organization)/\(.repository_name)",
            status: .validation_status,
            created_at: .created_at
        }'
    
    echo ""
    echo "ℹ️  Usage:"
    echo "   Query by run ID:     make query-results RUN_ID=your-run-id"
    echo "   Query by repository: make query-results REPO=worker-basic"
    echo "   Show recent results: make query-results"
fi 