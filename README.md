# RunPod Worker Repository Auto Maintenance

> Multi-package repository for automated Docker repository maintenance tools

![janitor diagram](docs/20250327_janitor_diagram.png)

This monorepo contains tools for automatically maintaining, validating, and enhancing RunPod worker repositories using AI agents.

## 📦 Packages

### [`packages/janitor-agent/`](packages/janitor-agent/)

The main Janitor agent system that uses multi-agent architecture (based on [Mastra](https://mastra.ai)) to validate and repair Docker repositories:

1. **Janitor** (agent) - Coordinates the whole process (validation, repair, feature addition)
2. **Dev** (agent) - Diagnoses and repairs issues, implements new features
3. **PR Creator** (agent) - Creates pull requests with fixes or new features on GitHub

## 📋 Prerequisites

### Required Tools

-   **[AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)** - For managing AWS resources
-   **[Docker](https://docs.docker.com/get-docker/)** - For containerized builds and infrastructure tools
-   **[Make](https://chocolatey.org/packages/make)** - For workflow commands (Windows: `choco install make`)

### AWS Setup

1. **Create IAM User with Permissions**:

    Create an IAM user (e.g., `janitor-user`) and attach these **AWS Managed Policies**:

    **Option A: PowerUser (Recommended for Development)**

    - `PowerUserAccess` - Covers most infrastructure needs

    **Option B: Granular Permissions (Production)**

    - `AmazonEC2FullAccess` - EC2 instances, security groups, launch templates
    - `IAMFullAccess` - Create roles, policies, instance profiles
    - `AmazonS3FullAccess` - S3 buckets and objects
    - `CloudWatchFullAccess` - Log groups and monitoring
    - `AmazonEC2ContainerRegistryFullAccess` - ECR repositories
    - `AmazonSSMFullAccess` - Send commands to EC2 instances

    **Add Policies via AWS Console:**

    - Go to: IAM → Users → [your-user] → Add permissions → Attach existing policies directly
    - Search for each policy name above and attach them

2. **Configure AWS Profile**:

    ```bash
    aws configure --profile runpod-janitor
    # Enter your AWS Access Key ID, Secret Access Key, and region (eu-west-2)
    ```

3. **Create Environment File**:
   Create `.env` in project root:

    ```bash
    # AWS Configuration
    AWS_PROFILE=runpod-janitor
    AWS_REGION=eu-west-2
    ACCOUNT_ID=your-aws-account-id  # Get with: aws sts get-caller-identity --query Account --output text

    # Development Settings
    DOCKER_TAG=latest
    REPOS_FILE=infra/repos.yaml
    ```

4. **Verify Permissions** (Optional):

    ```bash
    # Check your attached policies
    aws iam list-attached-user-policies --user-name your-iam-username --profile runpod-janitor

    # Test basic access
    aws sts get-caller-identity --profile runpod-janitor
    ```

### Optional Tools (for local development)

-   **[Node.js 18+](https://nodejs.org/)** - Only needed for local janitor agent development
-   **SSH Key Pair** - For optional EC2 instance access

> **Note**: Terraform and Packer are **not** required locally - they run in Docker containers via the Makefile.

## 🚀 Quick Start

### Local Development

```bash
# Install and run the janitor agent locally
cd packages/janitor-agent
npm install
npm run dev
```

### AWS Cloud Runner

```bash
# Validate environment setup
make check-env

# Validate infrastructure configuration
make ci

# Initialize and deploy infrastructure
make infra-init
make infra-plan ENV=dev
make infra-apply ENV=dev

# Run janitor on disposable AWS GPU instances
make run-janitor ENV=dev REPOS_FILE=infra/repos.yaml
make fetch-report ENV=dev
```

## 📚 Documentation

-   **[Janitor Agent Guide](packages/janitor-agent/README.md)** - Local development and testing
-   **[Planning Documents](docs/planning/)** - User stories and technical specifications
-   **[AWS Infrastructure Guide](infra/README.md)** - Cloud deployment setup and architecture

## 🏗️ Repository Structure

```
.
├── packages/
│   └── janitor-agent/          # Main AI agent system
├── infra/                      # AWS infrastructure
│   ├── terraform/              # Infrastructure as Code
│   │   ├── main.tf            # Core AWS resources
│   │   └── env/               # Environment configurations
│   ├── packer/                # GPU AMI definitions
│   ├── scripts/               # Bootstrap and deployment scripts
│   └── repos.yaml             # Repository processing configuration
├── docs/                      # Documentation and planning
│   ├── planning/              # User stories and technical specs
│   └── conventions.md         # Development conventions
└── Makefile                   # Cloud workflow commands
```

## 🔧 Development Workflow

1. **Local Testing**: Develop and test in `packages/janitor-agent/`
2. **Cloud Validation**: Deploy to AWS for large-scale repository processing
3. **Infrastructure**: Manage cloud resources via `infra/` directory

## 📋 User Stories

**Implemented:**

-   ✅ **[Repository Validation](docs/planning/001_Worker_Repo_Build_Validator.md)** - Automated Docker validation
-   ✅ **[File System Operations](docs/planning/002_File_System_Operations_Agent.md)** - File manipulation capabilities
-   ✅ **[Pull Request Creation](docs/planning/003_Repository_PR_Agent.md)** - Automated PR generation
-   ✅ **[Feature Addition](docs/planning/004_add_new_feature.md)** - Adding standardized features to repos
-   ✅ **[AWS Cloud Runner](docs/planning/005_aws.md)** - Disposable GPU instances for scale (ready for testing)

## 🛠️ Troubleshooting

### Common Issues

**Windows Users:**

-   Install Make: `choco install make` (requires admin PowerShell)
-   Docker Desktop must be running for containerized infrastructure tools
-   Use Git Bash or WSL for better Bash script compatibility

**AWS Setup:**

-   Ensure AWS credentials have appropriate permissions (see AWS Setup section above for required policies)
-   Verify region availability for GPU instances (g5.xlarge) if using production environment
-   Check AWS account limits for EC2 instances and S3 buckets
-   **Note**: Adding IAM policies via "Add permissions" adds to existing permissions, doesn't replace them

**Infrastructure Deployment:**

-   Run `make ci` to validate Terraform and Packer configurations before deployment
-   Use `make check-env` to verify environment variables are correctly set
-   Monitor AWS costs during testing - instances auto-terminate but verify cleanup

### Getting Help

1. Check [Infrastructure README](infra/README.md) for detailed AWS setup
2. Review [Development Conventions](docs/conventions.md) for project patterns
3. Examine CloudWatch logs for instance-level debugging

## 🤝 Contributing

Each package has its own development setup. See individual package READMEs for specific instructions.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.
