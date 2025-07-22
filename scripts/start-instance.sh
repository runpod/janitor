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

# Set SSH_KEY_PATH default if not provided
if [ -z "$SSH_KEY_PATH" ]; then
    SSH_KEY_PATH="~/.ssh/janitor-key"
    echo "ℹ️  Using default SSH key path: $SSH_KEY_PATH"
fi

# Expand tilde in SSH_KEY_PATH
SSH_KEY_PATH="${SSH_KEY_PATH/#\~/$HOME}"

# Verify SSH key exists
if [ ! -f "$SSH_KEY_PATH" ]; then
    echo "❌ Error: SSH key file not found: $SSH_KEY_PATH"
    echo "Please ensure your SSH key is properly configured in .env:"
    echo "  SSH_KEY_PATH=/path/to/your/key.pem"
    exit 1
fi

echo "🚀 Launching Janitor GPU instance..."

# Instance configuration
INSTANCE_TYPE="g5.xlarge"  # GPU instance with 1x NVIDIA A10G
SECURITY_GROUP_NAME="janitor-sg"
INSTANCE_NAME="janitor-gpu-instance"

# Use Deep Learning AMI with NVIDIA drivers and CUDA pre-installed
echo "🔍 Finding latest Deep Learning AMI (GPU optimized)..."
AMI_ID=$(aws ec2 describe-images \
    --owners amazon \
    --filters "Name=name,Values=Deep Learning AMI GPU PyTorch*Ubuntu*" \
              "Name=state,Values=available" \
    --query "Images | sort_by(@, &CreationDate) | [-1].ImageId" \
    --output text \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" 2>/dev/null)

if [ -z "$AMI_ID" ] || [ "$AMI_ID" = "None" ]; then
    echo "⚠️  Deep Learning AMI not found, trying alternative..."
    # Fallback to NVIDIA Deep Learning AMI
    AMI_ID=$(aws ec2 describe-images \
        --owners amazon \
        --filters "Name=name,Values=Deep Learning AMI*" \
                  "Name=state,Values=available" \
                  "Name=architecture,Values=x86_64" \
        --query "Images | sort_by(@, &CreationDate) | [-1].ImageId" \
        --output text \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" 2>/dev/null)
fi

if [ -z "$AMI_ID" ] || [ "$AMI_ID" = "None" ]; then
    echo "❌ Could not find Deep Learning AMI. Using known working AMI as fallback..."
    # Known working Deep Learning AMI (update this periodically)
    AMI_ID="ami-0c2b8ca1dad447f8a"  # Deep Learning AMI GPU PyTorch 2.0.1 (Ubuntu 20.04)
fi

echo "✅ Using GPU-ready AMI: $AMI_ID"
echo "   This AMI includes: NVIDIA drivers, CUDA, Docker GPU support"

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
echo "🖥️  Launching new instance with 300GB storage..."
INSTANCE_ID=$(aws ec2 run-instances \
    --image-id "$AMI_ID" \
    --count 1 \
    --instance-type "$INSTANCE_TYPE" \
    --key-name "$SSH_KEY_NAME" \
    --security-groups "$SECURITY_GROUP_NAME" \
    --user-data "$USER_DATA" \
    --block-device-mappings '[{
        "DeviceName": "/dev/sda1",
        "Ebs": {
            "VolumeSize": 300,
            "VolumeType": "gp3",
            "DeleteOnTermination": true,
            "Encrypted": false
        }
    }]' \
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

# Wait for SSH to become available (Deep Learning AMI takes longer to boot)
echo "⏳ Waiting for SSH to become available..."
SSH_READY=false
for i in {1..30}; do
    if ssh -i "$SSH_KEY_PATH" -o ConnectTimeout=10 -o StrictHostKeyChecking=no ubuntu@"$PUBLIC_IP" "echo 'SSH ready'" >/dev/null 2>&1; then
        SSH_READY=true
        echo "✅ SSH connection established!"
        break
    else
        # Show progress without spam
        if [ $((i % 5)) -eq 0 ]; then
            echo "   Still waiting... ($i/30 attempts)"
        fi
        sleep 10
    fi
done

if [ "$SSH_READY" = false ]; then
    echo "❌ Error: SSH connection failed after 5 minutes"
    echo "🔧 Debug steps:"
    echo "   1. Check security group allows SSH (port 22): aws ec2 describe-security-groups --group-names janitor-sg --profile $AWS_PROFILE --region $AWS_REGION"
    echo "   2. Verify SSH key: ls -la $SSH_KEY_PATH"
    echo "   3. Try manual SSH: ssh -i $SSH_KEY_PATH ubuntu@$PUBLIC_IP"
    echo "   4. Check instance logs: aws logs describe-log-streams --log-group-name /aws/ec2/user-data --profile $AWS_PROFILE --region $AWS_REGION"
    exit 1
fi

echo ""
echo "📊 Streaming environment setup (this will stop automatically when complete):"
echo "────────────────────────────────────────────────────────────────────────"

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
echo "   make prompt PROMPT=\"validate RunPod/worker-basic\"" 