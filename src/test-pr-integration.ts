import fs from "fs/promises";
import path from "path";

import { mastra } from "./mastra/index";

async function testPRIntegration() {
	console.log("Starting PR integration test");

	try {
		// First, introduce an error in the Dockerfile to test the repair and PR flow
		const repoPath = path.join(process.cwd(), "repos", "TimPietrusky-worker-basic");
		const dockerfilePath = path.join(repoPath, "Dockerfile");

		console.log("Introducing an error in the Dockerfile to test repair...");
		const dockerfileContent = await fs.readFile(dockerfilePath, "utf-8");

		// Change "COPY README.md /README.md" back to "COPY README /"
		const modifiedContent = dockerfileContent.replace(
			"COPY README.md /README.md",
			"COPY README /"
		);

		await fs.writeFile(dockerfilePath, modifiedContent, "utf-8");
		console.log("Dockerfile modified to introduce an error");

		// Get the repository validator agent
		const agent = mastra.getAgent("repositoryValidatorAgent");

		if (!agent) {
			console.error("Repository validator agent not found in mastra instance");
			return;
		}

		// Request to validate, repair, and create a PR for the repository
		console.log("Starting validation, repair, and PR creation flow...");
		const response = await agent.generate(
			"Can you validate, fix, and create a PR for the TimPietrusky/worker-basic repository?"
		);

		console.log("\n============= AGENT RESPONSE =============");
		console.log(response.text);
		console.log("=========================================\n");

		// Log tool calls
		console.log("Tool calls made during execution:");
		if (response.toolCalls && response.toolCalls.length > 0) {
			response.toolCalls.forEach((toolCall, index) => {
				console.log(`${index + 1}. ${toolCall.toolName}`);
			});
		} else {
			console.log("No tool calls were made");
		}

		console.log("\nPR integration test completed");
	} catch (error) {
		console.error("Error during PR integration test:", error);
	}
}

// Run the test
testPRIntegration()
	.then(() => {
		console.log("Test finished");
		process.exit(0);
	})
	.catch(error => {
		console.error("Test failed:", error);
		process.exit(1);
	});
