-- Janitor Database Initial Schema
-- Migration: 001_initial_schema.sql
-- Description: Creates the core tables for validation runs, repository validations, and detailed reports

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Validation runs table
CREATE TABLE validation_runs (
    id SERIAL PRIMARY KEY,
    run_id UUID UNIQUE NOT NULL DEFAULT uuid_generate_v4(),
    environment VARCHAR(50) NOT NULL,
    instance_id VARCHAR(50),
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    status VARCHAR(50) NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
    repository_count INTEGER,
    repos_file_path VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Repository validation results
CREATE TABLE repository_validations (
    id SERIAL PRIMARY KEY,
    run_id UUID REFERENCES validation_runs(run_id) ON DELETE CASCADE,
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
    validation_id INTEGER REFERENCES repository_validations(id) ON DELETE CASCADE,
    report_type VARCHAR(50) NOT NULL, -- 'build_log', 'container_log', 'error_details', 'feature_changes'
    report_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX idx_validation_runs_run_id ON validation_runs(run_id);
CREATE INDEX idx_validation_runs_environment ON validation_runs(environment);
CREATE INDEX idx_validation_runs_started_at ON validation_runs(started_at);
CREATE INDEX idx_validation_runs_status ON validation_runs(status);

CREATE INDEX idx_repo_validations_run_id ON repository_validations(run_id);
CREATE INDEX idx_repo_validations_repo_name ON repository_validations(repository_name);
CREATE INDEX idx_repo_validations_org_name ON repository_validations(organization);
CREATE INDEX idx_repo_validations_status ON repository_validations(validation_status);
CREATE INDEX idx_repo_validations_type ON repository_validations(validation_type);
CREATE INDEX idx_repo_validations_created_at ON repository_validations(created_at);

CREATE INDEX idx_validation_reports_validation_id ON validation_reports(validation_id);
CREATE INDEX idx_validation_reports_type ON validation_reports(report_type);

-- Create database users with specific permissions

-- Agent user (minimal permissions for INSERT/UPDATE operations)
CREATE USER janitor_agent WITH PASSWORD 'PLACEHOLDER_PASSWORD';

-- Grant permissions for agent user
GRANT USAGE ON SCHEMA public TO janitor_agent;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO janitor_agent;

-- INSERT permissions for all tables
GRANT INSERT ON validation_runs TO janitor_agent;
GRANT INSERT ON repository_validations TO janitor_agent;
GRANT INSERT ON validation_reports TO janitor_agent;

-- UPDATE permission only on validation_runs (for completion status)
GRANT UPDATE ON validation_runs TO janitor_agent;

-- SELECT permission only on validation_runs (for run_id validation)
GRANT SELECT ON validation_runs TO janitor_agent;

-- Query user (read-only permissions)
CREATE USER janitor_query WITH PASSWORD 'PLACEHOLDER_PASSWORD';

-- Grant read-only permissions for query user
GRANT USAGE ON SCHEMA public TO janitor_query;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO janitor_query;

-- Ensure future tables have the same permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO janitor_query;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT INSERT ON TABLES TO janitor_agent;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO janitor_agent;

-- Create a function to update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add trigger to automatically update updated_at
CREATE TRIGGER update_validation_runs_updated_at 
    BEFORE UPDATE ON validation_runs 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE validation_runs IS 'Stores metadata for each validation run execution';
COMMENT ON TABLE repository_validations IS 'Stores validation results for individual repositories';
COMMENT ON TABLE validation_reports IS 'Stores detailed validation reports and logs in JSON format';

COMMENT ON COLUMN validation_runs.run_id IS 'Unique identifier for the validation run';
COMMENT ON COLUMN validation_runs.status IS 'Current status: running, completed, failed';
COMMENT ON COLUMN repository_validations.validation_status IS 'Validation result: success, failed, skipped';
COMMENT ON COLUMN repository_validations.validation_type IS 'Type of validation: docker_validation, feature_addition';
COMMENT ON COLUMN validation_reports.report_type IS 'Type of report: build_log, container_log, error_details, feature_changes';

-- Insert initial metadata
INSERT INTO validation_runs (run_id, environment, status, repository_count, repos_file_path) 
VALUES (uuid_generate_v4(), 'system', 'completed', 0, 'schema_initialization')
ON CONFLICT (run_id) DO NOTHING; 