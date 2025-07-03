packer {
  required_plugins {
    amazon = {
      version = ">= 1.2.8"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

variable "region" {
  type    = string
  default = "eu-west-2"
}

variable "account_id" {
  type = string
}

variable "instance_type" {
  type    = string
  default = "g5.xlarge"
}

locals {
  timestamp = regex_replace(timestamp(), "[- TZ:]", "")
}

# Data source for the latest Deep Learning AMI with GPU support
data "amazon-ami" "deep_learning_ami" {
  filters = {
    name                = "Deep Learning AMI GPU PyTorch 2.* (Amazon Linux 2) *"
    root-device-type    = "ebs"
    virtualization-type = "hvm"
  }
  most_recent = true
  owners      = ["amazon"]
  region      = var.region
}

source "amazon-ebs" "janitor_gpu_ami" {
  ami_name      = "janitor-gpu-${local.timestamp}"
  region        = var.region
  source_ami    = data.amazon-ami.deep_learning_ami.id

  ssh_username = "ec2-user"

  tags = {
    Name        = "Janitor GPU AMI"
    Project     = "janitor"
    Environment = "base"
    BuildDate   = timestamp()
    BaseAMI     = data.amazon-ami.deep_learning_ami.id
  }

  # Use spot instances for cost savings during AMI building
  spot_price          = "auto"
  spot_instance_types = [var.instance_type]
}

build {
  name    = "janitor-gpu-ami"
  sources = ["source.amazon-ebs.janitor_gpu_ami"]

  # Update system
  provisioner "shell" {
    inline = [
      "echo 'Starting AMI customization...'",
      "sudo yum update -y",
      "echo 'System updated successfully'"
    ]
  }

  # Install additional packages
  provisioner "shell" {
    inline = [
      "echo 'Installing additional packages...'",
      "sudo yum install -y awscli amazon-cloudwatch-agent amazon-ssm-agent jq git htop tree",
      "echo 'Additional packages installed'"
    ]
  }

  # Configure Docker for GPU access
  provisioner "shell" {
    inline = [
      "echo 'Configuring Docker for GPU access...'",
      "# Ensure nvidia-container-toolkit is properly configured",
      "sudo nvidia-container-cli --version",
      "# Test NVIDIA container runtime",
      "sudo docker run --rm --gpus all nvidia/cuda:11.8-base-ubuntu20.04 nvidia-smi",
      "echo 'Docker GPU configuration verified'"
    ]
  }

  # Install Docker Compose
  provisioner "shell" {
    inline = [
      "echo 'Installing Docker Compose...'",
      "sudo curl -L \"https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)\" -o /usr/local/bin/docker-compose",
      "sudo chmod +x /usr/local/bin/docker-compose",
      "docker-compose --version",
      "echo 'Docker Compose installed successfully'"
    ]
  }

  # Create janitor directories and scripts
  provisioner "shell" {
    inline = [
      "echo 'Setting up Janitor directories...'",
      "sudo mkdir -p /opt/janitor",
      "sudo chown ec2-user:ec2-user /opt/janitor",
      "mkdir -p /opt/janitor/scripts /opt/janitor/reports /opt/janitor/cache",
      "echo 'Janitor directories created'"
    ]
  }

  # Copy and configure Janitor scripts
  provisioner "file" {
    source      = "../scripts/bootstrap.sh"
    destination = "/tmp/bootstrap.sh"
  }

  provisioner "shell" {
    inline = [
      "echo 'Installing Janitor scripts...'",
      "sudo mv /tmp/bootstrap.sh /opt/janitor/scripts/",
      "sudo chmod +x /opt/janitor/scripts/bootstrap.sh",
      "sudo chown ec2-user:ec2-user /opt/janitor/scripts/bootstrap.sh"
    ]
  }

  # Create ECR login script
  provisioner "shell" {
    inline = [
      "echo 'Creating ECR login script...'",
      "cat > /opt/janitor/scripts/ecr-login.sh << 'EOF'",
      "#!/bin/bash",
      "set -euo pipefail",
      "",
      "REGION=$${AWS_REGION:-eu-west-2}",
      "ACCOUNT_ID=$${ACCOUNT_ID}",
      "",
      "echo \"Logging into ECR...\"",
      "aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com",
      "EOF",
      "",
      "chmod +x /opt/janitor/scripts/ecr-login.sh"
    ]
  }

  # Create GPU test script
  provisioner "shell" {
    inline = [
      "echo 'Creating GPU test script...'",
      "cat > /opt/janitor/scripts/test-gpu.sh << 'EOF'",
      "#!/bin/bash",
      "set -euo pipefail",
      "",
      "echo \"🔍 Testing GPU availability...\"",
      "",
      "# Test NVIDIA drivers",
      "if command -v nvidia-smi >/dev/null 2>&1; then",
      "    echo \"✅ NVIDIA drivers installed\"",
      "    nvidia-smi",
      "else",
      "    echo \"❌ NVIDIA drivers not found\"",
      "    exit 1",
      "fi",
      "",
      "# Test Docker GPU access",
      "echo \"🐳 Testing Docker GPU access...\"",
      "if docker run --rm --gpus all nvidia/cuda:11.8-base-ubuntu20.04 nvidia-smi; then",
      "    echo \"✅ Docker GPU access working\"",
      "else",
      "    echo \"❌ Docker GPU access failed\"",
      "    exit 1",
      "fi",
      "",
      "echo \"🎉 GPU tests passed successfully!\"",
      "EOF",
      "",
      "chmod +x /opt/janitor/scripts/test-gpu.sh"
    ]
  }

  # Configure CloudWatch agent template
  provisioner "shell" {
    inline = [
      "echo 'Creating CloudWatch agent configuration template...'",
      "sudo mkdir -p /opt/aws/amazon-cloudwatch-agent/etc",
      "cat > /tmp/cloudwatch-config.json << 'EOF'",
      "{",
      "    \"logs\": {",
      "        \"logs_collected\": {",
      "            \"files\": {",
      "                \"collect_list\": [",
      "                    {",
      "                        \"file_path\": \"/var/log/janitor-bootstrap.log\",",
      "                        \"log_group_name\": \"/janitor-runner\",",
      "                        \"log_stream_name\": \"{instance_id}/bootstrap\",",
      "                        \"timezone\": \"UTC\"",
      "                    },",
      "                    {",
      "                        \"file_path\": \"/var/log/janitor-runner.log\",",
      "                        \"log_group_name\": \"/janitor-runner\",",
      "                        \"log_stream_name\": \"{instance_id}/janitor-run\",",
      "                        \"timezone\": \"UTC\"",
      "                    }",
      "                ]",
      "            }",
      "        }",
      "    }",
      "}",
      "EOF",
      "",
      "sudo mv /tmp/cloudwatch-config.json /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json.template"
    ]
  }

  # Create systemd service for Janitor
  provisioner "shell" {
    inline = [
      "echo 'Creating Janitor systemd service...'",
      "sudo tee /etc/systemd/system/janitor-runner.service > /dev/null << 'EOF'",
      "[Unit]",
      "Description=Janitor Runner Service",
      "After=docker.service cloud-final.service",
      "Requires=docker.service",
      "",
      "[Service]",
      "Type=oneshot",
      "User=ec2-user",
      "ExecStart=/opt/janitor/scripts/run-janitor.sh",
      "StandardOutput=append:/var/log/janitor-runner.log",
      "StandardError=append:/var/log/janitor-runner.log",
      "Environment=PATH=/usr/local/bin:/usr/bin:/bin",
      "",
      "[Install]",
      "WantedBy=multi-user.target",
      "EOF",
      "",
      "sudo systemctl daemon-reload"
    ]
  }

  # Pre-pull common Docker images for faster startup
  provisioner "shell" {
    inline = [
      "echo 'Pre-pulling common Docker images...'",
      "docker pull hello-world",
      "docker pull nvidia/cuda:11.8-base-ubuntu20.04",
      "docker pull python:3.9-slim",
      "docker pull node:20-alpine",
      "echo 'Common images pre-pulled'"
    ]
  }

  # Cleanup and prepare for AMI creation
  provisioner "shell" {
    inline = [
      "echo 'Cleaning up for AMI creation...'",
      "sudo yum clean all",
      "sudo rm -rf /var/log/yum.log",
      "sudo rm -rf /tmp/*",
      "sudo rm -rf /var/tmp/*",
      "history -c",
      "echo 'Cleanup completed'"
    ]
  }

  # Final verification
  provisioner "shell" {
    inline = [
      "echo '🔍 Final verification...'",
      "docker --version",
      "docker-compose --version", 
      "nvidia-smi",
      "aws --version",
      "echo '✅ AMI build completed successfully!'"
    ]
  }

  post-processor "manifest" {
    output = "manifest.json"
    strip_path = true
  }
} 