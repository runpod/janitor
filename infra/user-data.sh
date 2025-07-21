#!/bin/bash

# User Data Script for Simplified Janitor GPU Instance
# This script bootstraps a GPU instance with everything needed to run Mastra server

set -e

# Log all output to CloudWatch logs (optional but helpful for debugging)
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1
echo "Starting Janitor GPU instance bootstrap..."

# Update system
apt-get update -y
apt-get install -y curl wget git unzip

# Install Docker
echo "Installing Docker..."
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
usermod -aG docker ubuntu
systemctl enable docker
systemctl start docker

# Install Node.js (using NodeSource repository for latest LTS)
echo "Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install NVIDIA Docker support for GPU access
echo "Installing NVIDIA Docker support..."
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | tee /etc/apt/sources.list.d/nvidia-docker.list

apt-get update -y
apt-get install -y nvidia-docker2
systemctl restart docker

# Create directory for the janitor agent
echo "Setting up Janitor application..."
mkdir -p /opt/janitor
cd /opt/janitor

# Clone the janitor repository directly
echo "Cloning Janitor repository..."
git clone https://github.com/runpod-workers/janitor.git .

# Install dependencies for the janitor-agent
echo "Installing Node.js dependencies..."
cd packages/janitor-agent
npm install

# Create environment file template
cat > .env << 'EOF'
# API Keys
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
GITHUB_PERSONAL_ACCESS_TOKEN=${GITHUB_PERSONAL_ACCESS_TOKEN}

# Supabase Configuration
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}

# Server Configuration
PORT=3000
NODE_ENV=production
EOF

# Create systemd service for the Mastra server
cat > /etc/systemd/system/janitor-mastra.service << 'EOF'
[Unit]
Description=Janitor Mastra Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/janitor/packages/janitor-agent
Environment=NODE_ENV=production
EnvironmentFile=/opt/janitor/.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=janitor-mastra

[Install]
WantedBy=multi-user.target
EOF

# Enable the service (but don't start it yet - needs code deployment)
systemctl enable janitor-mastra

# Create directories for Docker layer caching (persistent EBS volume)
mkdir -p /var/lib/docker
mkdir -p /opt/janitor/docker-cache

# Set proper ownership
chown -R ubuntu:ubuntu /opt/janitor

echo "Bootstrap complete! Instance is ready for Janitor code deployment."
echo "To complete setup:"
echo "1. Deploy the janitor-agent code to /opt/janitor/packages/janitor-agent"
echo "2. Update /opt/janitor/.env with actual API keys"
echo "3. Run: systemctl start janitor-mastra"
echo "4. Check logs: journalctl -u janitor-mastra -f" 