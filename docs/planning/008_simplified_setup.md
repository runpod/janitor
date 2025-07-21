# Simplified Persistent GPU Janitor Setup

## User Story

As a Janitor maintainer, I want a single persistent GPU instance running Mastra server that I can send natural language prompts to via API, so that I can validate repositories without managing complex disposable infrastructure, database migrations, or multiple AWS services.

## Description

Dramatically simplify the current infrastructure by replacing the complex disposable instance + custom database architecture with a streamlined persistent setup:

1. Replace disposable EC2 instances with a single persistent GPU instance that stays running
2. Replace custom PostgreSQL database with Supabase for storage and querying
3. Use Mastra server's built-in API to accept natural language prompts instead of complex orchestration
4. Eliminate Terraform complexity by using a simple long-running instance approach
5. Remove S3, CloudWatch logging complexity, and custom bootstrap scripts
6. Enable direct prompt-based interaction: "please validate these repos: RunPod/worker-basic"
7. Store validation results in simple Supabase tables for easy querying and potential future dashboards

The simplified system should support:

- Direct API calls with natural language instructions
- Persistent instance that doesn't need constant provisioning/teardown
- Simple Supabase integration for storing validation results
- Mastra's built-in storage provider for agent state management
- Cost-effective always-on approach instead of per-run provisioning overhead

## Acceptance Criteria

- Single persistent GPU instance (g5.xlarge or similar) runs continuously with Mastra server
- Users can send validation requests via simple HTTP API calls with natural language prompts
- Example API call: `curl -X POST http://instance-ip:3000/api/prompt -d '{"message": "please validate these repos: RunPod/worker-basic"}'`
- Mastra server handles the prompt parsing and orchestrates the janitor agent internally
- All validation results are stored in Supabase tables with simple schema (run_id, repo_name, status, results_json, timestamp)
- Users can query results directly from Supabase web interface or via simple API calls
- The `make` interface is simplified to just: `make start-instance`, `make stop-instance`, `make send-prompt`
- No Terraform complexity - just a simple EC2 instance with user-data script that installs Docker, Node.js, and starts Mastra server
- Supabase project handles all database needs (authentication, storage, real-time subscriptions, API)
- Instance automatically restarts Mastra server on reboot and handles basic failure recovery
- Docker layer caching persists on the instance via EBS volume to speed up builds
- Total setup time reduced from hours to minutes compared to current infrastructure
- Monthly cost predictable and manageable (single instance + Supabase free tier)
- Agent uses Mastra's built-in storage provider for agent state and memory management

## Technical Notes

- **Infrastructure Components**:

    - Single EC2 instance (g5.xlarge) with GPU support
    - Simple user-data script that installs dependencies and starts Mastra server
    - EBS volume for Docker layer caching and persistent storage
    - Security group allowing HTTP/HTTPS access to Mastra server API
    - No VPC complexity, no Aurora, no S3, no complex Terraform modules

- **Supabase Integration**:

    ```sql
    -- Simple validation results table
    CREATE TABLE validation_results (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      run_id UUID NOT NULL,
      repository_name TEXT NOT NULL,
      organization TEXT NOT NULL,
      validation_status TEXT NOT NULL, -- 'success', 'failed', 'running'
      results_json JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Simple index for querying
    CREATE INDEX idx_validation_results_repo ON validation_results(repository_name);
    CREATE INDEX idx_validation_results_run_id ON validation_results(run_id);
    ```

- **Mastra Server Setup**:

    - Use Mastra's built-in server functionality with `/api/prompt` endpoint
    - Configure janitor agent to handle natural language repository validation requests
    - Leverage Mastra's built-in storage provider for agent state management
    - Simple environment variables for Supabase connection and GitHub tokens

- **Simplified Monorepo Structure**:

    ```
    janitor/
    ├── packages/janitor-agent/     # Existing Mastra agent (minimal changes)
    ├── infra/
    │   ├── simple-instance.sh     # Simple EC2 launch script
    │   └── user-data.sh          # Instance bootstrap script
    ├── scripts/
    │   ├── start-instance.sh     # Start the persistent instance
    │   ├── stop-instance.sh      # Stop the instance to save costs
    │   └── send-prompt.sh        # Send validation prompts via API
    └── Makefile                  # Simplified make targets
    ```

- **Developer Workflow**:

    ```bash
    # One-time setup
    make setup-supabase          # Create Supabase project and tables
    make setup-instance          # Launch and configure the GPU instance

    # Daily usage
    make send-prompt PROMPT="validate RunPod/worker-basic"
    make query-results REPO="worker-basic"

    # Cost management
    make stop-instance           # Stop instance when not needed
    make start-instance          # Restart when needed
    ```

- **API Integration**:

    - Mastra server exposes HTTP API for prompt-based interactions
    - Agent parses natural language requests to extract repository lists
    - Results stored directly to Supabase via simple INSERT operations
    - Real-time updates possible via Supabase subscriptions

- **Security Configuration**:

    - Instance security group allows HTTP access to Mastra server
    - Supabase handles authentication and row-level security
    - GitHub tokens and Supabase credentials via environment variables
    - No complex IAM roles or database permissions management

- **Cost Optimization**:
    - Stop instance when not actively validating (vs. always-on Terraform resources)
    - Supabase free tier covers expected usage (500MB database, 50MB file storage)
    - No Aurora, no CloudWatch logs storage, no S3 costs
    - Predictable monthly cost: ~$50-100 for GPU instance when running

## Example Usage

```bash
# Initial setup (one-time)
cp .env.example .env                    # Configure GITHUB_TOKEN, SUPABASE_URL, SUPABASE_KEY
make setup-supabase                     # Creates tables in Supabase project
make setup-instance                     # Launches GPU instance with Mastra server

# Daily validation workflow
make send-prompt PROMPT="please validate these repos: RunPod/worker-basic, RunPod/worker-template"

# Check results
make query-results REPO="worker-basic"
# Output:
# Repository: worker-basic
# Status: success
# Last Run: 2024-01-15 14:30:22 UTC
# Build: ✓ Container: ✓ GPU: ✓

# Or check via Supabase web interface
open "https://app.supabase.com/project/your-project/editor"

# Cost management
make stop-instance                      # Stop when not needed
make start-instance                     # Restart for next validation batch
```

## API Examples

```bash
# Send validation prompt via HTTP
curl -X POST http://your-instance-ip:3000/api/prompt \
  -H "Content-Type: application/json" \
  -d '{
    "message": "please validate these repositories: RunPod/worker-basic, RunPod/worker-template"
  }'

# Response
{
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "started",
  "message": "Starting validation for 2 repositories"
}

# Query results via Supabase API
curl -X GET "https://your-project.supabase.co/rest/v1/validation_results?repository_name=eq.worker-basic" \
  -H "apikey: your-supabase-key" \
  -H "Authorization: Bearer your-supabase-key"
```

## Migration Strategy

1. **Phase 1**: Create Supabase project and simple tables
2. **Phase 2**: Launch simple GPU instance with Mastra server
3. **Phase 3**: Modify janitor agent to accept natural language prompts and store results in Supabase
4. **Phase 4**: Test with small repository list via API calls
5. **Phase 5**: Create simplified make commands for daily usage
6. **Phase 6**: **MASSIVE CLEANUP** - Remove complex infrastructure files:
    - Delete entire `infra/terraform/` directory (main.tf, database.tf, backend.tf, env/)
    - Delete entire `infra/packer/` directory (gpu-ami.pkr.hcl)
    - Delete `infra/database/` directory (migrations, migrate.sh)
    - Delete complex scripts (`bootstrap.sh`, `launch-test-instance.sh`, `launch-janitor.sh`)
    - Remove 80% of Makefile targets (infra-_, db-_, logs-_, query-_, etc.)
    - Delete AWS-specific documentation (005_aws.md, 006_report_in_db.md)
    - Clean up package.json dependencies related to database clients

**Files We Keep:**

- `packages/janitor-agent/` (Mastra agent with minimal Supabase changes)
- Simple scripts in `scripts/` (3-4 simple shell scripts)
- Simplified Makefile (5-6 commands total)
- Core documentation and conventions

**Result**: Codebase shrinks from ~50 infrastructure files to ~10 simple files.

This approach reduces complexity by 80% while maintaining all core functionality and improving the developer experience significantly.
