// Import crypto polyfill first to ensure crypto is available
import "../src/mastra/utils/crypto-polyfill.js";

import fs from "fs/promises";
import path from "path";

import { mastra } from "../src/mastra/index.js";

async function main() {
	try {
		// Define the repository path
		const repoPath = path.join(process.cwd(), "repos", "TimPietrusky-worker-basic");

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

		const response = await agent.generate(
			"Please validate the repository TimPietrusky/worker-basic"
		);

		console.log("\n----------------------------------------------------------------");
		console.log("----------------------------------------------------------------");
		console.log("🤖  JANITOR AGENT");
		console.log(response.text);
		console.log("----------------------------------------------------------------");
		console.log(JSON.stringify(response.response.messages, null, 2));
		console.log("----------------------------------------------------------------\n");

	} catch (error) {
		console.error("Error running E2E test:", error);
	}
}

main()
	.then(() => {
		console.log("Test finished");
	})
	.catch(error => {
		console.error("Test failed:", error);
	});
