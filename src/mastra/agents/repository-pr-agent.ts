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

// Enable debug logging
const DEBUG = true;
function logDebug(message: string, ...args: any[]) {
	if (DEBUG) {
		console.log(`[PR-AGENT] ${message}`, ...args);
	}
}

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
		// Return a simplified agent without MCP tools as fallback
		return new Agent({
			name: "Repository PR Agent (Fallback)",
			instructions: PR_AGENT_INSTRUCTIONS,
			model: openai("gpt-4o"),
		});
	}
};

/**
 * Create a PR for a fixed repository using GitHub MCP server tools
 */
export const createRepositoryPR = async (
	repositoryPath: string,
	repository: string,
	fixes: Array<{ file: string; description: string }>,
	originalErrors: string[],
	revalidationResult?: {
		success: boolean;
		errors?: string[];
	}
) => {
	try {
		// Check for GitHub token
		if (!process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
			console.error("GITHUB_PERSONAL_ACCESS_TOKEN is not set. PR creation will fail.");
			return {
				success: false,
				message: "GITHUB_PERSONAL_ACCESS_TOKEN environment variable is not set.",
			};
		}

		// Parse repository
		const { owner, repo } = parseRepository(repository);

		// Create branch name based on repository and date
		const today = new Date();
		const dateString = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
		const branchName = `fix/${repo}-${dateString}`;

		// Initialize the GitHub MCP tools
		logDebug("Initializing GitHub MCP tools");
		let githubTools;
		try {
			githubTools = await githubMCP.getTools();
		} catch (error) {
			console.error("Error initializing GitHub MCP tools:", error);
			return {
				success: false,
				message: `Failed to initialize GitHub MCP tools: ${error instanceof Error ? error.message : String(error)}`,
			};
		}

		// Extract the needed tools
		const {
			github_create_branch,
			github_push_files,
			github_list_pull_requests,
			github_create_pull_request,
			github_update_pull_request,
		} = githubTools;

		if (
			!github_create_branch ||
			!github_push_files ||
			!github_list_pull_requests ||
			!github_create_pull_request ||
			!github_update_pull_request
		) {
			const missingTools = [
				"github_create_branch",
				"github_push_files",
				"github_list_pull_requests",
				"github_create_pull_request",
				"github_update_pull_request",
			].filter(tool => !githubTools[tool]);

			// Log more detailed information about available tools
			console.error("Missing required GitHub MCP tools:", missingTools.join(", "));
			console.error("Available GitHub MCP tools:", Object.keys(githubTools).join(", "));

			return {
				success: false,
				message: `Missing required GitHub MCP tools: ${missingTools.join(", ")}`,
			};
		}

		// Collect files from the repository path
		logDebug(`Collecting files from repository path: ${repositoryPath}`);
		const fs = await import("fs/promises");
		const path = await import("path");

		const collectFiles = async (
			dir: string,
			baseDir: string = ""
		): Promise<Array<{ path: string; content: string }>> => {
			const files: Array<{ path: string; content: string }> = [];
			const entries = await fs.readdir(dir, { withFileTypes: true });

			for (const entry of entries) {
				const relativePath = path.join(baseDir, entry.name);
				const fullPath = path.join(dir, entry.name);

				if (entry.name === ".git") continue;

				if (entry.isDirectory()) {
					const subDirFiles = await collectFiles(fullPath, relativePath);
					files.push(...subDirFiles);
				} else {
					try {
						const content = await fs.readFile(fullPath, "utf8");
						files.push({
							path: relativePath,
							content,
						});
					} catch (err) {
						console.error(`Error reading file ${fullPath}:`, err);
					}
				}
			}

			return files;
		};

		// Log that we're setting up the PR
		logDebug(`Setting up PR for ${repository} with branch ${branchName}`);

		// 1. Create a new branch
		logDebug("Creating branch...");
		const branchResult = await github_create_branch.execute?.({
			context: {
				owner,
				repo,
				branch: branchName,
				from_branch: "main",
			},
		});

		if (!branchResult?.success) {
			return {
				success: false,
				message: `Failed to create branch: ${branchResult?.message || "Unknown error"}`,
			};
		}

		// 2. Collect files from repository
		logDebug("Collecting files...");
		const files = await collectFiles(repositoryPath);
		logDebug(`Found ${files.length} files to push`);

		// 3. Push files to branch
		logDebug("Pushing files...");
		const pushResult = await github_push_files.execute?.({
			context: {
				owner,
				repo,
				branch: branchName,
				files,
				message: `Fix: Docker build issues in ${repo}`,
			},
		});

		if (!pushResult?.success) {
			return {
				success: false,
				message: `Failed to push files: ${pushResult?.message || "Unknown error"}`,
			};
		}

		// 4. Check if PR already exists
		logDebug("Checking for existing PRs...");
		const listPRsResult = await github_list_pull_requests.execute?.({
			context: {
				owner,
				repo,
				state: "open",
				head: `${owner}:${branchName}`,
			},
		});

		// Generate PR description
		const generatePRDescription = () => {
			let description = `# Automated Fixes for ${repository}\n\n`;

			// Summary
			description += "## Summary\n\n";
			description += `This PR contains automated fixes for issues detected in the ${repository} repository.\n\n`;

			// Fixes applied
			description += "## Fixes Applied\n\n";
			if (fixes.length > 0) {
				fixes.forEach(fix => {
					description += `* **${fix.file}**: ${fix.description}\n`;
				});
			} else {
				description += "No specific fixes were applied.\n";
			}
			description += "\n";

			// Original issues
			description += "## Original Issues\n\n";
			description += "```\n";
			description += originalErrors.join("\n");
			description += "\n```\n\n";

			// Validation results
			description += "## Validation Results After Fixes\n\n";
			if (revalidationResult) {
				if (revalidationResult.success) {
					description +=
						"✅ **All issues have been fixed. The repository passes validation.**\n";
				} else {
					description += "⚠️ **Some issues remain after applying fixes:**\n\n";
					description += "```\n";
					description += revalidationResult.errors?.join("\n") || "Unknown errors";
					description += "\n```\n";
					description += "\nAdditional manual inspection may be required.\n";
				}
			} else {
				description += "⚠️ **Revalidation was not performed**\n";
			}

			// Signature
			description += "\n---\n";
			description +=
				"_This pull request was automatically generated by the Worker Maintainer Bot._";

			return description;
		};

		const prTitle = `Fix: Docker build issues in ${repo}`;
		const prBody = generatePRDescription();

		// 5. Create or update PR
		if (listPRsResult?.success && listPRsResult.pullRequests?.length > 0) {
			// Update existing PR
			logDebug("Updating existing PR...");
			const pullNumber = listPRsResult.pullRequests[0].number;

			const updateResult = await github_update_pull_request.execute?.({
				context: {
					owner,
					repo,
					pull_number: pullNumber,
					title: prTitle,
					body: prBody,
				},
			});

			logDebug("PR update complete:", updateResult?.success);

			return {
				success: updateResult?.success || false,
				message: updateResult?.message || "Unknown error occurred while updating PR",
				prExists: true,
				prNumber: pullNumber,
				pullRequestUrl: updateResult?.html_url,
			};
		} else {
			// Create new PR
			logDebug("Creating new PR...");
			const createResult = await github_create_pull_request.execute?.({
				context: {
					owner,
					repo,
					title: prTitle,
					body: prBody,
					head: branchName,
					base: "main",
				},
			});

			logDebug("PR creation complete:", createResult?.success);

			return {
				success: createResult?.success || false,
				message: createResult?.message || "Unknown error occurred while creating PR",
				prExists: false,
				prNumber: createResult?.number,
				pullRequestUrl: createResult?.html_url,
			};
		}
	} catch (error: unknown) {
		return {
			success: false,
			message: `Error creating repository PR: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
};

// Initialize the agent
const initAgent = async () => {
	if (process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
		return await createRepositoryPRAgent();
	} else {
		console.warn(
			"GITHUB_PERSONAL_ACCESS_TOKEN not set. Repository PR Agent will not be initialized."
		);
		return new Agent({
			name: "Repository PR Agent (Placeholder)",
			instructions: "Placeholder agent - GITHUB_PERSONAL_ACCESS_TOKEN not set",
			model: openai("gpt-4o"),
		});
	}
};

export const repositoryPRAgent = await initAgent();
