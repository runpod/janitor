#!/bin/bash

# Stop GPU Instance Script for Janitor Agent
# Use this to save costs when not actively validating repositories

set -e

# Load environment variables
if [ -f ".env" ]; then
    source .env
else
    echo "❌ Error: .env file not found. Please copy .env.example to .env and configure it."
    exit 1
fi

# Validate required environment variables
if [ -z "$AWS_PROFILE" ] || [ -z "$AWS_REGION" ]; then
    echo "❌ Error: Required AWS variables not set in .env:"
    echo "  AWS_PROFILE, AWS_REGION"
    exit 1
fi

echo "🛑 Stopping Janitor GPU instance..."

INSTANCE_NAME="janitor-gpu-instance"

# Find the running instance
echo "🔍 Finding running instance..."
INSTANCE_ID=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=$INSTANCE_NAME" "Name=instance-state-name,Values=running" \
    --query "Reservations[0].Instances[0].InstanceId" \
    --output text \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" 2>/dev/null || echo "None")

if [ "$INSTANCE_ID" = "None" ] || [ "$INSTANCE_ID" = "null" ]; then
    echo "ℹ️  No running instance found with name: $INSTANCE_NAME"
    
    # Check for stopped instances
    STOPPED_INSTANCE=$(aws ec2 describe-instances \
        --filters "Name=tag:Name,Values=$INSTANCE_NAME" "Name=instance-state-name,Values=stopped" \
        --query "Reservations[0].Instances[0].InstanceId" \
        --output text \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" 2>/dev/null || echo "None")
    
    if [ "$STOPPED_INSTANCE" != "None" ] && [ "$STOPPED_INSTANCE" != "null" ]; then
        echo "ℹ️  Instance is already stopped: $STOPPED_INSTANCE"
    else
        echo "ℹ️  No instances found. Use 'make start-instance' to create one."
    fi
    exit 0
fi

echo "📋 Found running instance: $INSTANCE_ID"

# Get current public IP before stopping
PUBLIC_IP=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --query "Reservations[0].Instances[0].PublicIpAddress" \
    --output text \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION")

echo "🌐 Current public IP: $PUBLIC_IP"

# Stop the instance
echo "⏳ Stopping instance..."
aws ec2 stop-instances \
    --instance-ids "$INSTANCE_ID" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" >/dev/null

echo "⏳ Waiting for instance to stop..."
aws ec2 wait instance-stopped \
    --instance-ids "$INSTANCE_ID" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION"

echo ""
echo "✅ Instance stopped successfully!"
echo "📋 Instance ID: $INSTANCE_ID"
echo "💰 The instance is now stopped to save costs."
echo ""
echo "ℹ️  To restart the instance:"
echo "   make start-instance"
echo ""
echo "⚠️  Note: The public IP address will change when you restart the instance."
echo "   Current stopped IP was: $PUBLIC_IP" 