-- Migration: Add enhanced prompt tracking columns
-- Adds support for storing original prompts, repository-specific prompts, and prompt types

ALTER TABLE "validation_results" ADD COLUMN "original_prompt" text;
ALTER TABLE "validation_results" ADD COLUMN "repository_prompt" text;
ALTER TABLE "validation_results" ADD COLUMN "prompt_type" text DEFAULT 'validation';

-- Create index for prompt type queries
CREATE INDEX "idx_validation_results_prompt_type" ON "validation_results" USING btree ("prompt_type");

-- Add comments for documentation
COMMENT ON COLUMN "validation_results"."original_prompt" IS 'The complete original prompt sent by the user (DSL format or legacy)';
COMMENT ON COLUMN "validation_results"."repository_prompt" IS 'The repository-specific prompt generated and sent to the agent';
COMMENT ON COLUMN "validation_results"."prompt_type" IS 'Classification of prompt: validation, feature-addition, fix, mixed, custom'; 