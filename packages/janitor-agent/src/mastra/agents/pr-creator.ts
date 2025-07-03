import { Agent } from "@mastra/core/agent";
import { MCPConfiguration } from "@mastra/mcp";
import dotenv from "dotenv";
import { z } from "zod";

import { read_file } from "../tools/file-system-tools";
import { getModel } from "../utils/models";

// Load environment variables
dotenv.config({ path: ".env" });

// Define the PR result schema for structured output
export const prResultSchema = z.object({
	success: z.boolean().describe("Whether the PR was successfully created or updated"),
	prExists: z.boolean().describe("Whether a PR for these changes already existed"),
	prNumber: z.number().optional().describe("The PR number if available"),
	prUrl: z.string().optional().describe("The URL to the pull request"),
	branch: z.string().describe("The branch used for the PR"),
	summary: z.string().describe("Summary of what was done"),
});

export const githubMCP = new MCPConfiguration({
	id: "github-server-agent",
	servers: {
		github: {
			command: process.platform === "win32" ? "cmd" : "npx",
			args:
				process.platform === "win32"
					? ["/c", "npx -y @modelcontextprotocol/server-github"]
					: ["-y", "@modelcontextprotocol/server-github"],
			env: {
				GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN || "",
			},
		},
	},
});

// Instructions for the PR creation agent
const PR_AGENT_INSTRUCTIONS = `
You are an expert at creating Pull Requests for repositories that have been repaired.
- extract the info about the repo from the message of the user
- open the files that are changed in the pr using the fileReadTool
- if you receive changes files, then you alaways have to create a pull request
- Always make sure to follow commitizen formatting with conventional commits for the commit and the title of the PR

You follow these steps and use the appropriate tools:

1. Check if the repository already has a PR with the proposed changes 
2. If a PR exists, update it with the new changes
3. If no PR exists, create a new branch for the changes
4. Commit all the changed files to the new branch
5. Push the branch to GitHub
6. Create a new PR from the branch to the main branch

# pr template

- title: "fix: [short description of the changes]"
- body:
"""
### Motivation

- short description of the motivation for the changes as a list of bullet points, only relevant changes, nothing else
- any remaining issues that couldn't be fixed automatically

### Issues closed

- list of issues that were closed by the changes (if any)
"""`;

/**
 * Parse a repository string to extract owner and repository name
 */
export const parseRepository = (repository: string): { owner: string; repo: string } => {
	// Check if the repository string contains a slash (indicating owner/repo format)
	const parts = repository.split("/");
	if (parts.length === 2) {
		return { owner: parts[0], repo: parts[1] };
	}

	// Default to runpod-workers organization if only repo name is provided
	return { owner: "runpod-workers", repo: repository };
};

export const create_prCreator = async () => {
	// Get all GitHub MCP tools
	const githubTools = await githubMCP.getTools();

	return new Agent({
		name: "pr creator",
		instructions: PR_AGENT_INSTRUCTIONS,
		model: getModel("code-medium"),
		tools: { ...githubTools, read_file },
	});
};

export const prCreator = await create_prCreator();
