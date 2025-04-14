import fs from "fs/promises";

import { mastra } from "../src/mastra/index.js";
import { getRepoPath } from "../src/mastra/tools/git-tools.js";
import { getCliArg } from "../src/utils/cli-utils.js";

async function main() {
	// Get repository name from CLI arguments or use default
	const repoName = getCliArg("--repo", "TimPietrusky/worker-basic");

	try {
		console.log("\n----------------------------------------------------------------");
		console.log("----------------------------------------------------------------");
		console.log("🚧  preparing test environment");
		console.log("----------------------------------------------------------------");
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

		console.log("\n----------------------------------------------------------------");
		console.log("----------------------------------------------------------------");
		console.log(`👤  prompt: ${prompt}`);
		console.log("----------------------------------------------------------------");
		console.log("----------------------------------------------------------------\n");

		const response = await agent.generate(prompt, {
			maxSteps: 20,
		});

		console.log("\n----------------------------------------------------------------");
		console.log("----------------------------------------------------------------");
		console.log("🤖  janitor");
		console.log(response.text);
		console.log("----------------------------------------------------------------");
		// console.log(JSON.stringify(response.response.messages, null, 2));
		console.log("----------------------------------------------------------------\n");
	} catch (error) {
		console.error("Error running E2E test:", error);
	}
}

main()
	.then(() => {
		console.log("Test finished");
		process.exit(0);
	})
	.catch(error => {
		console.error("Test failed:", error);
		process.exit(1);
	});
