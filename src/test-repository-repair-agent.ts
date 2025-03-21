import { Agent } from "@mastra/core/agent";
import fs from "fs/promises";
import path from "path";

import { mastra } from "./mastra/index";

async function main() {
	try {
		console.log("Starting repository repair agent test");

		// Define the repository path
		const repoPath = path.join(process.cwd(), "repos", "TimPietrusky-worker-basic");

		// Get the repository repair agent
		const agent: Agent = mastra.getAgent("repositoryRepairAgent");
		if (!agent) {
			console.error("Repository Repair Agent not found!");
			return;
		}

		// Define the dockerfilePath for later use
		const dockerfilePath = path.join(repoPath, "Dockerfile");

		// Generate prompt for the repair agent
		const errorDetails = `
Error: Failed to build Docker image
Error details:
- During docker build, the following error occurred:
- COPY failed: file not found in build context or excluded by .dockerignore: stat README: file does not exist
- The Dockerfile tried to COPY a file called README but it doesn't exist.
- The repository has a file called README.md instead.
`;

		// Run the repair agent
		console.log("Running repair agent to fix the Dockerfile...");
		const repairResponse = await agent.generate(`
Please repair the following repository: TimPietrusky/worker-basic
Repository path: ${repoPath}

The repository has the following error:
${errorDetails}

Please analyze the issue and fix the Dockerfile in the repository.
`);

		console.log("\n============= REPAIR AGENT RESPONSE =============");
		console.log(repairResponse.text);
		console.log("================================================\n");

		// Log tool calls
		console.log("Tool calls made during repair:");
		if (repairResponse.toolCalls && repairResponse.toolCalls.length > 0) {
			repairResponse.toolCalls.forEach((toolCall, index) => {
				console.log(`${index + 1}. ${toolCall.toolName}`);
			});
		} else {
			console.log("No tool calls were made during repair");
		}

		// Check if the repair was successful by reading the Dockerfile again
		console.log("\nVerifying the fix...");
		try {
			const repairedContent = await fs.readFile(dockerfilePath, "utf-8");
			const wasFixed = repairedContent.includes("COPY README.md /");

			console.log(`Repair successful: ${wasFixed ? "✅ Yes" : "❌ No"}`);
			if (wasFixed) {
				console.log(
					"The Dockerfile was correctly fixed to use README.md instead of README"
				);
			} else {
				console.log("The Dockerfile was not properly fixed");
				console.log("Current content:");
				console.log(repairedContent);
			}
		} catch (err) {
			console.error("Failed to verify the fix - Dockerfile not found:", err);
		}
	} catch (error) {
		console.error("Error running repository repair agent test:", error);
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
