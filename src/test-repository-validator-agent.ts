import fs from "fs/promises";
import path from "path";

import { mastra } from "./mastra/index";

async function main() {
	try {
		console.log("Starting E2E repository validator agent test");

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
		const agent = mastra.getAgent("repositoryValidatorAgent");
		if (!agent) {
			console.error("Repository Validator Agent not found!");
			return;
		}

		console.log("Running repository validation with agent...");

		const validationResponse = await agent.generate(
			"Please validate the repository TimPietrusky/worker-basic"
		);

		console.log("\nAgent Validation Response:");
		console.log(validationResponse.text);

		// Print tool results if available
		if (validationResponse.toolResults && validationResponse.toolResults.length > 0) {
			console.log("\nTool Results:");
			for (const toolResult of validationResponse.toolResults) {
				console.log(`Tool: ${toolResult.toolName}`);
				console.log(`Result: ${JSON.stringify(toolResult.result, null, 2)}`);
			}
		}

		// // PART 2: Introduce an error and test the repair + PR flow
		// console.log("\n===== Step 2: Test Repair and PR Creation =====");

		// // Request to validate, repair, and create a PR for the repository
		// const repairResponse = await agent.generate(
		// 	"Can you validate the TimPietrusky/worker-basic repository?"
		// );

		// console.log("\n============= AGENT REPAIR RESPONSE =============");
		// console.log(repairResponse.text);
		// console.log("=================================================\n");

		// // Log tool calls
		// console.log("Tool calls made during repair and PR creation:");
		// if (repairResponse.toolCalls && repairResponse.toolCalls.length > 0) {
		// 	repairResponse.toolCalls.forEach((toolCall, index) => {
		// 		console.log(`${index + 1}. ${toolCall.toolName}`);
		// 	});
		// } else {
		// 	console.log("No tool calls were made during repair");
		// }

		console.log("\nE2E test completed successfully");
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
