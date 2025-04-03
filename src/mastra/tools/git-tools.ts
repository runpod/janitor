import { createTool } from "@mastra/core/tools";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { z } from "zod";

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
		const localRepoName = fullRepoName.replace("/", "-");
		const reposDir = path.join(process.cwd(), "repos");
		const targetPath = path.join(reposDir, localRepoName);

		// Create repos directory if it doesn't exist
		if (!fs.existsSync(reposDir)) {
			fs.mkdirSync(reposDir, { recursive: true });
			console.log(`Created repos directory at ${reposDir}`);
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
export const gitCheckoutTool = createTool({
	id: "Git Checkout",
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
		console.log(`target path ${path.join(process.cwd(), "repos", fullRepoName.replace("/", "-"))}`);
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
