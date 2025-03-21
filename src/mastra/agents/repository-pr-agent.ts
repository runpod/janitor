import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { MCPConfiguration } from "@mastra/mcp";
import dotenv from "dotenv";
import { z } from "zod";

// Load environment variables
dotenv.config({ path: ".env.development" });

// Define the PR result schema for structured output
export const prResultSchema = z.object({
	success: z.boolean().describe("Whether the PR was successfully created or updated"),
	prExists: z.boolean().describe("Whether a PR for these changes already existed"),
	prNumber: z.number().optional().describe("The PR number if available"),
	prUrl: z.string().optional().describe("The URL to the pull request"),
	branch: z.string().describe("The branch used for the PR"),
	summary: z.string().describe("Summary of what was done"),
});

// Create MCP Configuration for GitHub server
export const githubMCP = new MCPConfiguration({
	id: "github-server-agent",
	servers: {
		github: {
			command: "cmd",
			args: ["/c", "npx -y @modelcontextprotocol/server-github@latest"],
			env: {
				GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN || "",
				// Add debug environment variable to see more information
				DEBUG: "modelcontextprotocol:*",
				// Add this to ensure all tools are properly loaded
				MODEL_CONTEXT_PROTOCOL_DEBUG: "true",
			},
		},
	},
});

// Instructions for the repository PR agent
const PR_AGENT_INSTRUCTIONS = `
You are an expert at creating Pull Requests for fixed Docker repositories.

Your job is to create or update pull requests for repositories that have been fixed by the Repository Repair Agent.
You will take the repair results and create a new branch, commit the changes, push the branch, and create or update a pull request.

When you receive repository repair results, follow these steps:

1. Parse the repository information to determine owner and repo name
2. Create a new branch for the fixed repository with a standardized naming convention (e.g., fix/repository-name-YYYYMMDD)
3. Commit and push the changes to the new branch
4. Check if there's an existing PR for this branch
5. If a PR exists, update it with the new changes
6. If no PR exists, create a new PR from this branch to the main branch
7. Provide a detailed description of the fixes in the PR

Your PR descriptions should include:
- A clear summary of the fixes that were applied
- Validation results before and after the fix
- Reference to the error reports and repair operations
- Any remaining issues that couldn't be fixed automatically

Ensure your PR titles are descriptive and follow the format: "Fix: [type of issue] in [repository-name]"

At the end, you must provide structured output with:
- Whether the PR was successfully created or updated
- Whether a PR already existed
- The PR number and URL if available
- The branch name you used
- A summary of what was done
`;

/**
 * Parse repository string to extract owner and repo name
 */
export const parseRepository = (repository: string): { owner: string; repo: string } => {
	const parts = repository.split("/");
	if (parts.length < 2) {
		throw new Error(`Invalid repository format: ${repository}`);
	}
	return {
		owner: parts[0],
		repo: parts[1],
	};
};

/**
 * Create the repository PR agent
 */
export const createRepositoryPRAgent = async () => {
	try {
		// Get all GitHub MCP tools
		const githubTools = await githubMCP.getTools();

		return new Agent({
			name: "Repository PR Agent",
			instructions: PR_AGENT_INSTRUCTIONS,
			model: openai("gpt-4o"),
			tools: githubTools,
		});
	} catch (error) {
		console.error("Failed to create Repository PR Agent:", error);
	}
};

export const repositoryPRAgent = await createRepositoryPRAgent();
