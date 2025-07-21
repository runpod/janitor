#!/bin/bash

# Deploy Janitor Code Updates to Running GPU Instance
# Use this to update code on an existing instance (not needed for initial setup)

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

echo "🚀 Deploying Janitor code to GPU instance..."

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

# Check if we can SSH to the instance
echo "🔍 Testing SSH connection..."
if ! ssh -i "$SSH_KEY_PATH" -o ConnectTimeout=10 -o StrictHostKeyChecking=no ubuntu@"$PUBLIC_IP" "echo 'SSH test successful'" >/dev/null 2>&1; then
    echo "❌ Error: Cannot SSH to instance. Check your SSH key and security groups."
    exit 1
fi

echo "✅ SSH connection successful"

# Create archive of the current code
echo "📦 Creating code archive..."
tar -czf janitor-code.tar.gz \
    --exclude=node_modules \
    --exclude=.git \
    --exclude=local-output \
    --exclude=repos \
    --exclude="*.tar.gz" \
    packages/janitor-agent/

# Copy code to instance
echo "📤 Uploading code to instance..."
scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no janitor-code.tar.gz ubuntu@"$PUBLIC_IP":/tmp/

# Copy the existing .env file directly  
echo "📝 Uploading environment configuration..."
scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no .env ubuntu@"$PUBLIC_IP":/tmp/janitor.env

# Deploy on instance
echo "🔧 Deploying code on instance..."
ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no ubuntu@"$PUBLIC_IP" << 'EOF'
    # Stop the service if running
    sudo systemctl stop janitor-mastra || true
    
    # Create deployment directory
    sudo mkdir -p /opt/janitor
    cd /opt/janitor
    
    # Extract new code
    sudo tar -xzf /tmp/janitor-code.tar.gz
    
    # Install dependencies
    cd packages/janitor-agent
    sudo npm install
    
    # Copy the environment file
    sudo cp /tmp/janitor.env .env
    
    # Set ownership
    sudo chown -R ubuntu:ubuntu /opt/janitor
    
    # Start the service
    sudo systemctl start janitor-mastra
    sudo systemctl enable janitor-mastra
    
    echo "✅ Deployment complete!"
EOF

# Cleanup local archive
rm -f janitor-code.tar.gz

# Wait a moment and check service status
echo "⏳ Checking service status..."
sleep 5

ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no ubuntu@"$PUBLIC_IP" "sudo systemctl status janitor-mastra --no-pager" || true

echo ""
echo "🎉 Code deployment complete!"
echo "🔗 Mastra API: http://$PUBLIC_IP:3000"
echo "🔗 Health check: http://$PUBLIC_IP:3000/health"
echo ""
echo "ℹ️  This updates an existing instance. For fresh instances, use 'make start' instead."
echo "🔧 To check logs: ssh -i $SSH_KEY_PATH ubuntu@$PUBLIC_IP 'sudo journalctl -u janitor-mastra -f'"
echo "🔄 To restart service: ssh -i $SSH_KEY_PATH ubuntu@$PUBLIC_IP 'sudo systemctl restart janitor-mastra'" 