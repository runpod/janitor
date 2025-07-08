-- Set actual passwords for database users
-- Migration: 002_set_user_passwords.sql
-- Description: Updates user passwords with actual secrets from AWS Secrets Manager
-- This script is executed after 001_initial_schema.sql and expects password variables

-- Update janitor_agent user password
-- The password will be substituted during execution from AWS Secrets Manager
ALTER USER janitor_agent WITH PASSWORD :agent_password;

-- Update janitor_query user password
-- The password will be substituted during execution from AWS Secrets Manager
ALTER USER janitor_query WITH PASSWORD :query_password;

-- Ensure users can connect to the database
GRANT CONNECT ON DATABASE janitor TO janitor_agent;
GRANT CONNECT ON DATABASE janitor TO janitor_query;

-- Log the password update (without revealing actual passwords)
INSERT INTO validation_runs (run_id, environment, status, repository_count, repos_file_path) 
VALUES (uuid_generate_v4(), 'system', 'completed', 0, 'user_passwords_updated')
ON CONFLICT (run_id) DO NOTHING; 