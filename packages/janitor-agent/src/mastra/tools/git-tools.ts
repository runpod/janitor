import { createTool } from "@mastra/core/tools";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { z } from "zod";

/**
 * Generates the local path for a given repository name.
 * @param repoName The full repository name (e.g., 'organization/repo-name').
 * @returns The local path where the repository should be cloned.
 */
export function getRepoPath(repoName: string): string {
	const localRepoName = repoName.replace("/", "-");
	const reposDir = path.join(process.cwd(), "repos");
	return path.join(reposDir, localRepoName);
}

/**
 * Execute a shell command with proper error handling
 */
function safeExecSync(command: string, cwd?: string) {
	try {
		const options: any = {
			encoding: "utf8",
			stdio: "pipe",
			shell: true,
			windowsHide: true,
			maxBuffer: 10 * 1024 * 1024, // 10MB buffer
			timeout: 5000, // 5 second timeout
		};

		if (cwd) {
			options.cwd = cwd;
		}

		return {
			success: true,
			output: execSync(command, options).toString(),
		};
	} catch (error: any) {
		const stderr = error.stderr ? error.stderr.toString() : "";
		const stdout = error.stdout ? error.stdout.toString() : "";

		return {
			success: false,
			error,
			errorMessage: error.message,
			stderr,
			stdout,
			status: error.status,
		};
	}
}

/**
 * Check git status to see if there are any changes in the repository
 */
export const checkGitStatus = async (
	repositoryPath: string
): Promise<{
	success: boolean;
	hasChanges: boolean;
	changedFiles: string[];
	error?: string;
	statusOutput?: string;
}> => {
	try {
		console.log(`Checking git status for repository at: ${repositoryPath}`);

		// Check if it's a git repository
		if (!fs.existsSync(path.join(repositoryPath, ".git"))) {
			return {
				success: false,
				hasChanges: false,
				changedFiles: [],
				error: "Not a git repository",
			};
		}

		// Get git status
		const statusResult = safeExecSync("git status --porcelain", repositoryPath);

		if (!statusResult.success) {
			return {
				success: false,
				hasChanges: false,
				changedFiles: [],
				error: statusResult.errorMessage,
			};
		}

		const statusOutput = (statusResult.output || "").trim();
		const hasChanges = statusOutput.length > 0;

		// Parse changed files from status output
		const changedFiles = statusOutput
			.split("\n")
			.filter(line => line.trim().length > 0)
			.map(line => {
				// Git status --porcelain format: "XY filename"
				// Where X is staged status, Y is unstaged status
				return line.substring(3).trim(); // Remove status chars and trim
			});

		console.log(`Git status check: ${hasChanges ? "Changes detected" : "No changes"}`);
		if (hasChanges) {
			console.log(`Changed files (${changedFiles.length}):`);
			changedFiles.forEach(file => console.log(`  - ${file}`));
		}

		return {
			success: true,
			hasChanges,
			changedFiles,
			statusOutput,
		};
	} catch (error: any) {
		console.error(`Error checking git status: ${error.message}`);
		return {
			success: false,
			hasChanges: false,
			changedFiles: [],
			error: error.message,
		};
	}
};

/**
 * Clones or updates a GitHub repository
 */
export const checkoutGitRepository = async (
	repoName: string,
	organization?: string
): Promise<{
	success: boolean;
	path?: string;
	error?: string;
	output?: string;
}> => {
	try {
		// Parse repository owner and name
		const [owner, repo] = repoName.split("/");

		if (!owner || !repo) {
			throw new Error(
				`Invalid repository format. Expected format: 'owner/repo', got: '${repoName}'`
			);
		}

		// Use provided organization or default to parsed owner
		const repoOwner = organization || owner;
		const fullRepoName = `${repoOwner}/${repo}`;

		// Set up repository details
		const repoUrl = `https://github.com/${fullRepoName}.git`;
		const targetPath = getRepoPath(fullRepoName);

		// Create repos directory if it doesn't exist
		if (!fs.existsSync(path.dirname(targetPath))) {
			fs.mkdirSync(path.dirname(targetPath), { recursive: true });
			console.log(`Created repos directory at ${path.dirname(targetPath)}`);
		}

		// Check if repository directory exists
		if (fs.existsSync(targetPath)) {
			console.log(`Repository exists at ${targetPath}, pulling latest changes`);

			// Try to pull from default branch
			const pullResult = safeExecSync(`git pull`, targetPath);

			if (pullResult.success) {
				console.log(`Successfully pulled latest changes:\n${pullResult.output}`);

				// List files to verify content
				const lsResult = safeExecSync(`ls -la`, targetPath);
				if (lsResult.success) {
					console.log(`Current repository files:\n${lsResult.output}`);
				}

				return {
					success: true,
					path: targetPath,
					output: pullResult.output,
				};
			} else {
				console.error(`Error pulling repository: ${pullResult.errorMessage}`);

				if (pullResult.stderr) {
					console.error(`Error output: ${pullResult.stderr}`);
				}

				throw new Error(`Failed to pull latest changes: ${pullResult.errorMessage}`);
			}
		} else {
			// Clone the repository
			console.log(`Repository doesn't exist at ${targetPath}, cloning from ${repoUrl}`);

			const cloneResult = safeExecSync(`git clone ${repoUrl} ${targetPath}`);

			if (cloneResult.success) {
				console.log(`Successfully cloned repository`);

				// List files to verify content
				const lsResult = safeExecSync(`ls -la`, targetPath);
				if (lsResult.success) {
					console.log(`Cloned repository files:\n${lsResult.output}`);
				}

				return {
					success: true,
					path: targetPath,
					output: cloneResult.output,
				};
			} else {
				console.error(`Error cloning repository: ${cloneResult.errorMessage}`);

				if (cloneResult.stderr) {
					console.error(`Error output: ${cloneResult.stderr}`);
				}

				// Check for specific error messages indicating repository doesn't exist
				const errorOutput = cloneResult.stderr || cloneResult.errorMessage || "";
				const isRepoNotFound =
					errorOutput.includes("not found") ||
					errorOutput.includes("repository not found") ||
					errorOutput.includes("fatal: remote error:") ||
					errorOutput.includes("ERROR:") ||
					errorOutput.includes("Could not find") ||
					errorOutput.includes("failed") ||
					errorOutput.includes("unable to access") ||
					errorOutput.includes("does not exist") ||
					errorOutput.includes("ETIMEDOUT");

				if (isRepoNotFound) {
					console.error(
						`Repository not found or timed out: The repository "${fullRepoName}" may not exist, is not accessible, or the operation timed out.`
					);

					// Try with alternative organization if this is the first attempt
					if (!organization && owner !== "runpod-workers") {
						console.log(`\nAttempting with runpod-workers organization instead...`);
						return await checkoutGitRepository(repoName, "runpod-workers");
					}
				}

				throw new Error(
					`Failed to clone repository "${fullRepoName}": ${cloneResult.errorMessage}`
				);
			}
		}
	} catch (error: any) {
		console.error(`Error checking out repository: ${error.message}`);

		return {
			success: false,
			error: error.message,
		};
	}
};

// Export as a tool for use with Mastra
export const git_checkout = createTool({
	id: "git_checkout",
	inputSchema: z.object({
		repository: z.string().describe("Full repository name (e.g., 'organization/repo-name')"),
	}),
	description: "Checks out or updates a Git repository",
	execute: async ({ context }) => {
		const fullRepoName = context.repository;

		console.log("\n----------------------------------------------------------------");
		console.log("----------------------------------------------------------------");
		console.log("🛠️  GIT CHECKOUT TOOL");
		console.log(`repository: ${fullRepoName}`);
		console.log(`target path ${getRepoPath(fullRepoName)}`);
		console.log("----------------------------------------------------------------\n");

		const result = await checkoutGitRepository(fullRepoName, undefined);

		if (result.success) {
			console.log(`✅ Repository checkout succeeded at path: ${result.path}`);

			// Additional verification of directory contents
			try {
				const targetPath = result.path;
				if (targetPath && fs.existsSync(targetPath)) {
					const contents = fs.readdirSync(targetPath);
					console.log(`Directory exists with ${contents.length} items`);
				} else {
					console.log(`❌ WARNING: Target path does not exist: ${targetPath}`);
				}
			} catch (error) {
				console.error(
					`Error checking directory contents: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		} else {
			console.log(`❌ Repository checkout failed: ${result.error}`);
		}

		return result;
	},
});

// Export git status check as a tool
export const git_status = createTool({
	id: "git_status",
	inputSchema: z.object({
		repositoryPath: z.string().describe("Path to the local repository"),
	}),
	description: "Checks git status to see if there are any uncommitted changes in the repository",
	execute: async ({ context }) => {
		console.log("\n----------------------------------------------------------------");
		console.log("🛠️  GIT STATUS TOOL");
		console.log(`repository path: ${context.repositoryPath}`);
		console.log("----------------------------------------------------------------\n");

		const result = await checkGitStatus(context.repositoryPath);

		if (result.success) {
			if (result.hasChanges) {
				console.log(`✅ Changes detected in repository`);
				console.log(`📁 Changed files (${result.changedFiles.length}):`);
				result.changedFiles.forEach(file => console.log(`   - ${file}`));
			} else {
				console.log(`ℹ️  No changes detected in repository`);
			}
		} else {
			console.log(`❌ Git status check failed: ${result.error}`);
		}

		return result;
	},
});
