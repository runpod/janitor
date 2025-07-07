# Centralized Database Reporting

## User Story

As a Janitor maintainer, I want validation reports stored in a centralized database instead of individual files, so that I can query validation status for specific repositories, track historical results across multiple maintenance runs, and build reporting dashboards on top of structured data.

## Epic

This user story is part of the "RunPod Worker Repository Auto Maintenance" epic, which aims to create automated tools for maintaining and validating RunPod worker repositories.

## Description

Replace the current file-based reporting system with a centralized database solution:

1. Replace S3 file uploads and local file downloads with database storage for all validation reports
2. Implement a structured database schema that supports querying validation status by repository, date, and validation type
3. Store detailed validation results, error logs, and execution metadata in the database
4. Provide database querying capabilities for validation status lookup and historical tracking
5. Remove the `make fetch-report` command and replace with database query tools
6. Maintain CloudWatch logging for operational debugging while storing structured results in the database
7. Prepare the data structure for future frontend dashboard integration

The database-based reporting should support:

-   Storing validation results for multiple repositories per run
-   Tracking historical validation status across multiple maintenance cycles
-   Querying validation status for specific repositories
-   Storing detailed error information and remediation steps
-   Supporting both validation-only and feature-addition operations
-   Scalable schema design for growing repository lists

## Acceptance Criteria

-   AWS Aurora Serverless v2 (PostgreSQL) database is provisioned via Terraform in the infrastructure
-   Database includes proper schema for validation runs, repository results, and detailed reports
-   The Janitor agent stores all validation results directly to the database instead of generating JSON files
-   Users can query validation status for specific repositories using database query commands
-   The system stores the following data for each validation run:
    -   Run metadata: timestamp, instance ID, environment, repository list
    -   Repository-level results: validation status, build success, container execution results
    -   Detailed reports: error logs, remediation steps, performance metrics
    -   Feature addition results: added files, modified content, PR links
-   The `make fetch-report ENV=dev` command is replaced with `make query-db ENV=dev REPO=repo-name` for specific repository status
-   A new `make query-runs ENV=dev` command shows recent validation runs and their overall status
-   Database includes proper indexes for efficient querying by repository name, timestamp, and validation status
-   The system handles database connection failures gracefully and retries operations
-   Database credentials are managed securely through AWS Secrets Manager
-   **Agent has minimal database permissions**: only INSERT/UPDATE operations on specific tables, no administrative rights
-   Query operations use separate read-only credentials for security isolation
-   CloudWatch logging continues to capture operational logs while structured data goes to the database
-   Database schema supports future frontend integration with proper API-friendly structure

## Technical Notes

-   **Database Infrastructure**:

    -   Use Aurora Serverless v2 (PostgreSQL) for cost-effective, scalable database solution
    -   Deploy in private subnets with proper VPC security groups
    -   Use AWS Secrets Manager for database credential management
    -   Implement automatic backups and point-in-time recovery

-   **Database Schema Design**:

    ```sql
    -- Validation runs table
    CREATE TABLE validation_runs (
      id SERIAL PRIMARY KEY,
      run_id UUID UNIQUE NOT NULL,
      environment VARCHAR(50) NOT NULL,
      instance_id VARCHAR(50),
      started_at TIMESTAMP NOT NULL,
      completed_at TIMESTAMP,
      status VARCHAR(50) NOT NULL, -- 'running', 'completed', 'failed'
      repository_count INTEGER,
      repos_file_path VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Repository validation results
    CREATE TABLE repository_validations (
      id SERIAL PRIMARY KEY,
      run_id UUID REFERENCES validation_runs(run_id),
      repository_name VARCHAR(255) NOT NULL,
      organization VARCHAR(255) NOT NULL,
      validation_status VARCHAR(50) NOT NULL, -- 'success', 'failed', 'skipped'
      validation_type VARCHAR(50) NOT NULL, -- 'docker_validation', 'feature_addition'
      build_success BOOLEAN,
      container_execution_success BOOLEAN,
      gpu_available BOOLEAN,
      cuda_detected BOOLEAN,
      error_message TEXT,
      execution_time_seconds INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Detailed validation reports (JSON storage)
    CREATE TABLE validation_reports (
      id SERIAL PRIMARY KEY,
      validation_id INTEGER REFERENCES repository_validations(id),
      report_type VARCHAR(50) NOT NULL, -- 'build_log', 'container_log', 'error_details', 'feature_changes'
      report_data JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes for efficient querying
    CREATE INDEX idx_repo_validations_repo_name ON repository_validations(repository_name);
    CREATE INDEX idx_repo_validations_run_id ON repository_validations(run_id);
    CREATE INDEX idx_repo_validations_status ON repository_validations(validation_status);
    CREATE INDEX idx_validation_runs_environment ON validation_runs(environment);
    CREATE INDEX idx_validation_runs_started_at ON validation_runs(started_at);
    ```

-   **Agent Integration**:

    -   Create new database tools in `packages/janitor-agent/src/mastra/tools/database-tools.ts`
    -   Implement connection pooling for efficient database access
    -   Add database operations to the validation workflow
    -   Remove S3 report upload functionality from bootstrap scripts

-   **Infrastructure Components**:

    -   Terraform module for Aurora Serverless v2 cluster
    -   VPC configuration with private subnets for database
    -   Security groups allowing database access from EC2 instances
    -   Secrets Manager integration for database credentials
    -   IAM roles with database access permissions

-   **New Make Commands**:

    ```bash
    make query-db ENV=dev REPO=repo-name      # Query specific repository status
    make query-runs ENV=dev                   # List recent validation runs
    make db-connect ENV=dev                   # Connect to database for manual queries
    make db-migrate ENV=dev                   # Run database migrations
    ```

-   **Security Configuration**:

    -   Database in private subnets, not publicly accessible
    -   EC2 instances connect via VPC security groups
    -   Database credentials stored in AWS Secrets Manager
    -   **Agent-specific minimal database permissions**:
        -   `INSERT` on `validation_runs`, `repository_validations`, `validation_reports` tables only
        -   `UPDATE` on `validation_runs` table only (for completion status)
        -   `SELECT` on `validation_runs` table only (for run_id validation)
        -   NO permissions for `DROP`, `DELETE`, `ALTER`, or administrative functions
    -   **Query command credentials** (separate from agent):
        -   `SELECT` permissions on all tables for read-only operations
        -   Used only by make commands (`query-db`, `query-runs`, `db-connect`)
    -   Database encryption at rest and in transit

-   **Migration Strategy**:
    -   Implement database tools alongside existing file-based system initially
    -   Gradual migration of functionality from file-based to database storage
    -   Keep CloudWatch operational logging unchanged
    -   Remove S3 report functionality after database integration is validated

## Example Usage

```bash
# Prerequisites (one-time setup)
make infra-apply ENV=dev    # Includes new database infrastructure
make db-migrate ENV=dev     # Initialize database schema

# Execute validation run (stores results in database)
make launch-instance ENV=dev
make logs-all ENV=dev       # Operational logging continues via CloudWatch

# Query validation results from database
make query-db ENV=dev REPO=worker-template
# Output:
# Repository: worker-template
# Last Validation: 2024-01-15 14:30:22 UTC
# Status: success
# Build: ✓ succeeded
# Container: ✓ executed successfully
# GPU Available: ✓ CUDA detected and GPU available
# Execution Time: 45 seconds

# List recent validation runs
make query-runs ENV=dev
# Output:
# Run ID: 550e8400-e29b-41d4-a716-446655440000
# Environment: dev
# Started: 2024-01-15 14:28:15 UTC
# Status: completed
# Repositories: 5/5 successful

# Connect to database for custom queries
make db-connect ENV=dev
# Opens psql connection for manual queries

# Query specific repository history
SELECT rv.repository_name, rv.validation_status, rv.created_at
FROM repository_validations rv
WHERE rv.repository_name = 'worker-template'
ORDER BY rv.created_at DESC LIMIT 10;
```

## Database Query Examples

```sql
-- Get validation status for a specific repository
SELECT
  rv.repository_name,
  rv.validation_status,
  rv.build_success,
  rv.container_execution_success,
  rv.created_at
FROM repository_validations rv
WHERE rv.repository_name = 'worker-template'
ORDER BY rv.created_at DESC
LIMIT 5;

-- Get overall success rate by repository
SELECT
  repository_name,
  COUNT(*) as total_validations,
  COUNT(CASE WHEN validation_status = 'success' THEN 1 END) as successful,
  ROUND(COUNT(CASE WHEN validation_status = 'success' THEN 1 END) * 100.0 / COUNT(*), 2) as success_rate
FROM repository_validations
GROUP BY repository_name
ORDER BY success_rate DESC;

-- Get recent validation runs summary
SELECT
  vr.run_id,
  vr.environment,
  vr.started_at,
  vr.status,
  COUNT(rv.id) as total_repos,
  COUNT(CASE WHEN rv.validation_status = 'success' THEN 1 END) as successful_repos
FROM validation_runs vr
LEFT JOIN repository_validations rv ON vr.run_id = rv.run_id
GROUP BY vr.run_id, vr.environment, vr.started_at, vr.status
ORDER BY vr.started_at DESC
LIMIT 10;
```
