# Janitor AWS Infrastructure

> Infrastructure as Code for running Janitor agents on disposable AWS GPU instances

## 🏗️ Architecture Overview

The AWS infrastructure creates:

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

## 🔧 AWS Configuration

### Required IAM Permissions

Your AWS credentials need permissions for:

**AWS Managed Policies (recommended):**

-   `PowerUserAccess` (for development)

**Or granular policies:**

-   `AmazonEC2FullAccess`
-   `IAMFullAccess`
-   `AmazonS3FullAccess`
-   `CloudWatchFullAccess`
-   `AmazonEC2ContainerRegistryFullAccess`
-   `AmazonSSMFullAccess`

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

**Development** (`env/dev.tfvars`):

-   `t3.micro` instances (free tier eligible)
-   Basic logging and monitoring

**Production** (`env/prod.tfvars`):

-   `g5.xlarge` GPU instances (~$1/hour)
-   Enhanced monitoring and alerting

## 🖥️ GPU Support

### Building Custom GPU AMI

For GPU workloads, build a custom AMI with NVIDIA drivers:

```bash
# Build GPU-optimized AMI with Packer
make build-ami
```

This creates an AMI with:

-   NVIDIA drivers and CUDA
-   Docker with GPU support
-   Pre-installed Janitor dependencies

### GPU Instance Configuration

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

### SSH Access (for debugging)

Configure an EC2 key pair for SSH access:

```bash
# Add to your .env file
EC2_KEY_NAME=your-key-pair-name

# SSH to instance
make ssh ENV=dev

# Check logs on instance
sudo tail -f /var/log/janitor-bootstrap.log
sudo tail -f /var/log/janitor-runner.log
```

### Execution Reports

Reports are automatically uploaded to S3 and can be downloaded with:

```bash
make fetch-report ENV=dev
```

## 💰 Cost Management

### Development Environment

-   **Instance**: `t3.micro` (free tier eligible)
-   **Expected cost**: $0-2/day when idle

### Production Environment

-   **Instance**: `g5.xlarge` GPU instance (~$1/hour)
-   **Auto-shutdown**: Instances terminate after job completion

### Cost Optimization

1. Use spot instances for non-critical workloads
2. Configure auto-shutdown to prevent idle costs
3. Monitor usage with AWS Cost Explorer
4. Use appropriate instance sizes for workload

## 🧪 Testing Infrastructure

### Quick Test Instance

Test the concept before full deployment:

```bash
# Launch simple test instance
./infra/scripts/launch-test-instance.sh
```

### CI Validation

```bash
# Validate Terraform and Packer configurations
make ci
```

## 🗑️ Cleanup

### Destroy Infrastructure

```bash
# Destroy all resources for an environment
make destroy ENV=dev
```

### Manual Cleanup (if needed)

```bash
# List and terminate instances
aws ec2 describe-instances --filters "Name=tag:Project,Values=janitor-dev"
aws ec2 terminate-instances --instance-ids i-1234567890abcdef0

# Delete security groups and S3 buckets
aws ec2 delete-security-group --group-id sg-1234567890abcdef0
aws s3 rm s3://bucket-name --recursive && aws s3 rb s3://bucket-name
```

## 🔒 Security Best Practices

### IAM Configuration

-   Instances use least-privilege IAM roles
-   Permissions limited to ECR, S3, CloudWatch, SSM

### Network Security

-   Minimal inbound access (SSH optional)
-   Uses default VPC (customize for production)
-   Security groups with restricted access

### Operational Security

1. Rotate credentials regularly
2. Use separate AWS accounts for environments
3. Enable CloudTrail for audit logging
4. Monitor usage and costs

## 📚 Troubleshooting

### Common Infrastructure Issues

**Terraform fails with permission errors:**

-   Verify AWS credentials have required IAM policies
-   Check AWS profile configuration

**Instance fails to start:**

-   Check CloudWatch logs for bootstrap errors
-   Verify AMI availability in your region

**Reports not uploading:**

-   Verify IAM permissions for S3
-   Check CloudWatch logs for error details

### Debugging Steps

1. Check CloudWatch logs for detailed error messages
2. Test with `launch-test-instance.sh` for simpler debugging
3. Validate configuration with `make ci`
4. Use SSH access for direct instance inspection

For general usage and development questions, see the [main project README](../README.md) and [development conventions](../docs/conventions.md).
