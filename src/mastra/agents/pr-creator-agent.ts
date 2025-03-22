// Import crypto polyfill first to ensure crypto is available
import "../utils/crypto-polyfill.js";

import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { MCPConfiguration } from "@mastra/mcp";
import dotenv from "dotenv";
import { z } from "zod";

import { fileReadTool } from "../tools";

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
		// git: {
		// 	command: "cmd",
		// 	args: ["/c", "npx -y @modelcontextprotocol/server-github@latest"],
		// 	env: {
		// 		GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN || "",
		// 	},
		// },

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
2. Extract the files from the repair results and use the fileReadTool to read the contents of the files (don't make up the changes for the files, only use the contents from the repair results)
3. Create a new branch for the fixed repository with a standardized naming convention (e.g., fix/repository-name-YYYYMMDD)
4. Commit and push the changes to the new branch
5. Check if there's an existing PR for this branch
5. If a PR exists, update it with the new changes
6. If no PR exists, create a new PR from this branch to the main branch
7. follow the "pr template" for the PR and the "output format" for the output

always make sure to follow commitizen formatting with conventional commits for the commit and the title of the PR

# pr template

- title: "fix: [short description of the changes]"
- body:
"""
### Motivation

- short description of the motivation for the changes as a list of bullet points, only relevant changes, nothing else
- any remaining issues that couldn't be fixed automatically

### Issues closed

- list of issues that were closed by the changes (if any)
"""

# output format

{
  "success": true,
  "prExists": false,
  "prNumber": 123,
  "prUrl": "https://github.com/owner/repo/pull/123",
  "branch": "fix/repository-name-YYYYMMDD",
  "summary": "..."
}
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
export const create_prCreatorAgent = async () => {
	try {
		// Get all GitHub MCP tools
		const githubTools = await githubMCP.getTools();

		return new Agent({
			name: "pr creator",
			instructions: PR_AGENT_INSTRUCTIONS,
			model: openai("gpt-4o"),
			tools: { ...githubTools, fileReadTool },
		});
	} catch (error) {
		console.error("Failed to create Repository PR Agent:", error);
	}
};

export const prCreatorAgent = await create_prCreatorAgent();
