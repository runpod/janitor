import { Agent } from "@mastra/core/agent";
import { z } from "zod";

import { getModel } from "../utils/models.js";

// Schema for individual repository result
export const repositoryAnalysisSchema = z.object({
	repository: z.string().describe("Name of the repository (e.g., owner/repo-name)"),
	action: z
		.enum(["validate", "validate_and_repair", "add_feature", "error"])
		.describe("The primary action that was performed"),
	status: z
		.enum(["passed", "fixed", "feature_added", "failed", "unfixable", "error"])
		.describe("Final status of the operation"),
	details: z
		.string()
		.describe("Brief description of what happened, failures, fixes applied, or features added"),
	pr_status: z
		.enum(["created", "updated", "failed", "no_changes", "not_applicable"])
		.optional()
		.describe("Status of any pull request"),
	pr_url: z.string().optional().describe("URL to the created/updated pull request if applicable"),
	validation_passed: z
		.boolean()
		.describe("Whether the final validation was successful (true/false)"),
	error_message: z.string().optional().describe("Error message if the operation failed"),
});

// Schema for overall analysis result
export const analysisResultSchema = z.object({
	success: z.boolean().describe("Whether the overall processing was successful"),
	total_repositories: z.number().describe("Total number of repositories processed"),
	successful_repositories: z
		.number()
		.describe("Number of repositories that passed or were fixed"),
	failed_repositories: z.number().describe("Number of repositories that failed"),
	repositories: z
		.array(repositoryAnalysisSchema)
		.describe("Detailed results for each repository"),
	summary: z.string().describe("Overall summary of the processing session"),
});

export const analyzerAgent = new Agent({
	name: "analyzer",
	instructions: `You are a result analyzer agent. Your job is to analyze the results of repository operations and provide structured output.

You will be given:
1. The original agent response text
2. Information about repositories that were processed
3. Tool call results from the main agent

Your task is to analyze this information and determine:
- What action was performed (validate, repair, add_feature)
- Whether validation ultimately passed or failed
- Details about what happened
- PR information if applicable
- Any error messages

CRITICAL: Look specifically for tool call results to determine validation_passed:
- Find "docker_validation" tool calls in the tool results
- Look for a "passed" field in the tool call result (true/false)
- If docker_validation shows "passed": true, then validation_passed should be true
- If docker_validation shows "passed": false, then validation_passed should be false
- If no docker_validation tool was called, check the text for validation indicators

Action determination rules:
- If only docker_validation was called: action = "validate"
- If repair tool was called: action = "validate_and_repair" 
- If add_feature tool was called: action = "add_feature"
- If errors occurred: action = "error"

Status determination rules:
- If validation_passed = true and no repairs: status = "passed"
- If validation_passed = true and repairs were made: status = "fixed"
- If validation_passed = true and features added: status = "feature_added"
- If validation_passed = false: status = "failed"
- If multiple repair attempts failed: status = "unfixable"
- If system errors: status = "error"

Key rules:
- validation_passed should be TRUE only if the final validation was successful
- validation_passed should be FALSE if validation failed, even after attempted repairs
- ALWAYS include validation_passed and action fields - they are required
- Be precise about success vs failure - don't guess
- If unclear, default to failed with error explanation

Focus on the actual tool results rather than just text descriptions.`,
	model: getModel(),
});
