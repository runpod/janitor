#!/bin/bash

# Continue Validation Runs Script for Janitor Agent
# Use this to view and continue incomplete validation runs

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

# Function to get the GPU instance IP for API calls
get_instance_ip() {
    if [ -z "$AWS_PROFILE" ]; then
        echo "❌ Error: AWS_PROFILE not set in .env"
        return 1
    fi
    
    INSTANCE_ID=$(aws ec2 describe-instances \
        --filters "Name=tag:Name,Values=janitor-gpu-instance" "Name=instance-state-name,Values=running" \
        --query "Reservations[0].Instances[0].InstanceId" \
        --output text \
        --profile "$AWS_PROFILE" \
        --region "${AWS_REGION:-us-east-1}" 2>/dev/null || echo "None")
    
    if [ "$INSTANCE_ID" != "None" ] && [ "$INSTANCE_ID" != "null" ]; then
        PUBLIC_IP=$(aws ec2 describe-instances \
            --instance-ids "$INSTANCE_ID" \
            --query "Reservations[0].Instances[0].PublicIpAddress" \
            --output text \
            --profile "$AWS_PROFILE" \
            --region "${AWS_REGION:-us-east-1}")
        echo "$PUBLIC_IP"
    else
        echo ""
    fi
}

# Function to format age display
format_age() {
    local created_at="$1"
    local now=$(date -u +%s)
    local created_timestamp
    
    # Handle different date formats across platforms
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        created_timestamp=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${created_at%.*}" +%s 2>/dev/null || echo "$now")
    else
        # Linux
        created_timestamp=$(date -d "$created_at" +%s 2>/dev/null || echo "$now")
    fi
    
    local age_seconds=$((now - created_timestamp))
    local age_hours=$((age_seconds / 3600))
    local age_minutes=$(((age_seconds % 3600) / 60))
    
    if [ $age_hours -gt 0 ]; then
        echo "${age_hours}h ${age_minutes}m"
    else
        echo "${age_minutes}m"
    fi
}

# Check if specific RUN_ID is provided
if [ -n "$RUN_ID" ]; then
    echo "🔄 Continuing validation run: $RUN_ID"
    
    # Get instance IP
    INSTANCE_IP=$(get_instance_ip)
    if [ -z "$INSTANCE_IP" ]; then
        echo "❌ No running janitor instance found. Please start one with 'make start'"
        exit 1
    fi
    
    # Make API call to continue the run
    echo "📡 Sending continue request to janitor server at $INSTANCE_IP..."
    
    response=$(curl -s -X POST "http://$INSTANCE_IP:3000/api/continue/$RUN_ID" \
        -H "Content-Type: application/json" || echo '{"error": "Connection failed"}')
    
    # Check if the response contains an error
    if echo "$response" | jq -e '.error' > /dev/null 2>&1; then
        error_msg=$(echo "$response" | jq -r '.error')
        echo "❌ Error: $error_msg"
        exit 1
    else
        echo "✅ Successfully continued run $RUN_ID"
        repos=$(echo "$response" | jq -r '.repositories[]' 2>/dev/null | tr '\n' ' ')
        echo "📋 Processing repositories: $repos"
        echo "💡 Use 'make query-results RUN_ID=$RUN_ID' to monitor progress"
    fi
    
else
    # Show orphaned runs for interactive selection
    echo "🔍 Checking for incomplete validation runs (older than 5 hours)..."
    
    # Get orphaned runs from Supabase - calculate threshold timestamp first
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        threshold_time=$(date -u -v-5H '+%Y-%m-%dT%H:%M:%S.000Z')
    else
        # Linux
        threshold_time=$(date -u -d '5 hours ago' '+%Y-%m-%dT%H:%M:%S.000Z')
    fi
    
    orphaned_response=$(curl -s \
        -H "apikey: $SUPABASE_ANON_KEY" \
        -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
        -H "Content-Type: application/json" \
        "$SUPABASE_URL/rest/v1/validation_results?or=(validation_status.eq.running,validation_status.eq.queued)&created_at=lt.$threshold_time&order=created_at.desc")
    
    # Check if we got results
    if [ -z "$orphaned_response" ] || [ "$orphaned_response" = "[]" ]; then
        echo "✅ No incomplete validation runs found (older than 5 hours)"
        echo ""
        echo "ℹ️  Recent running validations (may still be processing):"
        
        # Show recent running validations
        recent_response=$(curl -s \
            -H "apikey: $SUPABASE_ANON_KEY" \
            -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
            -H "Content-Type: application/json" \
            "$SUPABASE_URL/rest/v1/validation_results?or=(validation_status.eq.running,validation_status.eq.queued)&order=created_at.desc&limit=10")
        
        if [ "$recent_response" != "[]" ]; then
            echo "$recent_response" | jq -r '.[] | "  🔄 \(.run_id[0:8])... - \(.organization)/\(.repository_name) (started \(.created_at | split("T")[0]))"'
        else
            echo "  No running validations found."
        fi
        exit 0
    fi
    
    # Process each unique run_id
    run_ids=$(echo "$orphaned_response" | jq -r '.[].run_id' | sort | uniq)
    
    if [ -z "$run_ids" ]; then
        echo "✅ No orphaned runs found"
        exit 0
    fi
    
    for run_id in $run_ids; do
        # Get data for this specific run_id
        run_data=$(echo "$orphaned_response" | jq -r --arg run_id "$run_id" '[.[] | select(.run_id == $run_id)]')
        
        repo_count=$(echo "$run_data" | jq -r '. | length')
        created_at=$(echo "$run_data" | jq -r '.[0].created_at')
        original_prompt=$(echo "$run_data" | jq -r '.[0].original_prompt // "N/A"')
        
        # Clean up the prompt for display (remove carriage returns and newlines, limit length)
        clean_prompt=$(echo "$original_prompt" | tr -d '\r\n' | tr -s ' ')
        
        age=$(format_age "$created_at")
        short_run_id=${run_id:0:8}
        
        echo ""
        echo "📋 Run ID: $short_run_id... ($repo_count repositories, $age old)"
        echo "   Prompt: ${clean_prompt:0:80}..."
        echo "   Created: $created_at"
        echo ""
        echo "   Options:"
        echo "     Continue: make continue RUN_ID=$run_id"
        echo "     Cancel:   make cancel RUN_ID=$run_id"
        echo "     Details:  make query-results RUN_ID=$run_id"
    done
    
    echo ""
    echo "ℹ️  Usage:"
    echo "   Continue specific run:  make continue RUN_ID=your-run-id"
    echo "   Cancel specific run:    make cancel RUN_ID=your-run-id"
    echo "   View run details:       make query-results RUN_ID=your-run-id"
fi 