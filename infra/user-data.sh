#!/bin/bash

# User Data Script for Simplified Janitor GPU Instance (Deep Learning Base AMI)
# This script bootstraps a Deep Learning Base AMI (Ubuntu 22.04) with GPU drivers and CUDA 12.x installed

set -e

# Log all output to CloudWatch logs (optional but helpful for debugging)
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1
echo "Starting Janitor GPU instance bootstrap on Deep Learning Base AMI (Ubuntu 22.04 + CUDA 12.x)..."

# Update system
apt-get update -y
apt-get install -y curl wget git unzip

# Verify GPU and Docker are working (pre-installed on Deep Learning AMI)
echo "Verifying GPU setup..."
nvidia-smi
echo "GPU verification complete!"

echo "Verifying Docker GPU support..."
docker run --rm --gpus all nvidia/cuda:12.6.0-base-ubuntu22.04 nvidia-smi || echo "Docker GPU test completed"

# Install Node.js (using NodeSource repository for latest LTS)
echo "Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Create directory for the janitor agent (code will be deployed separately)
echo "Setting up Janitor application directory..."
mkdir -p /opt/janitor
cd /opt/janitor

# Note: Actual code deployment happens via scripts/deploy-code.sh
echo "Environment setup complete. Code will be deployed separately."

# Create environment file template (will be populated during code deployment)
cat > .env.template << 'EOF'
# API Keys
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
GITHUB_PERSONAL_ACCESS_TOKEN=${GITHUB_PERSONAL_ACCESS_TOKEN}

# Supabase Configuration
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
SUPABASE_DB_PASSWORD=${SUPABASE_DB_PASSWORD}

# Server Configuration
PORT=3000
NODE_ENV=production
EOF

# Create systemd service for the Mastra server (will be started after code deployment)
cat > /etc/systemd/system/janitor-mastra.service << 'EOF'
[Unit]
Description=Janitor Mastra Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/janitor/packages/janitor-agent
Environment=NODE_ENV=production
Environment=PATH=/usr/bin:/usr/local/bin
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=janitor-mastra
KillMode=mixed
KillSignal=SIGINT

[Install]
WantedBy=multi-user.target
EOF

# Enable service (but don't start until code is deployed)
systemctl enable janitor-mastra

# Create directories for Docker layer caching (persistent EBS volume)
mkdir -p /var/lib/docker
mkdir -p /opt/janitor/docker-cache

# Set proper ownership
chown -R ubuntu:ubuntu /opt/janitor

echo "Bootstrap complete! Environment is ready for code deployment."
echo "Next: Code will be deployed automatically via deploy-code.sh" 