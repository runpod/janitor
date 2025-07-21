# Janitor Agent Project Conventions

This document outlines the conventions, patterns, and operational procedures for the Janitor Agent project. This is a simplified monorepo with a Mastra-based agent system running on a persistent GPU instance with Supabase database.

## Project Structure

### Monorepo Organization

This is a monorepo with the following key packages:

```
janitor/
├── packages/
│   └── janitor-agent/          # Main agent application
│       ├── src/mastra/         # Mastra framework code
│       ├── docker/             # Docker configuration
│       ├── tests/              # Test files
│       └── package.json        # Node.js dependencies
├── infra/                      # Infrastructure as Code
│   ├── terraform/              # Terraform configurations
│   ├── packer/                 # AMI building
│   └── scripts/                # Infrastructure scripts
├── scripts/                    # Deployment and utility scripts
├── Makefile                    # Primary orchestration interface
└── docs/                       # Documentation
```

### Package Responsibilities

**`packages/janitor-agent/`**

- Contains the Mastra-based agent system
- Docker repository validation logic
- GPU-aware container testing
- Local development and testing tools

**`infra/`**

- Simple user-data bootstrap script for GPU instance
- Supabase database schema
- Minimal infrastructure configuration

**Root Level**

- `Makefile`: Simplified interface with 9 essential commands
- `scripts/`: Cross-cutting deployment utilities
- Configuration files and documentation

## Environment Setup

### Required Environment Variables

Create a `.env` file in the project root with:

```bash
# API Keys (Required)
ANTHROPIC_API_KEY=your-anthropic-key
GITHUB_PERSONAL_ACCESS_TOKEN=your-github-token

# Supabase Configuration (Required)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AWS Configuration (Simplified)
AWS_PROFILE=your-profile
AWS_REGION=us-east-1
SSH_KEY_NAME=janitor-key
SSH_KEY_PATH=~/.ssh/janitor-key
```

### Prerequisites

- AWS CLI configured with appropriate permissions
- Node.js and npm/pnpm installed
- Terraform installed
- Docker installed (for local testing)
- SSH key pair for AWS instances

## Deployment and Operations

### Primary Workflow Commands

The Makefile provides the primary interface for all operations:

```bash
# Setup (one-time)
make setup-supabase            # Set up Supabase database
make start            # Launch GPU instance
make deploy-code               # Deploy janitor code to instance

# Daily usage
make prompt PROMPT="validate RunPod/worker-basic"  # Send validation request
make query-results                                       # Check recent results
make query-results RUN_ID=your-run-id                   # Check specific run
make query-results REPO=worker-basic                    # Check repository results

# Instance management
make start                     # Start the GPU instance
make stop             # Stop instance to save costs
make deploy-code               # Deploy/update code on instance

# Development
make install                   # Install dependencies locally
make test-local                # Run local tests
```

### Deployment Environments

**Development (`ENV=dev`)**

- Uses `infra/terraform/env/dev.tfvars`
- t3.micro instances (no GPU)
- CloudWatch logging enabled
- Temporary instances for testing

**Production (`ENV=prod`)**

- Uses `infra/terraform/env/prod.tfvars`
- GPU-enabled instances
- Enhanced monitoring and alerting
- Persistent infrastructure

### Complete Deployment Workflow

```bash
# 1. Launch instance
make launch-instance ENV=dev

# 2. Monitor logs (real-time)
make logs-all ENV=dev

# 3. Get validation results when ready
make query-runs ENV=dev

# 4. Clean up
make kill-instances ENV=dev
```

## Agent Architecture

### Core Components

**Janitor Agent (`packages/janitor-agent/src/mastra/agents/janitor.ts`)**

- Main orchestration agent
- Coordinates validation workflow
- Makes decisions about repository handling

**PR Creator Agent (`packages/janitor-agent/src/mastra/agents/pr-creator.ts`)**

- Creates pull requests with fixes
- Handles GitHub API interactions
- Manages PR content and formatting

**Development Agent (`packages/janitor-agent/src/mastra/agents/dev.ts`)**

- Development and testing utilities
- Local validation workflows

### Tool Implementation Patterns

#### Direct Tool Integration (PREFERRED)

**ALWAYS use this approach unless you have a specific reason to use MCP servers.**

Tools should be implemented directly as Mastra tools using the `createTool` function from
`@mastra/core/tools`. This is the simplest and most efficient approach.

```typescript
// Implementation in docker-tools.ts
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// Implement core functionality as standalone functions
export const buildDockerImage = async (dockerfilePath, imageName, platform) => {
    // Implementation...
};

// Export as a tool for use with Mastra
export const dockerBuildTool = createTool({
    id: "Docker Build",
    inputSchema: z.object({
        // Schema definition...
    }),
    description: "Builds a Docker image from a Dockerfile",
    execute: async ({ context }) => {
        return await buildDockerImage(context.dockerfilePath, context.imageName, context.platform);
    },
});
```

#### Key Tool Categories

**Git Tools (`git-tools.ts`)**

- Repository checkout with organization fallback
- Auto-retry with "runpod-workers" fallback organization
- Timeout controls and error handling

**Docker Tools (`docker-tools.ts`)**

- GPU-aware container execution
- Cross-platform Dockerfile detection
- Build and validation operations

**File System Tools (`file-system-tools.ts`)**

- Cross-platform file operations
- Repository scanning and analysis

**Pull Request Tools (`pull-request.ts`)**

- GitHub API integration via MCP
- PR creation and management

## GPU-Aware Validation System

### Core Innovation

The system intelligently handles CUDA vs non-CUDA Docker images based on GPU availability:

```typescript
// GPU Detection Logic
const checkGpuAvailability = () => {
    try {
        execSync("nvidia-smi", { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
};

// CUDA Detection Logic
const isCudaDockerfile = (dockerfileContent) => {
    const cudaPatterns = [
        /FROM.*nvidia.*cuda/i,
        /FROM.*pytorch.*cuda/i,
        /nvidia-smi/i,
        /CUDA_VERSION/i,
    ];
    return cudaPatterns.some((pattern) => pattern.test(dockerfileContent));
};
```

### Validation Strategy

**Non-CUDA Images (any instance):**

- Full validation: build + run + logs collection
- Complete container testing

**CUDA Images + No GPU Available:**

- Build-only validation with clear messaging
- Skip container execution to avoid GPU errors

**CUDA Images + GPU Available:**

- Full validation including container execution
- GPU-accelerated testing

### Docker Command Adaptation

```typescript
// Smart GPU flag inclusion
const runDockerContainer = (imageTag, hasGpu, isCudaImage) => {
    const gpuFlag = hasGpu && isCudaImage ? "--gpus all" : "";
    const cmd = `docker run ${gpuFlag} --rm ${imageTag}`;
    return execSync(cmd);
};
```

## Infrastructure Management

### AWS Resource Architecture

**EC2 Instances:**

- Development: t3.micro (no GPU)
- Production: GPU-enabled instances (p3, g4dn series)
- Custom AMIs with pre-installed dependencies

**CloudWatch Logging:**

- Log group: `/janitor-runner`
- Instance-specific log streams
- Real-time log streaming support

**VPC and Security:**

- Public subnets for simplicity
- Security groups allowing SSH and HTTP/HTTPS
- Instance profiles with CloudWatch permissions

**Database Integration:**

- PostgreSQL database for validation results and reports
- Automatic schema migration and management
- Real-time query capabilities for monitoring
- Database credentials managed via AWS Secrets Manager

### Terraform Structure

```
infra/terraform/
├── main.tf                 # Main infrastructure definition
├── env/
│   ├── dev.tfvars         # Development environment variables
│   └── prod.tfvars        # Production environment variables
└── outputs.tf             # Infrastructure outputs
```

### Custom AMI Building

Uses Packer to create AMIs with pre-installed dependencies:

```bash
# Build custom AMI
cd infra/packer
packer build gpu-ami.pkr.hcl
```

## Logging and Monitoring

### CloudWatch Integration

**Log Commands:**

```bash
# Dump all logs for current instance and exit
make logs ENV=dev

# Follow logs in real-time with streaming
make logs-all ENV=dev
```

**Log Filtering:**

- Automatically filters by current instance ID
- Handles cases where log streams don't exist yet
- Windows Git Bash compatible (`MSYS_NO_PATHCONV=1`)

**Log Access Patterns:**

```bash
# Raw AWS CLI command (used internally)
aws logs tail /janitor-runner \
  --filter-pattern "[$INSTANCE_ID]" \
  --follow \
  --no-cli-pager
```

### Debugging Commands

```bash
# Check what instances are running
make check-instances ENV=dev

# Get SSH connection details
make ssh-info ENV=dev

# SSH into instance for debugging
make ssh ENV=dev

# Database operations
make query-runs ENV=dev        # List recent validation runs
make query-db ENV=dev REPO=name # Query specific repository results
make db-connect ENV=dev        # Connect to database directly
```

## Development Workflow

### Local Development

**Setup:**

```bash
cd packages/janitor-agent
npm install
cp .env.example .env  # Configure environment variables
```

**Local Testing:**

```bash
# Run specific tests
npm run test:docker-validation
npm run test:janitor-add-feature
npm run test:pr-creator

# Test against local repository
./test-local.sh
```

**Docker Development:**

```bash
# Build image locally
make build

# Test container locally
docker run --rm janitor-agent:latest
```

### Agent Testing Patterns

**Direct Function Testing:**

```typescript
// Test core functions directly
import { buildDockerImage } from "../src/mastra/tools/docker-tools.js";

const result = await buildDockerImage("./Dockerfile", "test:latest", "linux/amd64");
expect(result.success).toBe(true);
```

**Agent Integration Testing:**

```typescript
// Test agent with workflows
const workflow = mastra.getWorkflow("dockerValidationWorkflow");
const { runId, start } = workflow.createRun();
const result = await start({ triggerData: { repository: "test-repo" } });
```

### Cross-Platform Considerations

**File Operations:**

- Windows: Manual directory scanning for Dockerfiles
- Linux: Use `find` command with fallback to manual scanning
- Platform detection: `process.platform === 'win32'`

**Command Execution:**

- Use `shell: true` for cross-platform compatibility
- Handle Windows path separators properly
- Include `windowsHide: true` for clean output

## Error Handling Patterns

### Repository Operations

**Git Checkout with Fallback:**

```typescript
// Try specified organization first, then fallback
try {
    await checkoutRepo(org, repo);
} catch (error) {
    if (error.includes("not found")) {
        await checkoutRepo("runpod-workers", repo);
    } else {
        throw error;
    }
}
```

**Timeout Handling:**

```typescript
const options = {
    encoding: "utf8",
    stdio: "pipe",
    shell: true,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    timeout: 5000, // 5 second timeout
};
```

### Docker Operations

**GPU Error Handling:**

```typescript
// Detect and handle GPU-related errors
if (error.includes("could not select device driver") && error.includes("capabilities: [[gpu]]")) {
    return { success: false, error: "GPU not available", skipContainer: true };
}
```

**Log Validation:**

```typescript
// Empty logs are valid, not errors
const logs = await getContainerLogs(containerId);
return {
    success: true,
    logs: logs || "",
    lineCount: logs ? logs.split("\n").length : 0,
    message: logs ? "Logs retrieved" : "No logs produced (not an error)",
};
```

## Security and Best Practices

### API Key Management

- Store all secrets in `.env` file
- Never commit API keys to version control
- Use environment-specific configurations
- Validate key presence before operations

### AWS Security

- Use least-privilege IAM policies
- Terminate instances after use
- Monitor CloudWatch costs
- Use instance profiles, not hardcoded credentials

### GitHub Integration

- Use personal access tokens with minimum required scopes
- Configure tokens for repository access only
- Store tokens securely in environment variables

## Common Issues and Solutions

### Instance Management

**Issue**: Instances left running and incurring costs.
**Solution**: Always use `make kill-instances ENV=dev` after testing.

**Issue**: SSH key not found.
**Solution**: Set `SSH_KEY_PATH` in `.env` or use default `~/.ssh/janitor-key`.

### Logging

**Issue**: Log streams not found for new instances.
**Solution**: Wait a few minutes for logs to appear, or check if instance is running.

**Issue**: Windows path conversion issues.
**Solution**: Use `MSYS_NO_PATHCONV=1` prefix for AWS CLI commands.

### Docker Validation

**Issue**: GPU errors on non-GPU instances.
**Solution**: System automatically detects and handles this with build-only validation.

**Issue**: Container execution timeouts.
**Solution**: Adjust timeout values in Docker execution commands.

## Future Enhancements

### Infrastructure

- Auto-scaling based on workload
- Multi-region deployment support
- Cost optimization strategies
- Enhanced monitoring and alerting

### Agent Capabilities

- Support for more repository types
- Enhanced error analysis and fixing
- Integration with more CI/CD systems
- Automated PR review and merging

### Developer Experience

- Local development with GPU simulation
- Better debugging tools and interfaces
- Automated testing pipelines
- Performance monitoring and optimization

## Git Conventions

### Commit Message Format

All commit messages must follow Angular conventional commit format with lowercase text:

```
type(scope): description

optional body

optional footer
```

**Types:**

- `feat`: new feature
- `fix`: bug fix
- `docs`: documentation changes
- `style`: formatting, missing semicolons, etc.
- `refactor`: code change that neither fixes a bug nor adds a feature
- `perf`: performance improvement
- `test`: adding missing tests
- `chore`: maintenance tasks, dependencies, etc.
- `ci`: continuous integration changes
- `build`: build system changes

**Scope:**

- Use kebab-case for multi-word scopes
- Common scopes: `setup`, `deploy`, `auth`, `api`, `db`, `agent`, `tools`

**Description:**

- Use lowercase and imperative mood ("add" not "adds" or "added")
- No period at the end
- Maximum 72 characters

**Examples:**

```bash
feat(setup): add real-time bootstrap progress monitoring
fix(auth): handle expired github tokens properly
docs(readme): update installation instructions
refactor(agent): simplify validation workflow
chore(deps): update mastra to v0.10.9
```

**Multi-line commits:**

```bash
feat(api): add repository validation endpoints

- implement POST /api/prompt for natural language requests
- add GET /api/results/{runId} for status checking
- include error handling for invalid repositories

closes #123
```

## Conclusion

This document should serve as the primary reference for working with the Janitor Agent project. The monorepo structure allows for coordinated development of both agent logic and infrastructure, while the Makefile provides a unified interface for all operations.

Key principles:

1. **Infrastructure as Code**: All AWS resources managed via Terraform
2. **GPU-Aware Validation**: Smart handling of CUDA vs non-CUDA workloads
3. **Clean Separation**: Packages for different concerns (agent, infrastructure)
4. **Operational Simplicity**: Single Makefile interface for all operations
5. **Cost Awareness**: Automatic cleanup and monitoring

Remember to always clean up AWS resources after testing and follow the established patterns for consistency and maintainability.
