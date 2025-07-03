# Janitor AWS Cloud Runner Infrastructure

This directory contains the infrastructure code for deploying the Janitor system on AWS using disposable GPU instances.

## 🏗️ Architecture Overview

The AWS cloud runner creates:

-   **EC2 Launch Templates**: Pre-configured instance templates for reproducible deployments
-   **ECR Repository**: Container registry for Janitor Docker images
-   **S3 Bucket**: Storage for execution reports and artifacts
-   **IAM Roles**: Least-privilege permissions for instance operations
-   **CloudWatch Logs**: Centralized logging and monitoring
-   **Custom AMI** (optional): GPU-optimized AMI with pre-installed dependencies

## 📁 Directory Structure

```
infra/
├── terraform/              # Infrastructure as Code
│   ├── main.tf             # Main Terraform configuration
│   └── env/                # Environment-specific variables
│       ├── dev.tfvars      # Development environment
│       └── prod.tfvars     # Production environment
├── packer/                 # AMI building
│   └── gpu-ami.pkr.hcl     # GPU-optimized AMI definition
├── scripts/                # Deployment and utility scripts
│   ├── bootstrap.sh        # Instance initialization script
│   └── launch-test-instance.sh  # Quick test instance launcher
└── repos.yaml              # Repository list for processing
```

## 🚀 Quick Start

### Prerequisites

1. **AWS CLI**: [Install AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
2. **AWS Credentials**: Configure with appropriate permissions
3. **Docker**: For building and running containers locally
4. **Make**: For using the provided Makefile commands

### 1. Configure AWS Credentials

```bash
# Create a new AWS profile for Janitor
aws configure --profile runpod-janitor

# Set environment variables (or create .env file in project root)
export AWS_PROFILE=runpod-janitor
export AWS_REGION=eu-west-2
export ACCOUNT_ID=123456789012  # Your AWS account ID
```

### 2. Test the Concept (Recommended First Step)

Before deploying full infrastructure, test with a simple instance:

```bash
# Make the script executable
chmod +x infra/scripts/launch-test-instance.sh

# Launch a test instance
./infra/scripts/launch-test-instance.sh

# Check the output for instance details and cleanup commands
```

This will:

-   Launch a `t3.micro` instance with Docker pre-installed
-   Run basic validation tests
-   Generate a test report
-   Provide cleanup instructions

### 3. Deploy Full Infrastructure

```bash
# From project root directory

# Initialize Terraform
make infra-init

# Plan infrastructure changes
make infra-plan ENV=dev

# Apply infrastructure
make infra-apply ENV=dev

# Check status
make status ENV=dev
```

### 4. Build and Deploy Janitor Image

```bash
# Build and push Janitor Docker image to ECR
make image

# The image will be available at:
# {ACCOUNT_ID}.dkr.ecr.{REGION}.amazonaws.com/janitor:latest
```

### 5. Run Janitor in the Cloud

```bash
# Trigger a cloud Janitor run
make run-janitor ENV=dev

# Fetch the execution reports
make fetch-report ENV=dev
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# AWS Configuration
AWS_PROFILE=runpod-janitor
AWS_REGION=eu-west-2
ACCOUNT_ID=123456789012

# Optional: EC2 Key Pair for SSH access
EC2_KEY_NAME=your-key-pair-name

# Development Settings
DOCKER_TAG=latest
REPOS_FILE=infra/repos.yaml
```

### Repository Configuration

Edit `infra/repos.yaml` to specify which repositories to process:

```yaml
repositories:
    - name: "worker-basic"
      url: "https://github.com/TimPietrusky/worker-basic"
      description: "Basic RunPod worker template"
      priority: "high"

config:
    max_parallel: 1
    timeout_minutes: 30
    create_pull_requests: true
```

### Environment-Specific Settings

-   **Development** (`env/dev.tfvars`): Uses `t3.micro` instances for cost-effective testing
-   **Production** (`env/prod.tfvars`): Uses `g5.xlarge` GPU instances for real workloads

## 🖥️ GPU Support

### Building GPU AMI

For GPU workloads, build a custom AMI with NVIDIA drivers:

```bash
# Build GPU-optimized AMI with Packer
make build-ami

# This creates an AMI based on AWS Deep Learning AMI with:
# - NVIDIA drivers and CUDA
# - Docker with GPU support
# - Pre-installed Janitor dependencies
```

### Using GPU Instances

Update your environment configuration:

```bash
# In env/prod.tfvars
instance_type = "g5.xlarge"  # or g5.2xlarge, g5.4xlarge, etc.
```

Deploy with GPU support:

```bash
make infra-apply ENV=prod
```

## 🔍 Monitoring and Debugging

### CloudWatch Logs

All instance activity is logged to CloudWatch:

-   **Log Group**: `/janitor-runner`
-   **Streams**:
    -   `{instance-id}/bootstrap` - Instance initialization
    -   `{instance-id}/janitor-run` - Janitor execution
    -   `{instance-id}/docker` - Docker container logs

### SSH Access (Optional)

If you configured an EC2 key pair:

```bash
# Get instance IP
make status ENV=dev

# SSH to instance
ssh -i ~/.ssh/your-key.pem ec2-user@{instance-ip}

# Check logs on instance
sudo tail -f /var/log/janitor-bootstrap.log
sudo tail -f /var/log/janitor-runner.log
```

### Execution Reports

Reports are automatically uploaded to S3:

```bash
# Download all reports
make fetch-report ENV=dev

# Reports are saved to ./reports/
ls -la reports/
```

## 💰 Cost Management

### Development Environment

-   **Instance**: `t3.micro` (free tier eligible)
-   **Storage**: EBS GP3 volume for Docker layer caching
-   **Expected cost**: $0-2/day when idle

### Production Environment

-   **Instance**: `g5.xlarge` GPU instance (~$1/hour)
-   **Auto-shutdown**: Instances terminate after job completion
-   **Spot instances**: Can be configured for 50-70% cost savings

### Cost Optimization Tips

1. **Use spot instances** for non-critical workloads
2. **Configure auto-shutdown** to prevent idle costs
3. **Use appropriate instance sizes** for your workload
4. **Monitor usage** with AWS Cost Explorer

## 🧪 Testing

### CI Validation

```bash
# Run all CI checks
make ci

# This validates:
# - Terraform configuration syntax
# - Packer template validity
# - Infrastructure best practices
```

### Manual Testing

```bash
# Test with basic Docker functionality
./infra/scripts/launch-test-instance.sh

# Test with full infrastructure
make infra-apply ENV=dev
make run-janitor ENV=dev
make fetch-report ENV=dev
```

## 🗑️ Cleanup

### Destroy Infrastructure

```bash
# Destroy all resources for an environment
make destroy ENV=dev

# This removes:
# - EC2 instances and launch templates
# - S3 bucket and contents
# - IAM roles and policies
# - CloudWatch log groups
# - Security groups
```

### Manual Cleanup

If automated cleanup fails:

```bash
# List and terminate instances
aws ec2 describe-instances --profile $AWS_PROFILE --region $AWS_REGION \
  --filters "Name=tag:Project,Values=janitor-dev"

aws ec2 terminate-instances --instance-ids i-1234567890abcdef0

# Delete security groups
aws ec2 delete-security-group --group-id sg-1234567890abcdef0

# Empty and delete S3 bucket
aws s3 rm s3://bucket-name --recursive
aws s3 rb s3://bucket-name
```

## 🔒 Security Considerations

### IAM Permissions

Instances use least-privilege IAM roles with permissions only for:

-   ECR image pulling
-   S3 report uploading
-   CloudWatch logging
-   SSM remote access

### Network Security

-   **Security groups**: Minimal inbound access (SSH optional)
-   **Outbound**: Full internet access for package downloads
-   **VPC**: Uses default VPC (customize for production)

### Best Practices

1. **Rotate credentials** regularly
2. **Use separate AWS accounts** for different environments
3. **Enable CloudTrail** for audit logging
4. **Configure AWS Config** for compliance monitoring
5. **Use separate AWS profiles** to avoid credential conflicts

## 📚 Troubleshooting

### Common Issues

**Issue**: Terraform fails with permission errors
**Solution**: Ensure your AWS credentials have sufficient permissions for EC2, IAM, S3, and CloudWatch

**Issue**: Instance fails to start
**Solution**: Check CloudWatch logs for bootstrap errors

**Issue**: Docker commands fail
**Solution**: Ensure ec2-user is in docker group and Docker service is running

**Issue**: Reports not uploading to S3
**Solution**: Verify IAM permissions and S3 bucket configuration

### Getting Help

1. **Check CloudWatch logs** for detailed error messages
2. **Review instance user data** for bootstrap issues
3. **Validate Terraform configuration** with `make ci`
4. **Test with simple instance** using `launch-test-instance.sh`

## 🔄 Development Workflow

1. **Local testing**: Use the Janitor agent locally first
2. **Simple validation**: Test with `launch-test-instance.sh`
3. **Infrastructure deployment**: Deploy with Terraform
4. **Image building**: Build and push Docker images
5. **Cloud execution**: Run Janitor in the cloud
6. **Report analysis**: Download and review execution reports
7. **Iteration**: Refine and repeat

This infrastructure enables cost-effective, scalable Docker repository validation and maintenance using disposable AWS GPU instances.
