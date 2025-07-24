#!/bin/bash

# Cancel Validation Run Script for Janitor Agent
# Use this to cancel incomplete validation runs

set -e

# Load environment variables
if [ -f ".env" ]; then
    source .env
else
    echo "❌ Error: .env file not found. Please copy .env.example to .env and configure it."
    exit 1
fi

# Check if RUN_ID is provided
if [ -z "$1" ]; then
    echo "❌ Error: RUN_ID parameter is required"
    echo "Usage: $0 <RUN_ID>"
    echo "Example: make cancel RUN_ID=550e8400-e29b-41d4-a716-446655440000"
    exit 1
fi

RUN_ID="$1"

# Validate required environment variables
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
    echo "❌ Error: Required Supabase variables not set in .env:"
    echo "  SUPABASE_URL, SUPABASE_ANON_KEY"
    exit 1
fi

echo "❌ Cancelling validation run: $RUN_ID"

# Show run details before cancelling
echo "📋 Fetching run details..."
if [ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_ANON_KEY" ]; then
    run_details=$(curl -s \
        -H "apikey: $SUPABASE_ANON_KEY" \
        -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
        -H "Content-Type: application/json" \
        "$SUPABASE_URL/rest/v1/validation_results?run_id=eq.$RUN_ID&or=(validation_status.eq.running,validation_status.eq.queued)&order=created_at.desc")
    
    if [ "$run_details" != "[]" ]; then
        repo_count=$(echo "$run_details" | jq '. | length')
        echo "   Found $repo_count running repositories for this run"
        echo "$run_details" | jq -r '.[] | "   - \(.organization)/\(.repository_name)"'
    else
        echo "⚠️  No running repositories found for run $RUN_ID"
        echo "   (Run may already be completed or cancelled)"
    fi
fi

# Confirm cancellation
echo ""
read -p "❓ Are you sure you want to cancel run $RUN_ID? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Cancellation aborted"
    exit 0
fi

# Cancel the run by updating database directly via Supabase REST API
echo "📡 Cancelling run via database update..."

# Generate timestamp (cross-platform compatible)
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    timestamp=$(date -u '+%Y-%m-%dT%H:%M:%S.000Z')
else
    # Linux
    timestamp=$(date -u '+%Y-%m-%dT%H:%M:%S.000Z')
fi

# Update all running repositories for this run_id to cancelled status
response=$(curl -s -X PATCH "$SUPABASE_URL/rest/v1/validation_results?run_id=eq.$RUN_ID&or=(validation_status.eq.running,validation_status.eq.queued)" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d '{
        "validation_status": "cancelled",
        "results_json": {
            "status": "cancelled",
            "message": "Run cancelled by user",
            "timestamp": "'$timestamp'"
        }
    }' || echo '[]')

# Check if we got a valid response
if echo "$response" | jq -e '.' > /dev/null 2>&1; then
    cancelled_count=$(echo "$response" | jq '. | length')
    echo "✅ Successfully cancelled run $RUN_ID"
    echo "📋 Cancelled $cancelled_count repositories"
    echo "💡 Use 'make query-results RUN_ID=$RUN_ID' to verify cancellation"
else
    echo "❌ Error cancelling run - invalid response from database"
    exit 1
fi 