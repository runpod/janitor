#!/bin/bash

# Simple GPU Instance Launch Script for Janitor Agent
# This replaces the complex Terraform setup with a straightforward approach

set -e

# Load environment variables
if [ -f ".env" ]; then
    source .env
else
    echo "❌ Error: .env file not found. Please copy .env.example to .env and configure it."
    exit 1
fi

# Validate required environment variables
if [ -z "$AWS_PROFILE" ] || [ -z "$AWS_REGION" ] || [ -z "$SSH_KEY_NAME" ]; then
    echo "❌ Error: Required AWS variables not set in .env:"
    echo "  AWS_PROFILE, AWS_REGION, SSH_KEY_NAME"
    exit 1
fi

if [ -z "$SUPABASE_URL" ] || [ -z "$ANTHROPIC_API_KEY" ] || [ -z "$GITHUB_PERSONAL_ACCESS_TOKEN" ]; then
    echo "❌ Error: Required API keys not set in .env:"
    echo "  SUPABASE_URL, ANTHROPIC_API_KEY, GITHUB_PERSONAL_ACCESS_TOKEN"
    exit 1
fi

echo "🚀 Launching Janitor GPU instance..."

# Instance configuration
INSTANCE_TYPE="g5.xlarge"  # GPU instance with 1x NVIDIA A10G
SECURITY_GROUP_NAME="janitor-sg"
INSTANCE_NAME="janitor-gpu-instance"

# Find the latest Ubuntu 22.04 LTS AMI automatically
echo "🔍 Finding latest Ubuntu 22.04 LTS AMI..."
AMI_ID=$(aws ec2 describe-images \
    --owners 099720109477 \
    --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" \
              "Name=state,Values=available" \
    --query "Images | sort_by(@, &CreationDate) | [-1].ImageId" \
    --output text \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" 2>/dev/null)

if [ -z "$AMI_ID" ] || [ "$AMI_ID" = "None" ]; then
    echo "❌ Could not find Ubuntu 22.04 LTS AMI. Using fallback AMI..."
    AMI_ID="ami-0866a3c8686eaeeba"  # Ubuntu 24.04 LTS fallback
fi

echo "✅ Using AMI: $AMI_ID"

# Create security group if it doesn't exist
echo "🔒 Setting up security group..."
aws ec2 describe-security-groups \
    --group-names "$SECURITY_GROUP_NAME" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" >/dev/null 2>&1 || {
    
    echo "Creating security group: $SECURITY_GROUP_NAME"
    aws ec2 create-security-group \
        --group-name "$SECURITY_GROUP_NAME" \
        --description "Security group for Janitor GPU instance" \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION"
    
    # Allow SSH access
    aws ec2 authorize-security-group-ingress \
        --group-name "$SECURITY_GROUP_NAME" \
        --protocol tcp \
        --port 22 \
        --cidr 0.0.0.0/0 \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION"
    
    # Allow HTTP access for Mastra server
    aws ec2 authorize-security-group-ingress \
        --group-name "$SECURITY_GROUP_NAME" \
        --protocol tcp \
        --port 3000 \
        --cidr 0.0.0.0/0 \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION"
        
    echo "✅ Security group created"
}

# Prepare user data with environment variables
echo "📝 Preparing user data script..."
USER_DATA=$(cat infra/user-data.sh | sed \
    -e "s|\${ANTHROPIC_API_KEY}|$ANTHROPIC_API_KEY|g" \
    -e "s|\${GITHUB_PERSONAL_ACCESS_TOKEN}|$GITHUB_PERSONAL_ACCESS_TOKEN|g" \
    -e "s|\${SUPABASE_URL}|$SUPABASE_URL|g" \
    -e "s|\${SUPABASE_ANON_KEY}|$SUPABASE_ANON_KEY|g" \
    -e "s|\${SUPABASE_SERVICE_ROLE_KEY}|$SUPABASE_SERVICE_ROLE_KEY|g")

# Check if instance is already running
echo "🔍 Checking for existing instances..."
EXISTING_INSTANCE=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=$INSTANCE_NAME" "Name=instance-state-name,Values=running,pending" \
    --query "Reservations[0].Instances[0].InstanceId" \
    --output text \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" 2>/dev/null || echo "None")

if [ "$EXISTING_INSTANCE" != "None" ] && [ "$EXISTING_INSTANCE" != "null" ]; then
    echo "⚠️  Instance already running: $EXISTING_INSTANCE"
    
    # Get public IP
    PUBLIC_IP=$(aws ec2 describe-instances \
        --instance-ids "$EXISTING_INSTANCE" \
        --query "Reservations[0].Instances[0].PublicIpAddress" \
        --output text \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION")
    
    echo "🌐 Public IP: $PUBLIC_IP"
    echo "🔗 Mastra API: http://$PUBLIC_IP:3000"
    echo "🔗 SSH: ssh -i $SSH_KEY_PATH ubuntu@$PUBLIC_IP"
    exit 0
fi

# Launch new instance
echo "🖥️  Launching new instance..."
INSTANCE_ID=$(aws ec2 run-instances \
    --image-id "$AMI_ID" \
    --count 1 \
    --instance-type "$INSTANCE_TYPE" \
    --key-name "$SSH_KEY_NAME" \
    --security-groups "$SECURITY_GROUP_NAME" \
    --user-data "$USER_DATA" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$INSTANCE_NAME}]" \
    --query "Instances[0].InstanceId" \
    --output text \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION")

echo "✅ Instance launched: $INSTANCE_ID"
echo "⏳ Waiting for instance to be running..."

# Wait for instance to be running
aws ec2 wait instance-running \
    --instance-ids "$INSTANCE_ID" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION"

# Get public IP
PUBLIC_IP=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --query "Reservations[0].Instances[0].PublicIpAddress" \
    --output text \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION")

echo ""
echo "🎉 Instance is ready!"
echo "📋 Instance ID: $INSTANCE_ID"
echo "🌐 Public IP: $PUBLIC_IP"
echo ""
echo "📊 Streaming environment setup (this will stop automatically when complete):"
echo "────────────────────────────────────────────────────────────────────────"

# Wait a moment for the instance to start user-data script
sleep 10

# Stream the bootstrap logs and wait for completion
ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no ubuntu@"$PUBLIC_IP" '
    echo "🔍 Waiting for environment setup to start..."
    
    # Wait for user-data log to exist
    while [ ! -f /var/log/user-data.log ]; do
        sleep 2
    done
    
    echo "📋 Environment setup started! Streaming progress..."
    echo ""
    
    # Stream logs until we see completion
    tail -f /var/log/user-data.log | while read line; do
        echo "$line"
        
        # Stop when we see the completion message
        if echo "$line" | grep -q "Bootstrap complete! Environment is ready"; then
            echo ""
            echo "✅ Environment setup completed!"
            break
        fi
    done
'

echo ""
echo "────────────────────────────────────────────────────────────────────────"
echo "🚀 Environment ready! Now deploying code..."
echo ""

# Deploy the code automatically
chmod +x scripts/deploy-code.sh
./scripts/deploy-code.sh

echo ""
echo "🎉 Complete setup finished!"
echo "📝 Ready to use:"
echo "   make send-prompt PROMPT=\"validate RunPod/worker-basic\"" 