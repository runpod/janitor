import fs from "fs/promises";

import { mastra } from "../src/mastra/index";
import { getRepoPath } from "../src/mastra/tools/git-tools";
import { getCliArg } from "../src/utils/cli-utils";

async function main() {
	// Get repository name from CLI arguments or use default
	const repoName = getCliArg("--repo", "TimPietrusky/worker-basic");

	try {
		console.log("\n----------------------------------------------------------------");
		console.log("🧪  Testing Janitor Agent");
		console.log("----------------------------------------------------------------");
		console.log(`Repository: ${repoName}`);
		console.log("----------------------------------------------------------------\n");

		// Define the repository path using the helper function
		const repoPath = getRepoPath(repoName);

		// Delete the repo directory if it exists to ensure a clean start
		console.log(`Checking if repo directory exists: ${repoPath}`);
		try {
			const stats = await fs.stat(repoPath);
			if (stats.isDirectory()) {
				console.log(`Deleting existing repo directory: ${repoPath}`);
				await fs.rm(repoPath, { recursive: true, force: true });
				console.log("Repository directory deleted successfully");
			}
		} catch (err) {
			// Directory doesn't exist, which is fine
			console.log("Repository directory doesn't exist yet, will be created fresh");
		}

		// Get the repo validator agent
		const agent = mastra.getAgent("janitor");

		const prompt = `Please validate the repository ${repoName}`;

		console.log(`\nPrompt: ${prompt}`);
		console.log("Calling agent...\n");

		// Test with normal agent execution (allows tool calls)
		const response = await agent.generate(prompt, {
			maxSteps: 20,
		});

		console.log("Agent response:");
		console.log("---------------");
		console.log(response.text);
	} catch (error) {
		console.error("Error running test:", error);
	}
}

main()
	.then(() => {
		console.log("\nTest finished");
		process.exit(0);
	})
	.catch(error => {
		console.error("Test failed:", error);
		process.exit(1);
	});
