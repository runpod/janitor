# Parallel Multi-Repository Validation System

## User Story

As a Janitor maintainer, I want to execute custom validation prompts against multiple RunPod worker repositories in parallel using dedicated GPU instances, so that I can efficiently validate the entire runpod-workers organization's repositories with tailored validation logic per repository while maintaining cost control and preventing runaway processes.

## Description

Extend the centralized database reporting system to support parallel validation of multiple repositories with custom prompts:

1. Implement a repository configuration system that allows specifying custom validation prompts for each repository
2. Create a parallel execution system that launches dedicated GPU instances for each repository validation
3. Provide a single command interface that triggers validation across all configured repositories simultaneously
4. Implement hard timeout limits (configurable, default 30 minutes) to prevent runaway instances and costs
5. Store all validation results in the centralized database with repository-specific prompt tracking
6. Ensure proper GPU instance provisioning for repositories that require GPU validation

The system should start with three initial repositories:

- `runpod-workers/worker-basic`
- `runpod-workers/worker-sdxl`
- `runpod-workers/worker-faster_whisper`

Each repository will receive the validation prompt: "validate the repo and see if its still working"

## Acceptance Criteria

- A new repository configuration file `infra/workers-config.yaml` defines repositories with custom prompts:
    ```yaml
    repositories:
        - name: worker-basic
          organization: runpod-workers
          prompt: "validate the repo and see if its still working"
          gpu_required: true
        - name: worker-sdxl
          organization: runpod-workers
          prompt: "validate the repo and see if its still working"
          gpu_required: true
        - name: worker-faster_whisper
          organization: runpod-workers
          prompt: "validate the repo and see if its still working"
          gpu_required: true
    ```
- Users can trigger parallel validation with `make validate-all-workers ENV=dev CONFIG=infra/workers-config.yaml`
- The system launches separate GPU instances (g5.xlarge or similar) for each repository in the configuration
- Each instance executes the Janitor agent with the repository-specific prompt
- Hard timeout limit of 30 minutes (configurable via `TIMEOUT_MINUTES` environment variable) automatically terminates instances
- All validation results are stored in the database with repository name, custom prompt, and execution metadata
- The system tracks instance launch, execution, and termination in the database for cost monitoring
- Users can query results per repository using existing database tools: `make query-db ENV=dev REPO=worker-basic`
- The command returns overall success/failure status and individual repository results
- CloudWatch logging captures all parallel execution logs with instance-specific log streams
- Database schema extends to support custom prompts and parallel execution tracking
- Cost safety: All instances terminate within the timeout period regardless of execution status

## Technical Notes

- **Repository Configuration**:

    - YAML-based configuration with repository name, organization, custom prompt, and GPU requirements
    - Support for future expansion to include validation type, timeout overrides, and instance type preferences
    - Validation of configuration file before execution to catch errors early

- **Parallel Execution Architecture**:

    - Launch multiple EC2 instances simultaneously using Terraform or AWS API calls
    - Each instance runs independent Janitor validation with repository-specific prompt
    - Instance naming convention: `janitor-{repo-name}-{timestamp}` for tracking
    - Coordinated shutdown: Master process monitors all instances and enforces timeout limits

- **Database Schema Extension**:

                    ```sql

    -- Extend validation_runs table
    ALTER TABLE validation_runs ADD COLUMN config_file_path VARCHAR(255);
    ALTER TABLE validation_runs ADD COLUMN total_repositories INTEGER;
    ALTER TABLE validation_runs ADD COLUMN timeout_minutes INTEGER DEFAULT 30;

    -- Extend repository_validations table
    ALTER TABLE repository_validations ADD COLUMN custom_prompt TEXT;
    ALTER TABLE repository_validations ADD COLUMN instance_id VARCHAR(50);
    ALTER TABLE repository_validations ADD COLUMN timeout_enforced BOOLEAN DEFAULT false;

    ```

    ```

- **GPU Instance Management**:

    - Use g5.xlarge instances for cost-effective GPU access
    - Launch template configuration for consistent GPU instance setup
    - Automatic instance termination via CloudWatch alarms and Lambda functions
    - Instance state tracking in database for cost monitoring

- **Timeout Implementation**:

    - CloudWatch alarm triggers Lambda function after timeout period
    - Lambda function force-terminates instances and updates database status
    - Grace period of 2 minutes for clean shutdown before force termination
    - Configurable timeout via environment variable `TIMEOUT_MINUTES=30`

- **Cost Control Measures**:

    - Maximum concurrent instances limit (default: 10)
    - Automatic spot instance termination handling
    - Cost estimation before execution based on instance count and timeout

- **New Make Commands**:

    ```bash
    make validate-all-workers ENV=dev CONFIG=infra/workers-config.yaml    # Execute parallel validation
    make validate-all-workers ENV=dev TIMEOUT_MINUTES=45                  # Custom timeout
    make check-parallel-status ENV=dev                                    # Check running parallel jobs
    make kill-all-workers ENV=dev                                         # Emergency termination
    make query-parallel-run ENV=dev RUN_ID=uuid                          # Query specific parallel run
    ```

- **Monitoring and Observability**:
    - CloudWatch dashboard showing parallel execution status
    - Instance lifecycle monitoring (launch, running, terminated)
    - Error aggregation across all parallel executions

## Example Usage

```bash
# Prerequisites (database and infrastructure already set up from previous user stories)
make infra-apply ENV=dev

# Execute parallel validation for all workers
make validate-all-workers ENV=dev CONFIG=infra/workers-config.yaml

# Output:
# Launching parallel validation for 3 repositories...
# ✓ worker-basic: Instance i-1234567890abcdef0 launched
# ✓ worker-sdxl: Instance i-abcdef1234567890 launched
# ✓ worker-faster_whisper: Instance i-567890abcdef1234 launched
#
# Timeout: 30 minutes
# Use 'make check-parallel-status ENV=dev' to monitor progress
# Use 'make kill-all-workers ENV=dev' for emergency termination

# Monitor parallel execution status
make check-parallel-status ENV=dev

# Output:
# Parallel Run: 550e8400-e29b-41d4-a716-446655440000
# Started: 2024-01-15 14:30:00 UTC
# Timeout: 30 minutes (18 minutes remaining)
#
# worker-basic: ✓ completed (5 minutes ago)
# worker-sdxl: ⏳ running (15 minutes elapsed)
# worker-faster_whisper: ⏳ running (15 minutes elapsed)

# Query results for specific repository
make query-db ENV=dev REPO=worker-basic

# Output:
# Repository: worker-basic
# Custom Prompt: "validate the repo and see if its still working"
# Last Validation: 2024-01-15 14:35:22 UTC
# Status: success
# Instance: i-1234567890abcdef0
# Execution Time: 4 minutes 32 seconds
# Build: ✓ succeeded
# Container: ✓ executed successfully
# GPU Available: ✓ CUDA detected and GPU available

# Query entire parallel run
make query-parallel-run ENV=dev RUN_ID=550e8400-e29b-41d4-a716-446655440000

# Output:
# Run ID: 550e8400-e29b-41d4-a716-446655440000
# Configuration: infra/workers-config.yaml
# Started: 2024-01-15 14:30:00 UTC
# Completed: 2024-01-15 14:52:15 UTC
# Total Duration: 22 minutes 15 seconds
# Timeout: 30 minutes (not enforced)
#
# Results:
# ✓ worker-basic: success (4m32s)
# ✓ worker-sdxl: success (18m45s)
# ✓ worker-faster_whisper: success (16m22s)
#
# Overall Status: 3/3 repositories successful
```

## Configuration File Format

```yaml
# infra/workers-config.yaml
repositories:
    - name: worker-basic
      organization: runpod-workers
      prompt: "validate the repo and see if its still working"
      gpu_required: true
      timeout_minutes: 30 # Optional override
      instance_type: g5.xlarge # Optional override

    - name: worker-sdxl
      organization: runpod-workers
      prompt: "validate the repo and see if its still working"
      gpu_required: true

    - name: worker-faster_whisper
      organization: runpod-workers
      prompt: "validate the repo and see if its still working"
      gpu_required: true

# Global configuration
default_timeout_minutes: 30
max_concurrent_instances: 10
```
