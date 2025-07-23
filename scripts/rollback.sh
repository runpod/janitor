#!/bin/bash

# Rollback Janitor to Previous Release
# Zero-downtime rollback with release selection

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
TARGET_RELEASE="$1"

echo "↩️  Janitor Release Rollback"
echo ""

# Find the running instance
echo "🔍 Finding running instance..."
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

# Check SSH connectivity
if ! ssh -i "$SSH_KEY_PATH" -o ConnectTimeout=10 -o StrictHostKeyChecking=no ubuntu@"$PUBLIC_IP" "echo 'SSH test successful'" >/dev/null 2>&1; then
    echo "❌ Error: Cannot SSH to instance. Check your SSH key and security groups."
    exit 1
fi

# Get available releases and current release
echo "📦 Getting release information..."
RELEASE_INFO=$(ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no ubuntu@"$PUBLIC_IP" << 'EOF'
    # Get current release
    CURRENT=""
    if [ -L "/opt/janitor/current" ]; then
        CURRENT=$(readlink /opt/janitor/current | sed 's|.*/||')
    fi
    
    # Get available releases
    RELEASES=""
    if [ -d "/opt/janitor/releases" ]; then
        RELEASES=$(ls -1t /opt/janitor/releases 2>/dev/null || echo "")
    fi
    
    echo "CURRENT:$CURRENT"
    echo "RELEASES:$RELEASES"
EOF
)

CURRENT_RELEASE=$(echo "$RELEASE_INFO" | grep "^CURRENT:" | cut -d: -f2)
AVAILABLE_RELEASES=$(echo "$RELEASE_INFO" | grep "^RELEASES:" | cut -d: -f2-)

if [ -z "$AVAILABLE_RELEASES" ]; then
    echo "❌ No releases found. Deploy first with: make deploy"
    exit 1
fi

echo "🆕 Current release: ${CURRENT_RELEASE:-none}"
echo ""

# If no target release specified, show interactive selection
if [ -z "$TARGET_RELEASE" ]; then
    echo "📋 Available releases (newest first):"
    echo ""
    
    counter=1
    for release in $AVAILABLE_RELEASES; do
        status=""
        if [ "$release" = "$CURRENT_RELEASE" ]; then
            status=" (current)"
        fi
        echo "  $counter) $release$status"
        counter=$((counter + 1))
    done
    
    echo ""
    echo "💡 Usage:"
    echo "  make rollback RELEASE=20250103-143022    # Rollback to specific release"
    echo "  make rollback                            # Interactive selection (this view)"
    echo ""
    echo "🔧 Select a release number or use RELEASE parameter"
    exit 0
fi

# Validate target release exists
if ! echo "$AVAILABLE_RELEASES" | grep -q "^$TARGET_RELEASE$"; then
    echo "❌ Error: Release '$TARGET_RELEASE' not found"
    echo ""
    echo "📋 Available releases:"
    for release in $AVAILABLE_RELEASES; do
        echo "  - $release"
    done
    exit 1
fi

# Check if target is already current
if [ "$TARGET_RELEASE" = "$CURRENT_RELEASE" ]; then
    echo "ℹ️  Release '$TARGET_RELEASE' is already active"
    exit 0
fi

echo "↩️  Rolling back to: $TARGET_RELEASE"
echo "📋 Current release: $CURRENT_RELEASE"
echo ""

# Confirm rollback
echo "⚠️  This will switch the active release. Continue? (y/N)"
read -r confirmation
if [[ ! "$confirmation" =~ ^[Yy]$ ]]; then
    echo "❌ Rollback cancelled"
    exit 0
fi

# Perform rollback
echo "🔄 Performing rollback..."
ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no ubuntu@"$PUBLIC_IP" << EOF
    set -e
    
    echo "⚡ Performing atomic rollback..."
    
    # Atomic symlink swap
    sudo ln -sfn "/opt/janitor/releases/$TARGET_RELEASE" /opt/janitor/current.tmp
    sudo mv /opt/janitor/current.tmp /opt/janitor/current
    
    echo "🔄 Reloading service (zero downtime)..."
    
    # Graceful reload
    sudo systemctl reload-or-restart janitor-mastra
    
    echo "⏳ Verifying service health..."
    sleep 3
    
    # Health check
    SERVICE_STATUS=\$(sudo systemctl is-active janitor-mastra 2>/dev/null || echo "failed")
    if [ "\$SERVICE_STATUS" = "active" ]; then
        echo "✅ Service is running"
        
        # Test HTTP endpoint
        if curl -s --connect-timeout 5 --max-time 10 "http://localhost:3000/health" >/dev/null 2>&1; then
            echo "✅ Health check passed"
        else
            echo "⚠️  Health endpoint not responding yet (may still be starting)"
        fi
    else
        echo "❌ Service failed to start after rollback"
        sudo systemctl status janitor-mastra --no-pager --lines=10
        exit 1
    fi
    
    echo "✅ Rollback complete!"
EOF

# Final verification
echo ""
echo "🔍 Final verification..."
sleep 2

SERVICE_STATUS=$(ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no ubuntu@"$PUBLIC_IP" 'sudo systemctl is-active janitor-mastra' 2>/dev/null || echo "unknown")

if [ "$SERVICE_STATUS" = "active" ]; then
    echo "✅ Service is running"
    
    if curl -s --connect-timeout 5 --max-time 10 "http://$PUBLIC_IP:3000/health" >/dev/null 2>&1; then
        echo "✅ API endpoint responding"
    else
        echo "⚠️  API endpoint not responding yet"
    fi
else
    echo "❌ Service verification failed"
fi

echo ""
echo "🎉 Rollback complete!"
echo "↩️  Active release: $TARGET_RELEASE"
echo "🔗 Mastra API: http://$PUBLIC_IP:3000"
echo "🔗 Health check: http://$PUBLIC_IP:3000/health"
echo ""
echo "ℹ️  Zero-downtime rollback completed!" 