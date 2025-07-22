#!/bin/bash

# Terminate GPU Instance Script for Janitor Agent
# Use this to completely destroy the instance and save costs

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

echo "🗑️  Terminating Janitor GPU instance (complete cleanup)..."

INSTANCE_NAME="janitor-gpu-instance"

# Find any instance (running or stopped)
echo "🔍 Finding instance to terminate..."
INSTANCE_ID=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=$INSTANCE_NAME" "Name=instance-state-name,Values=running,stopped,stopping" \
    --query "Reservations[0].Instances[0].InstanceId" \
    --output text \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" 2>/dev/null || echo "None")

if [ "$INSTANCE_ID" = "None" ] || [ "$INSTANCE_ID" = "null" ]; then
    echo "ℹ️  No instances found to terminate."
    
    # Check for already terminated instances
    TERMINATED_INSTANCE=$(aws ec2 describe-instances \
        --filters "Name=tag:Name,Values=$INSTANCE_NAME" "Name=instance-state-name,Values=terminated" \
        --query "Reservations[0].Instances[0].InstanceId" \
        --output text \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" 2>/dev/null || echo "None")
    
    if [ "$TERMINATED_INSTANCE" != "None" ] && [ "$TERMINATED_INSTANCE" != "null" ]; then
        echo "ℹ️  Previous instance was already terminated: $TERMINATED_INSTANCE"
    else
        echo "ℹ️  No instances exist. Use 'make start' to create one."
    fi
    exit 0
fi

echo "📋 Found instance to terminate: $INSTANCE_ID"

# Get current state and IP before terminating
CURRENT_STATE=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --query "Reservations[0].Instances[0].State.Name" \
    --output text \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION")

PUBLIC_IP=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --query "Reservations[0].Instances[0].PublicIpAddress" \
    --output text \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" 2>/dev/null || echo "None")

echo "🔄 Current state: $CURRENT_STATE"
if [ "$PUBLIC_IP" != "None" ] && [ "$PUBLIC_IP" != "null" ]; then
    echo "🌐 Current IP: $PUBLIC_IP"
fi

# Terminate the instance
echo "⏳ Terminating instance..."
aws ec2 terminate-instances \
    --instance-ids "$INSTANCE_ID" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" >/dev/null

echo "⏳ Waiting for instance to enter terminating state..."
# Wait for terminating state (much faster than waiting for fully terminated)
while true; do
    STATE=$(aws ec2 describe-instances \
        --instance-ids "$INSTANCE_ID" \
        --query "Reservations[0].Instances[0].State.Name" \
        --output text \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION")
    
    if [ "$STATE" = "shutting-down" ] || [ "$STATE" = "terminated" ]; then
        echo "✅ Instance is now in '$STATE' state"
        break
    fi
    
    echo "   Current state: $STATE, waiting..."
    sleep 2
done

echo ""
echo "✅ Instance termination initiated successfully!"
echo "📋 Instance ID: $INSTANCE_ID"
echo "💰 Instance and all associated storage will be destroyed (no ongoing costs)."
echo ""
echo "ℹ️  To launch a fresh instance:"
echo "   make start"
echo ""
echo "ℹ️  To pause instead of terminate next time:"
echo "   make pause" 