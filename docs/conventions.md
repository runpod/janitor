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
SUPABASE_DB_PASSWORD=your-db-password

# AWS Configuration (Simplified)
AWS_PROFILE=janitor
AWS_REGION=us-east-1
SSH_KEY_NAME=janitor-key
SSH_KEY_PATH=~/.ssh/janitor-key
```

### Prerequisites

- AWS CLI configured with appropriate permissions
- Node.js and npm/pnpm installed
- Docker installed (for local testing)
- SSH key pair for AWS instances
- Supabase project created with database password

## Deployment and Operations

### Primary Workflow Commands

The Makefile provides the primary interface for all operations:

```bash
# Setup (one-time)
make setup-supabase            # Set up Supabase database with Drizzle
make start                     # Launch GPU instance
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
make start

# 2. Monitor logs (real-time)
make logs

# 3. Send validation requests
make prompt PROMPT="validate worker-basic"
make prompt FILE=validate

# 4. Get validation results
make query-results

# 5. Clean up when done
make stop
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

### Multi-Repository Processing Pattern

**Sequential Processing**: When multiple repositories are specified, the server processes them individually and sequentially. Each repository receives its own complete janitor agent run and analyzer run, with results stored immediately upon completion.

**Immediate Database Updates**: Results are stored in the database immediately after each repository completes processing, enabling real-time progress monitoring. Users can query partial results during long-running multi-repository validations.

**Single Repository Analysis**: The analyzer agent is designed to analyze one repository at a time. When building new analysis features, ensure prompts specify which single repository to analyze to avoid cross-repository contamination.

### Repository Status Lifecycle

**Status Flow**: All repositories follow a consistent status lifecycle from initiation to completion:

```
"queued" → "running" → "success"/"failed"/"cancelled"
```

**Status Definitions:**

- **`"queued"`**: Repository is waiting to be processed (initial state for all repos)
- **`"running"`**: Repository is currently being processed by the janitor agent
- **`"success"`**: Repository validation completed successfully
- **`"failed"`**: Repository validation failed or encountered errors
- **`"cancelled"`**: Processing was explicitly cancelled by user

**Processing Rules:**

1. **Initial State**: All repositories start as `"queued"` when a run is initiated
2. **Sequential Processing**: Only one repository is `"running"` at a time per run
3. **Status Updates**: Status changes are immediately persisted to database
4. **Continue Logic**: Incomplete repositories (`"queued"` or `"running"`) can be resumed
5. **Cancellation**: Both `"queued"` and `"running"` repositories can be cancelled

**Database Queries**: Functions that work with incomplete repositories must query for both `"queued"` and `"running"` status:

```typescript
// Correct: Find incomplete repositories
`validation_status=eq.queued OR validation_status=eq.running` // Incorrect: Missing queued repositories
`validation_status=eq.running`;
```

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
- Production: GPU-enabled instances (g5, g4dn, p3 series)
- Deep Learning Base AMI (Ubuntu 22.04) with CUDA 12.x pre-installed

**CloudWatch Logging:**

- Log group: `/janitor-runner`
- Instance-specific log streams
- Real-time log streaming support

**VPC and Security:**

- Public subnets for simplicity
- Security groups allowing SSH and HTTP/HTTPS
- Instance profiles with CloudWatch permissions

**Database Integration:**

- Supabase (PostgreSQL) for validation results and reports
- Schema managed exclusively through Drizzle ORM
- Automatic migration and versioning via Drizzle Kit
- Real-time query capabilities for monitoring

### Terraform Structure

```
infra/terraform/
├── main.tf                 # Main infrastructure definition
├── env/
│   ├── dev.tfvars         # Development environment variables
│   └── prod.tfvars        # Production environment variables
└── outputs.tf             # Infrastructure outputs
```

### AMI Selection Strategy

The system automatically selects the latest AWS Deep Learning Base AMI:

**Primary:** Deep Learning Base OSS Nvidia Driver GPU AMI (Ubuntu 22.04)

- CUDA 12.8 (default, with 12.4, 12.5, 12.6 available)
- NVIDIA Driver 570.x
- Ubuntu 22.04 with Kernel 6.8
- Docker and NVIDIA Container Toolkit pre-installed

**Selection Method:**

1. Query latest AMI via SSM parameter (AWS recommended)
2. Fallback to direct AMI search by name pattern
3. Final fallback to any Deep Learning AMI

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

# SSH into instance for debugging
make ssh

# Database operations
make query-results             # List recent validation runs
make query-results RUN_ID=id   # Query specific run results
make query-results REPO=name   # Query specific repository results

# Schema management (use these instead of manual SQL)
cd packages/janitor-agent
npm run db:generate            # Generate migration from schema changes
npm run db:migrate             # Apply migrations to database
npm run db:studio              # Open Drizzle Studio for inspection
```

## Development Workflow

### Local Development

**Setup:**

```bash
cd packages/janitor-agent
npm install
cp .env.example .env  # Configure environment variables

# Apply database schema
npm run db:migrate
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

## Database Schema Management

### Drizzle ORM Integration

**CRITICAL: All database schema changes must be made through Drizzle ORM. Never modify the database schema manually.**

The project uses Drizzle ORM for type-safe database operations and schema management:

```typescript
// packages/janitor-agent/src/db/schema.ts
export const validationResults = pgTable(
    "validation_results",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        run_id: uuid("run_id").notNull(),
        repository_name: text("repository_name").notNull(),
        organization: text("organization").notNull(),
        validation_status: text("validation_status").notNull(), // See "Repository Status Lifecycle" section
        results_json: jsonb("results_json").notNull(),
        created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        // Enhanced prompt tracking
        original_prompt: text("original_prompt"),
        repository_prompt: text("repository_prompt"),
    },
    // ... indexes
);
```

### Schema Change Workflow

**Adding/Modifying Columns:**

1. Update the schema in `packages/janitor-agent/src/db/schema.ts`
2. Generate migration: `npm run db:generate`
3. Apply migration: `npm run db:migrate`
4. Update TypeScript interfaces in `src/utils/supabase.ts` if needed

**Example Schema Change:**

```bash
cd packages/janitor-agent

# 1. Edit src/db/schema.ts
# 2. Generate migration
npm run db:generate

# 3. Review generated migration in drizzle/ folder
# 4. Apply to database
npm run db:migrate
```

### Database Commands

```bash
# Generate migration from schema changes
npm run db:generate

# Apply pending migrations to database
npm run db:migrate

# Open Drizzle Studio for database inspection
npm run db:studio
```

### Environment Setup for Database

Ensure your `.env` file includes the required Supabase credentials:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_DB_PASSWORD=your-database-password  # Required for migrations
```

**Getting Database Password:**

1. Go to Supabase Dashboard → Settings → Database
2. Find "Database password" section
3. Copy the password (this is different from service role key)

### Migration Best Practices

- **Never** manually edit migration files in `drizzle/` folder
- **Always** test migrations on development environment first
- **Review** generated SQL before applying to production
- **Backup** important data before schema changes
- **Version control** all schema changes through Git

### Type Safety

Drizzle provides full TypeScript type safety:

```typescript
// Automatic type inference from schema
import { validationResults } from "./src/db/schema.js";

// Type-safe queries
const result = await db.select().from(validationResults).where(eq(validationResults.run_id, runId));
// result is automatically typed based on schema
```

## Common Issues and Solutions

### Instance Management

**Issue**: Instances left running and incurring costs.
**Solution**: Always use `make stop` after testing.

**Issue**: SSH key not found.
**Solution**: Set `SSH_KEY_PATH` in `.env` or use default `~/.ssh/janitor-key`.

### Database Schema Issues

**Issue**: Database schema out of sync with code.
**Solution**: Run `npm run db:migrate` in `packages/janitor-agent/` to apply pending migrations.

**Issue**: Missing database password for migrations.
**Solution**: Add `SUPABASE_DB_PASSWORD` to `.env` (get from Supabase Dashboard → Settings → Database).

**Issue**: Migration fails with "schema cache" error.
**Solution**: Ensure Supabase project is running and credentials are correct. Check network connectivity.

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

## Project Replication Guide

To replicate this project in a new environment:

### 1. Supabase Setup

```bash
# Create new Supabase project at https://app.supabase.com
# Copy URL, anon key, service role key, and database password to .env
```

### 2. Database Schema Setup

```bash
cd packages/janitor-agent
npm install
npm run db:migrate  # Apply all migrations to create tables
```

### 3. AWS Setup

```bash
# Configure AWS CLI with appropriate permissions
aws configure --profile janitor

# Create SSH key pair
ssh-keygen -t rsa -b 4096 -f ~/.ssh/janitor-key
aws ec2 import-key-pair --key-name janitor-key --public-key-material fileb://~/.ssh/janitor-key.pub
```

### 4. Launch Instance

```bash
make start  # This will bootstrap the instance with all dependencies
```

### 5. Verify Setup

```bash
make prompt PROMPT="validate worker-basic"  # Test the system
make query-results  # Check results in database
```

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

1. **Database Schema as Code**: All database changes managed via Drizzle ORM
2. **GPU-Aware Validation**: Smart handling of CUDA vs non-CUDA workloads
3. **Clean Separation**: Packages for different concerns (agent, infrastructure)
4. **Operational Simplicity**: Single Makefile interface for all operations
5. **Cost Awareness**: Automatic cleanup and monitoring
6. **Type Safety**: Full TypeScript integration with database schema

Remember to always clean up AWS resources after testing and follow the established patterns for consistency and maintainability.
