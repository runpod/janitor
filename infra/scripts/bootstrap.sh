#!/bin/bash
set -euo pipefail

# Bootstrap script for Janitor EC2 instance
# This script is executed as user data when the instance starts

# Variables passed from Terraform template
REGION="${region}"
ENVIRONMENT="${environment}"
ECR_REPOSITORY="${ecr_repository}"
S3_BUCKET="${s3_bucket}"
LOG_GROUP="${log_group}"
ACCOUNT_ID="${account_id}"

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [BOOTSTRAP] $1" | tee -a /var/log/janitor-bootstrap.log
}

log "Starting Janitor instance bootstrap for environment: $ENVIRONMENT"

# Update system
log "Updating system packages..."
yum update -y

# Install necessary packages
log "Installing required packages..."
yum install -y \
    docker \
    awscli \
    amazon-cloudwatch-agent \
    jq \
    git \
    at

# Install Docker Compose
log "Installing Docker Compose..."
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Start and enable Docker
log "Starting Docker service..."
systemctl start docker
systemctl enable docker

# Add ec2-user to docker group
usermod -aG docker ec2-user

# Install SSM Agent (usually pre-installed on Amazon Linux 2)
log "Ensuring SSM Agent is running..."
yum install -y amazon-ssm-agent
systemctl start amazon-ssm-agent
systemctl enable amazon-ssm-agent

# Start at daemon for scheduled commands
systemctl start atd
systemctl enable atd

# Configure CloudWatch Agent
log "Configuring CloudWatch agent..."
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << EOF
{
    "logs": {
        "logs_collected": {
            "files": {
                "collect_list": [
                    {
                        "file_path": "/var/log/janitor-bootstrap.log",
                        "log_group_name": "$LOG_GROUP",
                        "log_stream_name": "{instance_id}/bootstrap",
                        "timezone": "UTC"
                    },
                    {
                        "file_path": "/var/log/janitor-runner.log",
                        "log_group_name": "$LOG_GROUP",
                        "log_stream_name": "{instance_id}/janitor-run",
                        "timezone": "UTC"
                    },
                    {
                        "file_path": "/var/log/docker.log",
                        "log_group_name": "$LOG_GROUP",
                        "log_stream_name": "{instance_id}/docker",
                        "timezone": "UTC"
                    }
                ]
            }
        }
    }
}
EOF

# Start CloudWatch agent
systemctl start amazon-cloudwatch-agent
systemctl enable amazon-cloudwatch-agent

# Skip Docker configuration - use defaults
log "Skipping Docker logging configuration (using defaults)..."

# Wait for Docker to be ready (shorter timeout since no restart)
log "Waiting for Docker to be ready..."
for i in {1..30}; do
    if docker info >/dev/null 2>&1; then
        log "SUCCESS: Docker is ready after $i seconds"
        break
    fi
    if [ $i -eq 30 ]; then
        log "ERROR: Docker failed to start after 30 seconds"
        log "Docker service status:"
        systemctl status docker
        log "Docker logs:"
        journalctl -u docker --no-pager -n 20
        exit 1
    fi
    sleep 1
done

# Create janitor working directory
log "Creating janitor working directory..."
mkdir -p /opt/janitor/repos /opt/janitor/reports
chown ec2-user:ec2-user /opt/janitor

# Create repository configuration (using the actual content from infra/repos.yaml)
log "Creating repository configuration..."
cat > /opt/janitor/repos/repos.yaml << 'EOF'
# Repository list for Janitor cloud runner
# This file specifies which repositories should be processed by the Janitor

repositories:
    # Example RunPod worker repositories
    - name: "worker-basic"
      url: "https://github.com/TimPietrusky/worker-basic"
      description: "Basic RunPod worker template"
      priority: "high"

# Configuration settings
config:
    # Maximum number of repositories to process in parallel
    max_parallel: 1

    # Timeout for each repository processing (in minutes)
    timeout_minutes: 30

    # Whether to create pull requests for fixes
    create_pull_requests: true

    # S3 prefix for storing reports
    report_prefix: "reports"

    # Log level (debug, info, warn, error)
    log_level: "info"
EOF

chown ec2-user:ec2-user /opt/janitor/repos/repos.yaml

# Create helper scripts
log "Creating helper scripts..."

# Script to authenticate with ECR
cat > /opt/janitor/ecr-login.sh << 'EOF'
#!/bin/bash
set -euo pipefail

REGION="${region}"
ACCOUNT_ID="${account_id}"

echo "Logging into ECR..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com
EOF

# Script to run Janitor
cat > /opt/janitor/run-janitor.sh << 'EOF'
#!/bin/bash
set -euo pipefail

# Configuration
REGION="${region}"
ENVIRONMENT="${environment}"
ECR_REPOSITORY="${ecr_repository}"
S3_BUCKET="${s3_bucket}"
LOG_GROUP="${log_group}"
ACCOUNT_ID="${account_id}"

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [JANITOR] $1" | tee -a /var/log/janitor-runner.log
}

log "Starting Janitor run for environment: $ENVIRONMENT"

# Set repository file location
export REPOS_FILE="/app/repos/repos.yaml"

# Login to ECR
log "Authenticating with ECR..."
/opt/janitor/ecr-login.sh

# Pull latest Janitor image
log "Pulling Janitor image from ECR..."
docker pull $ECR_REPOSITORY:latest

# Check if Docker is working
log "Testing Docker installation..."
docker version
docker info

# Test basic Docker functionality
log "Running Docker hello-world test..."
if docker run --rm hello-world; then
            log "SUCCESS: Docker is working correctly"
    else
        log "ERROR: Docker test failed"
    exit 1
fi

# Check GPU availability (will show "No GPU available" on non-GPU instances)
log "Checking GPU availability..."
if command -v nvidia-smi >/dev/null 2>&1; then
    nvidia-smi
    log "SUCCESS: GPU detected"
else
    log "INFO: No GPU available (this is expected for t3.micro instances)"
fi

# Run actual Janitor execution with Docker-in-Docker support
log "Running Janitor container with Docker-in-Docker..."
docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v /opt/janitor/repos:/app/repos \
    -v /opt/janitor/reports:/app/reports \
    -v /home/ec2-user/.aws:/root/.aws:ro \
    -e AWS_REGION=$REGION \
    -e AWS_DEFAULT_REGION=$REGION \
    -e S3_BUCKET=$S3_BUCKET \
    -e ENVIRONMENT=$ENVIRONMENT \
    -e REPOS_FILE=$REPOS_FILE \
    -e LOG_GROUP=$LOG_GROUP \
    -e ACCOUNT_ID=$ACCOUNT_ID \
    $ECR_REPOSITORY:latest \
    main

# Create a dummy report for testing
log "Creating test report..."
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
REPORT_FILE="/tmp/janitor-report-$TIMESTAMP.json"

cat > $REPORT_FILE << REPORT_EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "environment": "$ENVIRONMENT",
    "instance_id": "$(curl -s http://169.254.169.254/latest/meta-data/instance-id)",
    "instance_type": "$(curl -s http://169.254.169.254/latest/meta-data/instance-type)",
    "region": "$REGION",
    "status": "success",
    "message": "Bootstrap test completed successfully",
    "docker_version": "$(docker --version)",
    "gpu_available": $(command -v nvidia-smi >/dev/null 2>&1 && echo "true" || echo "false"),
    "tests": {
        "docker_hello_world": "passed",
        "ecr_authentication": "passed",
        "container_pull": "passed"
    }
}
REPORT_EOF

# Upload report to S3
log "Uploading report to S3..."
aws s3 cp $REPORT_FILE s3://$S3_BUCKET/reports/test-run-$TIMESTAMP.json
log "SUCCESS: Report uploaded successfully"

log "SUCCESS: Janitor test run completed successfully!"

# Optional: Auto-shutdown after completion (uncomment for production)
# log "Shutting down instance after completion..."
# sleep 30
# shutdown -h now
EOF

# Make scripts executable
chmod +x /opt/janitor/*.sh
chown ec2-user:ec2-user /opt/janitor/*.sh

# Create systemd service for Janitor (optional, for automatic runs)
log "Creating Janitor systemd service..."
cat > /etc/systemd/system/janitor-runner.service << 'EOF'
[Unit]
Description=Janitor Runner Service
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
User=ec2-user
ExecStart=/opt/janitor/run-janitor.sh
StandardOutput=append:/var/log/janitor-runner.log
StandardError=append:/var/log/janitor-runner.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

# Set up crontab for ec2-user to run tests
log "Setting up test crontab..."
sudo -u ec2-user crontab << 'EOF'
# Run Janitor test every hour (for testing purposes)
# 0 * * * * /opt/janitor/run-janitor.sh >> /var/log/janitor-cron.log 2>&1
EOF

log "SUCCESS: Bootstrap completed successfully!"
log "Instance is ready for Janitor operations"
log "Available commands:"
log "  - sudo systemctl start janitor-runner  # Run Janitor once"
log "  - /opt/janitor/run-janitor.sh          # Manual run"
log "  - /opt/janitor/ecr-login.sh           # ECR authentication"

# Signal completion
log "Instance bootstrap complete - ready for Janitor workloads!"

# Automatically start Janitor service
log "Automatically starting Janitor service..."
systemctl start janitor-runner

# Optional: Auto-shutdown after Janitor completion (uncomment for production)
log "Scheduling auto-shutdown in 10 minutes as safety measure..."
echo "shutdown -h +10" | at now 