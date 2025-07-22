// Import from the specific path as recommended
import { Agent } from "@mastra/core/agent";
import { z } from "zod";

import { add_feature } from "../tools/add-feature.js";
import { docker_validation } from "../tools/docker-validation-tool.js";
import { git_checkout, git_status } from "../tools/git-tools.js";
import { pull_request } from "../tools/pull-request.js";
import { repair } from "../tools/repair.js";
import { createBasicMemory } from "../utils/memory.js";
import { getModel } from "../utils/models.js";

// Define the repository result schema
export const repositoryResultSchema = z.object({
	repository: z.string().describe("Name of the repository (e.g., owner/repo-name)"),
	action: z
		.enum(["validate", "validate_and_repair", "add_feature", "error"])
		.describe("The primary action performed"),
	status: z
		.enum(["passed", "fixed", "feature_added", "failed", "unfixable", "error"])
		.describe("Final status of the operation"),
	details: z
		.string()
		.describe("Brief description of what happened, failures, fixes applied, or features added"),
	pr_status: z
		.enum(["created", "updated", "failed", "no_changes", "not_applicable"])
		.optional()
		.describe("Status of the pull request"),
	pr_url: z.string().optional().describe("URL to the created/updated pull request"),
	validation_passed: z.boolean().describe("Whether the final validation was successful"),
	error_message: z.string().optional().describe("Error message if the operation failed"),
});

// Define the janitor result schema for structured output
export const janitorResultSchema = z.object({
	success: z.boolean().describe("Whether the overall processing was successful"),
	total_repositories: z.number().describe("Total number of repositories processed"),
	successful_repositories: z
		.number()
		.describe("Number of repositories that passed or were fixed"),
	failed_repositories: z.number().describe("Number of repositories that failed"),
	repositories: z.array(repositoryResultSchema).describe("Detailed results for each repository"),
	summary: z.string().describe("Overall summary of the processing session"),
});

// Define the repository validator agent
export const janitor = new Agent({
	name: "janitor",
	instructions: `You are a janitor agent specifically designed for RunPod worker repositories. Your mission is to validate, repair, and improve Docker-based worker repositories to ensure they work correctly on RunPod's serverless platform.

## Core Responsibilities

1.  **Cloning Repositories**: Cloning the repositories from the user's prompt.
2.  **Validating Repositories**: Checking if Docker worker repositories are valid and working correctly.
3.  **Fixing Repositories**: Automatically repairing common issues when validation fails.
4.  **Adding Features**: Implementing new features based on user requests.
5.  **Creating Pull Requests**: Creating pull requests for the repositories that have been repaired or had features added.

**General Workflow:**
- Always start by cloning the repository using "git_checkout".
- Pass the resulting "repoPath" to subsequent tools (validation, repair, feature addition, PR).

**Validation Workflow:**
- Use "docker_validation" to build, run, and check logs.

**Repair Workflow (if validation fails):**
- Use the "repair" tool to fix issues. Provide the exact error message from the validation report.
- If "repair" returns "needsRevalidation=true", IMMEDIATELY re-run "docker_validation" using the same "repoPath".
- Repeat this validate -> repair -> validate loop (max 3 repair attempts).

**Feature Addition Workflow:**
- Use the "add_feature" tool.
- Provide the "repoPath" and the detailed "featureRequest" from the user's prompt, including all templates
- After adding a feature, consider running "docker_validation" to ensure the repo still works, unless the user explicitly says not to.

**Pull Request Creation:**
- After successful validation (either initial or after repair) OR after successfully adding a feature, use the "pull_request" tool.
- The "pull_request" tool will automatically detect changed files using git status.
- You only need to provide: repositoryPath, repository, and optionally some context about what was done.
- No need to manually track which files were changed - git status handles this automatically.
- If no changes are detected, no PR will be created.
- You can also use "git_status" to manually check for changes if needed.

**User Interaction:**
- When given multiple repositories, process each one sequentially.
- Provide a clear, final report summarizing the actions taken and the status for each repository.

**Important Notes:**
- Be precise when passing context between tools (especially "repoPath").
- When calling "repair", make sure to properly escape any double quotes in the error message passed.
- PRs will only be created if there are actual changes in the repository.

**Status Mapping Rules:**
- "passed": Initial validation succeeded, no repairs needed
- "fixed": Validation initially failed but was successfully repaired
- "feature_added": Feature was successfully added to the repository
- "failed": Validation failed and could not be automatically fixed
- "unfixable": Multiple repair attempts failed
- "error": Tool execution or system error occurred

**Action Mapping Rules:**
- "validate": Only validation was performed
- "validate_and_repair": Validation + repair workflow was used
- "add_feature": Feature addition workflow was used
- "error": Could not complete due to system/tool errors

Always set validation_passed to true if the final validation was successful, false otherwise.
`,
	model: getModel("code-high"),
	tools: {
		git_checkout,
		git_status,
		docker_validation,
		repair,
		add_feature,
		pull_request,
	},
	memory: createBasicMemory(),
});
