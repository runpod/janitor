terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region  = var.region
  profile = var.aws_profile

  default_tags {
    tags = {
      Project     = "janitor-${var.environment}"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

# Variables
variable "environment" {
  description = "Environment name (dev, prod)"
  type        = string
  default     = "dev"
}

variable "region" {
  description = "AWS region"
  type        = string
  default     = "eu-west-2"
}

variable "account_id" {
  description = "AWS account ID"
  type        = string
}

variable "aws_profile" {
  description = "AWS profile to use"
  type        = string
  default     = "runpod-janitor"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.micro"
}

variable "key_name" {
  description = "EC2 Key Pair name for SSH access"
  type        = string
  default     = null
}

variable "anthropic_api_key" {
  description = "Anthropic API key for AI services"
  type        = string
  sensitive   = true
}

variable "github_personal_access_token" {
  description = "GitHub Personal Access Token for repository operations"
  type        = string
  sensitive   = true
}

# Local values
locals {
  name_prefix = "janitor-${var.environment}"
  common_tags = {
    Project     = local.name_prefix
    Environment = var.environment
  }
}

# ECR Repository for Janitor Docker images
resource "aws_ecr_repository" "janitor" {
  name                 = "janitor"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.common_tags
}

# S3 bucket for reports
resource "aws_s3_bucket" "reports" {
  bucket = "janitor-reports-${var.environment}-${random_string.bucket_suffix.result}"

  tags = local.common_tags
}

resource "random_string" "bucket_suffix" {
  length  = 8
  special = false
  upper   = false
}

resource "aws_s3_bucket_versioning" "reports_versioning" {
  bucket = aws_s3_bucket.reports.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "reports_encryption" {
  bucket = aws_s3_bucket.reports.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "janitor_runner" {
  name              = "/janitor-runner"
  retention_in_days = 14

  tags = local.common_tags
}

# IAM Role for EC2 instance
resource "aws_iam_role" "janitor_instance" {
  name = "${local.name_prefix}-instance-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

# IAM Policy for Janitor instance
resource "aws_iam_role_policy" "janitor_instance_policy" {
  name = "${local.name_prefix}-instance-policy"
  role = aws_iam_role.janitor_instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # ECR permissions
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage"
        ]
        Resource = "*"
      },
      # S3 permissions for reports
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl",
          "s3:GetObject"
        ]
        Resource = "${aws_s3_bucket.reports.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = aws_s3_bucket.reports.arn
      },
      # CloudWatch Logs permissions
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = "${aws_cloudwatch_log_group.janitor_runner.arn}*"
      },
      # SSM permissions for remote access
      {
        Effect = "Allow"
        Action = [
          "ssm:UpdateInstanceInformation",
          "ssm:SendCommand",
          "ssm:GetCommandInvocation",
          "ssm:DescribeInstanceInformation",
          "ssm:DescribeCommandInvocations"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "janitor_instance" {
  name = "${local.name_prefix}-instance-profile"
  role = aws_iam_role.janitor_instance.name

  tags = local.common_tags
}

# Security Group
resource "aws_security_group" "janitor_instance" {
  name_prefix = "${local.name_prefix}-sg"
  description = "Security group for Janitor instance"

  # Allow SSH access (optional, if key_name is provided)
  dynamic "ingress" {
    for_each = var.key_name != null ? [1] : []
    content {
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"] # Restrict this in production
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-sg"
  })
}

# Get the latest Amazon Linux 2 AMI
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# User data script for instance initialization
locals {
  user_data = base64encode(templatefile("${path.module}/../scripts/bootstrap.sh", {
    region           = var.region
    environment      = var.environment
    ecr_repository   = aws_ecr_repository.janitor.repository_url
    log_group        = aws_cloudwatch_log_group.janitor_runner.name
    account_id       = var.account_id
    anthropic_api_key = var.anthropic_api_key
    github_personal_access_token = var.github_personal_access_token
    database_agent_secret_arn = aws_secretsmanager_secret.db_agent_credentials.arn
    database_query_secret_arn = aws_secretsmanager_secret.db_query_credentials.arn
    # Add uppercase versions for the HERE documents in bootstrap.sh
    REGION           = var.region
    ENVIRONMENT      = var.environment
    ECR_REPOSITORY   = aws_ecr_repository.janitor.repository_url
    LOG_GROUP        = aws_cloudwatch_log_group.janitor_runner.name
    ACCOUNT_ID       = var.account_id
    ANTHROPIC_API_KEY = var.anthropic_api_key
    GITHUB_PERSONAL_ACCESS_TOKEN = var.github_personal_access_token
    DATABASE_AGENT_SECRET_ARN = aws_secretsmanager_secret.db_agent_credentials.arn
    DATABASE_QUERY_SECRET_ARN = aws_secretsmanager_secret.db_query_credentials.arn
  }))
}

# Launch Template
resource "aws_launch_template" "janitor" {
  name_prefix   = "${local.name_prefix}-lt"
  image_id      = data.aws_ami.amazon_linux.id
  instance_type = var.instance_type
  key_name      = var.key_name

  vpc_security_group_ids = [aws_security_group.janitor_instance.id]

  iam_instance_profile {
    name = aws_iam_instance_profile.janitor_instance.name
  }

  user_data = local.user_data

  tag_specifications {
    resource_type = "instance"
    tags = merge(local.common_tags, {
      Name = "${local.name_prefix}-instance"
    })
  }

  tags = local.common_tags
}

# Outputs
output "ecr_repository_url" {
  description = "ECR repository URL for Janitor images"
  value       = aws_ecr_repository.janitor.repository_url
}

output "s3_bucket_name" {
  description = "S3 bucket name for reports"
  value       = aws_s3_bucket.reports.bucket
}

output "log_group_name" {
  description = "CloudWatch log group name"
  value       = aws_cloudwatch_log_group.janitor_runner.name
}

output "launch_template_id" {
  description = "Launch template ID"
  value       = aws_launch_template.janitor.id
}

output "security_group_id" {
  description = "Security group ID"
  value       = aws_security_group.janitor_instance.id
} 