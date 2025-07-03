#!/bin/bash
set -euo pipefail

# Simple script to launch a test EC2 instance for Janitor validation
# Use this to test the concept before deploying full infrastructure

# Configuration (update these values)
AWS_PROFILE="${AWS_PROFILE:-runpod-janitor}"
AWS_REGION="${AWS_REGION:-eu-west-2}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.micro}"
KEY_NAME="${KEY_NAME:-}"  # Set to your EC2 key pair name if you want SSH access
ENVIRONMENT="${ENVIRONMENT:-dev}"

# Function for logging
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [LAUNCH] $1"
}

# Check prerequisites
check_prerequisites() {
    log "🔍 Checking prerequisites..."
    
    if ! command -v aws >/dev/null 2>&1; then
        log "❌ AWS CLI not found. Please install AWS CLI first."
        exit 1
    fi
    
    if ! aws sts get-caller-identity --profile "$AWS_PROFILE" >/dev/null 2>&1; then
        log "❌ AWS credentials not configured for profile: $AWS_PROFILE"
        log "   Please configure AWS credentials with: aws configure --profile $AWS_PROFILE"
        exit 1
    fi
    
    log "✅ Prerequisites check passed"
}

# Get the latest Amazon Linux 2 AMI
get_latest_ami() {
    log "🔍 Finding latest Amazon Linux 2 AMI..."
    
    AMI_ID=$(aws ec2 describe-images \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --owners amazon \
        --filters \
            "Name=name,Values=amzn2-ami-hvm-*-x86_64-gp2" \
            "Name=virtualization-type,Values=hvm" \
        --query 'Images|sort_by(@, &CreationDate)[-1].ImageId' \
        --output text)
    
    log "📦 Using AMI: $AMI_ID"
}

# Create security group
create_security_group() {
    log "🔒 Creating security group..."
    
    SG_NAME="janitor-test-sg-$(date +%s)"
    
    SG_ID=$(aws ec2 create-security-group \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --group-name "$SG_NAME" \
        --description "Temporary security group for Janitor testing" \
        --query 'GroupId' \
        --output text)
    
    # Add SSH rule if key name is provided
    if [[ -n "$KEY_NAME" ]]; then
        aws ec2 authorize-security-group-ingress \
            --profile "$AWS_PROFILE" \
            --region "$AWS_REGION" \
            --group-id "$SG_ID" \
            --protocol tcp \
            --port 22 \
            --cidr 0.0.0.0/0
        
        log "🔑 SSH access enabled for key: $KEY_NAME"
    fi
    
    # Add outbound internet access
    aws ec2 authorize-security-group-egress \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --group-id "$SG_ID" \
        --protocol -1 \
        --cidr 0.0.0.0/0 \
        2>/dev/null || true  # May already exist
    
    log "🔒 Security group created: $SG_ID"
}

# Create basic user data script
create_user_data() {
    log "📝 Creating user data script..."
    
    cat > /tmp/janitor-user-data.sh << 'EOF'
#!/bin/bash
set -euo pipefail

# Simple bootstrap script for testing
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [BOOTSTRAP] $1" | tee -a /var/log/janitor-test.log
}

log "🚀 Starting Janitor test instance bootstrap"

# Update system
log "📦 Updating system packages..."
yum update -y

# Install Docker
log "🐳 Installing Docker..."
yum install -y docker git awscli

# Start Docker
log "🚀 Starting Docker service..."
systemctl start docker
systemctl enable docker

# Add ec2-user to docker group
usermod -aG docker ec2-user

# Test Docker installation
log "🧪 Testing Docker installation..."
docker version
docker run --rm hello-world

# Create test report
log "📊 Creating test report..."
mkdir -p /home/ec2-user/reports

cat > /home/ec2-user/reports/bootstrap-test.json << REPORT_EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "instance_id": "$(curl -s http://169.254.169.254/latest/meta-data/instance-id)",
    "instance_type": "$(curl -s http://169.254.169.254/latest/meta-data/instance-type)",
    "region": "$(curl -s http://169.254.169.254/latest/meta-data/placement/region)",
    "status": "success",
    "message": "Bootstrap test completed successfully",
    "docker_version": "$(docker --version)",
    "tests": {
        "docker_hello_world": "passed",
        "system_update": "passed",
        "permissions": "passed"
    }
}
REPORT_EOF

chown ec2-user:ec2-user /home/ec2-user/reports/bootstrap-test.json

log "✅ Bootstrap completed successfully!"
log "📄 Test report created at: /home/ec2-user/reports/bootstrap-test.json"
log "🎉 Instance is ready for Janitor testing!"
EOF
}

# Launch instance
launch_instance() {
    log "🚀 Launching EC2 instance..."
    
    LAUNCH_TEMPLATE_DATA='{
        "ImageId": "'$AMI_ID'",
        "InstanceType": "'$INSTANCE_TYPE'",
        "SecurityGroupIds": ["'$SG_ID'"],
        "UserData": "'$(base64 -i /tmp/janitor-user-data.sh | tr -d '\n')'",
        "TagSpecifications": [
            {
                "ResourceType": "instance",
                "Tags": [
                    {"Key": "Name", "Value": "janitor-test-'$ENVIRONMENT'"},
                    {"Key": "Project", "Value": "janitor-'$ENVIRONMENT'"},
                    {"Key": "Environment", "Value": "'$ENVIRONMENT'"},
                    {"Key": "Purpose", "Value": "testing"}
                ]
            }
        ]'
    
    if [[ -n "$KEY_NAME" ]]; then
        LAUNCH_TEMPLATE_DATA+=',
        "KeyName": "'$KEY_NAME'"'
    fi
    
    LAUNCH_TEMPLATE_DATA+='
    }'
    
    INSTANCE_ID=$(aws ec2 run-instances \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --cli-input-json "$LAUNCH_TEMPLATE_DATA" \
        --query 'Instances[0].InstanceId' \
        --output text)
    
    log "🎯 Instance launched: $INSTANCE_ID"
    
    # Wait for instance to be running
    log "⏳ Waiting for instance to be running..."
    aws ec2 wait instance-running \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --instance-ids "$INSTANCE_ID"
    
    # Get instance details
    INSTANCE_INFO=$(aws ec2 describe-instances \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --instance-ids "$INSTANCE_ID" \
        --query 'Reservations[0].Instances[0]')
    
    PUBLIC_IP=$(echo "$INSTANCE_INFO" | jq -r '.PublicIpAddress // "N/A"')
    PRIVATE_IP=$(echo "$INSTANCE_INFO" | jq -r '.PrivateIpAddress')
    
    log "✅ Instance is running!"
    log "   Instance ID: $INSTANCE_ID"
    log "   Public IP:   $PUBLIC_IP"
    log "   Private IP:  $PRIVATE_IP"
    log "   Region:      $AWS_REGION"
    
    if [[ -n "$KEY_NAME" && "$PUBLIC_IP" != "N/A" ]]; then
        log "🔑 SSH Command: ssh -i ~/.ssh/$KEY_NAME.pem ec2-user@$PUBLIC_IP"
    fi
}

# Main execution
main() {
    log "🤖 Janitor AWS Test Instance Launcher"
    log "   Profile:  $AWS_PROFILE"
    log "   Region:   $AWS_REGION" 
    log "   Type:     $INSTANCE_TYPE"
    log "   Key:      ${KEY_NAME:-None}"
    
    check_prerequisites
    get_latest_ami
    create_security_group
    create_user_data
    launch_instance
    
    log "🎉 Instance launch completed successfully!"
    log ""
    log "📋 Next steps:"
    log "   1. Wait 2-3 minutes for bootstrap to complete"
    log "   2. Check CloudWatch logs (if configured)"
    if [[ -n "$KEY_NAME" && "$PUBLIC_IP" != "N/A" ]]; then
        log "   3. SSH to instance: ssh -i ~/.ssh/$KEY_NAME.pem ec2-user@$PUBLIC_IP"
        log "   4. Check test report: cat ~/reports/bootstrap-test.json"
    fi
    log "   5. Terminate instance when done: aws ec2 terminate-instances --instance-ids $INSTANCE_ID"
    log ""
    log "🗑️  Cleanup command:"
    log "   aws ec2 terminate-instances --profile $AWS_PROFILE --region $AWS_REGION --instance-ids $INSTANCE_ID"
    log "   aws ec2 delete-security-group --profile $AWS_PROFILE --region $AWS_REGION --group-id $SG_ID"
}

# Run main function
main "$@" 