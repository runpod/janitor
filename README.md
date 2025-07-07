# Janitor

> Automated Docker repository maintenance using AI agents on AWS

![janitor diagram](docs/20250327_janitor_diagram.png)

This monorepo contains an AI agent system that automatically maintains, validates, and enhances Docker repositories using disposable AWS GPU instances.

## 🏗️ Repository Structure

### [`packages/janitor-agent/`](packages/janitor-agent/)

Main AI agent system using [Mastra](https://mastra.ai) with multi-agent architecture:

-   **Janitor Agent** - Orchestrates validation, repair, and feature addition
-   **Dev Agent** - Diagnoses issues and implements fixes
-   **PR Creator Agent** - Creates GitHub pull requests

### [`infra/`](infra/)

AWS infrastructure for running agents on disposable GPU instances:

-   Terraform configurations for EC2, S3, CloudWatch
-   Packer scripts for custom AMIs
-   Bootstrap and deployment automation

## 🚀 Quick Start

### 1. Prerequisites

-   [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) configured with appropriate permissions
-   [Docker](https://docs.docker.com/get-docker/) for local development
-   [Make](https://chocolatey.org/packages/make) for workflow commands (Windows: `choco install make`)

### 2. Environment Setup

```bash
# Copy the example environment file and edit it
cp .env.example .env
```

> [!NOTE]  
> Edit the `.env` file with your actual AWS profile, account ID, and API keys. The `.env.example` file includes helpful comments and links for obtaining API keys.

### 3. Deploy Infrastructure (One-time Setup)

```bash
# Initialize and deploy AWS infrastructure
make infra-init
make infra-plan ENV=dev           # Preview changes before applying
make infra-apply ENV=dev          # Deploy resources

# Build and push Janitor Docker image to ECR (REQUIRED on first setup)
make image ENV=dev
```

> [!IMPORTANT]  
> **When to rebuild the image**: Run `make image ENV=dev` only when:
>
> 1. **First time setup** (after deploying infrastructure)
> 2. **After changing Janitor agent code** in `packages/janitor-agent/`

### 4. Run Janitor Validation (Daily Usage)

```bash
# Launch instance and run validation
make launch-instance ENV=dev
make status ENV=dev               # Check instance status
make logs ENV=dev                 # Monitor execution logs

# Get results and clean up
make fetch-report ENV=dev         # Download validation reports
make kill-instances ENV=dev       # Terminate instances
```

> [!TIP]
> Always run `make kill-instances ENV=dev` after getting your reports to avoid unnecessary AWS costs. Instances are designed to be disposable!

### 5. Local Development

```bash
# Work with the agent locally
cd packages/janitor-agent
npm install
npm run dev  # Opens Mastra interface at http://localhost:4111
```

## 📋 Development Guidelines

### Working with AI Agents (Cursor, etc.)

When using AI coding assistants, **always** provide this context:

> "Please follow the @conventions.md when working in this codebase"

> [!WARNING]  
> ALWAYS provide the `docs/conventions.md` for the agent - it contains critical patterns for GPU-aware validation, tool implementation, and monorepo structure that ensure your changes work correctly.
> ALWAYS let the agent update the `docs/conventions.md` if there are fundamental changes in the code base that need to be persisted for the next agent

### Key Documentation

-   **[`docs/conventions.md`](docs/conventions.md)** - for all development work
-   **[`packages/janitor-agent/README.md`](packages/janitor-agent/README.md)** - Detailed agent development guide
-   **[`infra/README.md`](infra/README.md)** - AWS infrastructure setup and deployment

## 🎯 Common Operations

```bash
# Instance Management
make launch-instance ENV=dev    # Launch fresh instance
make status ENV=dev             # Check infrastructure status
make check-instances ENV=dev    # See what instances are running
make kill-instances ENV=dev     # Terminate all instances

# Monitoring & Logs
make logs ENV=dev               # Dump instance logs
make logs-all ENV=dev           # Follow logs in real-time
make fetch-report ENV=dev       # Download validation reports

# Updates & Deployment
make image ENV=dev              # Rebuild image (only after code changes!)
make build-ami                  # Build custom GPU AMI (optional)
make destroy ENV=dev            # Destroy all infrastructure

# Debugging
make ssh ENV=dev                # SSH into instance for debugging
```

### SSH Debugging Commands

When connected via `make ssh ENV=dev`, useful debugging commands on the instance:

```bash
# Check service status
sudo systemctl status janitor-runner
sudo journalctl -u janitor-runner -f

# Check logs
sudo tail -f /var/log/janitor-runner.log
sudo tail -f /var/log/janitor-bootstrap.log

# Check Docker
docker ps -a
docker logs <container-id>
docker images

# Check files
ls -la /opt/janitor/
```

## 📚 Getting Help

1. **New to the project?** Start with [`docs/conventions.md`](docs/conventions.md)
2. **Working on agents?** See [`packages/janitor-agent/README.md`](packages/janitor-agent/README.md)
3. **AWS/Infrastructure issues?** Check [`infra/README.md`](infra/README.md)
4. **Need detailed setup?** All docs are linked from conventions.md

## 🏆 User Stories

-   ✅ Repository Validation - Automated Docker validation
-   ✅ File System Operations - Cross-platform file handling
-   ✅ Pull Request Creation - Automated GitHub PRs
-   ✅ Feature Addition - Standardized repository enhancements
-   ✅ AWS Cloud Runner - Disposable GPU instances for scale

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.
