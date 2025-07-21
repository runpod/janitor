#!/bin/bash

# Show Real-time Janitor Agent Logs
# Stream the janitor-mastra service logs to see what the agent is currently doing

set -e

# Load environment variables
if [ -f ".env" ]; then
    source .env
else
    echo "❌ Error: .env file not found. Please copy .env.example to .env and configure it."
    exit 1
fi

# Validate required environment variables
if [ -z "$AWS_PROFILE" ] || [ -z "$AWS_REGION" ] || [ -z "$SSH_KEY_PATH" ]; then
    echo "❌ Error: Required AWS variables not set in .env:"
    echo "  AWS_PROFILE, AWS_REGION, SSH_KEY_PATH"
    exit 1
fi

INSTANCE_NAME="janitor-gpu-instance"

echo "📊 Finding running instance..."

# Find the running instance
INSTANCE_ID=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=$INSTANCE_NAME" "Name=instance-state-name,Values=running" \
    --query "Reservations[0].Instances[0].InstanceId" \
    --output text \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" 2>/dev/null || echo "None")

if [ "$INSTANCE_ID" = "None" ] || [ "$INSTANCE_ID" = "null" ]; then
    echo "❌ Error: No running instance found with name: $INSTANCE_NAME"
    echo "Please start the instance first: make start"
    exit 1
fi

# Get public IP
PUBLIC_IP=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --query "Reservations[0].Instances[0].PublicIpAddress" \
    --output text \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION")

echo "📋 Instance ID: $INSTANCE_ID"
echo "🌐 Public IP: $PUBLIC_IP"
echo ""
echo "🔄 Streaming real-time logs from janitor-mastra service..."
echo "📝 Look for validation progress, repository processing, and results"
echo "────────────────────────────────────────────────────────────────────────"
echo ""

# Stream the logs with proper formatting
ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no ubuntu@"$PUBLIC_IP" '
    # Show last 50 entries and follow new ones
    sudo journalctl -u janitor-mastra -n 50 -f --no-pager | \
    while IFS= read -r line; do
        # Add some color/formatting to important messages
        if echo "$line" | grep -q "Starting validation\|Completed validation\|✅\|❌\|🎉"; then
            echo "🔸 $line"
        elif echo "$line" | grep -q "ERROR\|Failed\|Error"; then
            echo "❌ $line"
        elif echo "$line" | grep -q "Building\|Running\|Installing"; then
            echo "⚙️  $line"
        else
            echo "   $line"
        fi
    done
' 