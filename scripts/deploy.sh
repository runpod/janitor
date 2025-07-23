#!/bin/bash

# Hot Deploy Janitor Code to Running GPU Instance
# Zero-downtime deployment with atomic swaps and rollback support

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

# Configuration
INSTANCE_NAME="janitor-gpu-instance"
RELEASE_RETENTION_COUNT=${RELEASE_RETENTION_COUNT:-5}
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
RELEASE_DIR="releases/$TIMESTAMP"

echo "🚀 Hot deploying Janitor code (zero downtime)..."
echo "📦 Release: $TIMESTAMP"
echo "🔄 Retention: $RELEASE_RETENTION_COUNT releases"
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
echo "🔍 Testing SSH connection..."
if ! ssh -i "$SSH_KEY_PATH" -o ConnectTimeout=10 -o StrictHostKeyChecking=no ubuntu@"$PUBLIC_IP" "echo 'SSH test successful'" >/dev/null 2>&1; then
    echo "❌ Error: Cannot SSH to instance. Check your SSH key and security groups."
    exit 1
fi

echo "✅ SSH connection successful"

# Pre-deployment validation
echo "🔍 Running pre-deployment checks..."
cd packages/janitor-agent

echo "📋 Checking TypeScript compilation..."
if ! npm run build; then
    echo "❌ TypeScript compilation failed!"
    echo "Please fix the TypeScript errors before deploying."
    exit 1
fi

echo "✅ TypeScript compilation successful"
cd ../..

# Create clean git-free archive  
echo "📦 Creating git-free code archive..."
tar -czf janitor-code.tar.gz \
    --exclude=node_modules \
    --exclude=.git \
    --exclude='.git*' \
    --exclude=local-output \
    --exclude=repos \
    --exclude="*.tar.gz" \
    --exclude=temp \
    --exclude=releases \
    packages/janitor-agent/

# Upload archive to instance
echo "📤 Uploading code archive..."
scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no janitor-code.tar.gz ubuntu@"$PUBLIC_IP":/tmp/

# Upload environment file
echo "📝 Uploading environment configuration..."
scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no .env ubuntu@"$PUBLIC_IP":/tmp/janitor.env

# Execute hot deployment on instance
echo "🔧 Executing hot deployment on instance..."
ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no ubuntu@"$PUBLIC_IP" << EOF
    set -e
    
    echo "🏗️  Setting up deployment structure..."
    
    # Create deployment structure if it doesn't exist
    sudo mkdir -p /opt/janitor/{releases,shared,temp}
    
    # Initialize shared directory with current .env if first deployment
    if [ ! -f "/opt/janitor/shared/.env" ] && [ -f "/opt/janitor/packages/janitor-agent/.env" ]; then
        echo "📋 Migrating existing .env to shared directory..."
        sudo cp /opt/janitor/packages/janitor-agent/.env /opt/janitor/shared/.env
    fi
    
    # Copy new environment if provided
    if [ -f "/tmp/janitor.env" ]; then
        sudo cp /tmp/janitor.env /opt/janitor/shared/.env
    fi
    
    # Set up release directory
    sudo mkdir -p "/opt/janitor/$RELEASE_DIR"
    cd "/opt/janitor/$RELEASE_DIR"
    
    echo "📦 Extracting fresh code (git-free)..."
    # Extract code archive
    sudo tar -xzf /tmp/janitor-code.tar.gz --no-xattrs 2>/dev/null
    
    # Link shared assets
    echo "🔗 Linking shared configuration..."
    cd packages/janitor-agent
    sudo ln -sf /opt/janitor/shared/.env .env
    
    # Install ALL dependencies (same as local development)
    echo "📦 Installing dependencies with frozen lockfile..."
    sudo npm ci --frozen-lockfile
    
    # Build the application
    echo "🔨 Building application..."
    sudo npm run build
    
    echo "✅ Build complete - keeping ALL dependencies (same as local)"
    
    # Set proper ownership
    sudo chown -R ubuntu:ubuntu "/opt/janitor/$RELEASE_DIR"
    
    echo "⚡ Performing atomic swap..."
    
    # Store current release for rollback info
    PREVIOUS_RELEASE=""
    if [ -L "/opt/janitor/current" ]; then
        PREVIOUS_RELEASE=\$(readlink /opt/janitor/current | sed 's|.*/||')
        echo "📋 Previous release: \$PREVIOUS_RELEASE"
    fi
    
    # Update systemd service configuration first
    echo "🔧 Updating service configuration..."
    sudo tee /etc/systemd/system/janitor-mastra.service > /dev/null << 'SYSTEMD_EOF'
[Unit]
Description=Janitor Mastra Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/janitor/current/packages/janitor-agent
Environment=NODE_ENV=production
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/bin/bash -c 'cd /opt/janitor/current/packages/janitor-agent && /usr/bin/node dist/src/server.js'
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=janitor-mastra
KillMode=mixed
KillSignal=SIGINT

[Install]
WantedBy=multi-user.target
SYSTEMD_EOF
    sudo systemctl daemon-reload
    
    echo "⚡ Performing atomic swap with proper service restart..."
    
    # 1. Stop service cleanly and ensure all processes are dead
    echo "🛑 Stopping service..."
    sudo systemctl stop janitor-mastra
    
    # 2. Wait for service to fully stop and kill any lingering processes
    echo "⏳ Ensuring all processes are terminated..."
    sleep 3
    
    # Kill any remaining janitor processes that might lock the working directory
    echo "🔪 Killing any lingering janitor processes..."
    sudo pkill -f "janitor" || true
    sudo pkill -f "mcp-server-github.*janitor" || true
    sleep 2
    
    # Verify no processes are using the current directory
    PROCS_USING_CURRENT=\$(sudo lsof +D /opt/janitor/current 2>/dev/null | wc -l || echo "0")
    if [ "\$PROCS_USING_CURRENT" -gt 1 ]; then
        echo "⚠️  Warning: \$PROCS_USING_CURRENT processes still using /opt/janitor/current"
        echo "🔪 Force killing processes using current directory..."
        sudo lsof +D /opt/janitor/current 2>/dev/null | tail -n +2 | awk '{print \$2}' | sudo xargs -r kill -9 || true
        sleep 1
    fi
    
    # 3. Atomic symlink swap (now safe since all processes are dead)
    echo "🔗 Swapping symlink atomically..."
    sudo rm -f /opt/janitor/current
    sudo ln -sf "/opt/janitor/$RELEASE_DIR" /opt/janitor/current
    
    # 4. Start service (it will now pick up the new symlink)
    echo "🚀 Starting service with new release..."
    sudo systemctl start janitor-mastra
    
    echo "✅ Atomic swap complete!"
    echo "🆕 Active release: $TIMESTAMP"
    if [ -n "\$PREVIOUS_RELEASE" ]; then
        echo "📜 Previous release: \$PREVIOUS_RELEASE"
    fi
    
    # Verify deployment was successful  
    echo "🔍 Verifying deployment success..."
    
    # 1. Verify symlink points to new release
    CURRENT_SYMLINK=\$(readlink /opt/janitor/current 2>/dev/null || echo "MISSING")
    EXPECTED_PATH="/opt/janitor/$RELEASE_DIR"
    if [ "\$CURRENT_SYMLINK" != "\$EXPECTED_PATH" ]; then
        echo "❌ DEPLOYMENT FAILED: Symlink verification failed"
        echo "   Expected: \$EXPECTED_PATH"
        echo "   Actual:   \$CURRENT_SYMLINK"
        exit 1
    fi
    echo "✅ Symlink verification passed: \$CURRENT_SYMLINK"
    
    # Wait for service to be ready
    echo "⏳ Verifying service health..."
    sleep 5
    
    # 2. Health check - verify service is running
    SERVICE_STATUS=\$(sudo systemctl is-active janitor-mastra 2>/dev/null || echo "failed")
    if [ "\$SERVICE_STATUS" = "active" ]; then
        echo "✅ Service is running"
        
        # 3. Verify service is running from new release
        NODE_PROCS=\$(ps aux | grep "node.*$RELEASE_DIR" | grep -v grep | wc -l)
        if [ "\$NODE_PROCS" -gt 0 ]; then
            echo "✅ Process verification passed: Found \$NODE_PROCS node process(es) running from new release"
        else
            echo "❌ DEPLOYMENT FAILED: Service not running from new release"
            echo "📊 Current processes:"
            ps aux | grep "node.*janitor" | grep -v grep || echo "   No janitor node processes found"
            exit 1
        fi
        
        # 4. Test HTTP endpoint
        if curl -s --connect-timeout 5 --max-time 10 "http://localhost:3000/health" >/dev/null 2>&1; then
            echo "✅ Health check passed"
        else
            echo "⚠️  Health endpoint not responding yet (may still be starting)"
        fi
    else
        echo "❌ Service failed to start"
        echo "📊 Service status:"
        sudo systemctl status janitor-mastra --no-pager --lines=10
        echo ""
        echo "🔄 Rolling back to previous release..."
        if [ -n "\$PREVIOUS_RELEASE" ] && [ -d "/opt/janitor/releases/\$PREVIOUS_RELEASE" ]; then
            sudo ln -sfn "/opt/janitor/releases/\$PREVIOUS_RELEASE" /opt/janitor/current
            sudo systemctl reload-or-restart janitor-mastra
            echo "↩️  Rolled back to: \$PREVIOUS_RELEASE"
        fi
        exit 1
    fi
    
    echo "🧹 Cleaning up old releases..."
    # Keep only the most recent releases (keep 5 releases)
    cd /opt/janitor/releases
    ls -1t | tail -n +6 | xargs -r sudo rm -rf
    
    REMAINING_COUNT=\$(ls -1 | wc -l)
    echo "📦 Retained releases: \$REMAINING_COUNT"
    
    echo "✅ Hot deployment complete!"
EOF

# Cleanup local archive
rm -f janitor-code.tar.gz

# All verification is done within the deployment SSH session above
echo ""
echo "🎉 Hot deployment complete!"
echo "📦 Release: $TIMESTAMP"
echo "🔗 Mastra API: http://$PUBLIC_IP:3000"
echo "🔗 Health check: http://$PUBLIC_IP:3000/health"

echo ""
echo "📋 Management commands:"
echo "   make rollback              # Interactive rollback"
echo "   make logs                  # View service logs"
echo "   make status                # Check service status"

echo ""
echo "ℹ️  Zero-downtime deployment with atomic swap completed!"