import { analysisResultSchema } from "../src/mastra/agents/analyzer";
import { mastra } from "../src/mastra/index";
import { getCliArg } from "../src/utils/cli-utils";

async function main() {
	// Get repository name from CLI arguments or use default
	const repoName = getCliArg("--repo", "TimPietrusky/worker-basic");

	try {
		console.log("\n----------------------------------------------------------------");
		console.log("🧪  Testing Two-Step Approach: Janitor + Analyzer Agents");
		console.log("----------------------------------------------------------------");
		console.log(`Repository: ${repoName}`);
		console.log("----------------------------------------------------------------\n");

		// Step 1: Run the main janitor agent
		console.log("🔧 Step 1: Running Janitor Agent...");
		const janitorAgent = mastra.getAgent("janitor");
		const janitorPrompt = `Please validate the repository ${repoName}`;

		const janitorResponse = await janitorAgent.generate(janitorPrompt, {
			maxSteps: 20,
		});

		console.log("✅ Janitor agent completed");
		console.log("Janitor Response:");
		console.log(janitorResponse.text);
		console.log("\nTool Calls:");
		console.log(JSON.stringify(janitorResponse.toolCalls || [], null, 2));

		// Step 2: Use analyzer agent to get structured results
		console.log("\n🔍 Step 2: Running Analyzer Agent...");
		const analyzerAgent = mastra.getAgent("analyzer");

		const analysisPrompt = `Analyze the following repository operation results:

Original Prompt: Please validate the repository ${repoName}
Repositories: ${repoName}

Agent Response:
${janitorResponse.text}

Tool Calls and Results:
${JSON.stringify(janitorResponse.toolCalls || [], null, 2)}

Please provide a structured analysis of what happened, focusing on:
1. Whether validation ultimately passed or failed for each repository
2. What actions were performed
3. Any PR information
4. Error details if applicable

Be precise about validation_passed - only set to true if final validation actually succeeded.`;

		const analysisResponse = await analyzerAgent.generate(analysisPrompt, {
			experimental_output: analysisResultSchema,
		});

		console.log("✅ Analyzer agent completed");

		// Extract the structured analysis
		const analysisResult = (analysisResponse as any).object || analysisResponse;

		console.log("\nStructured Analysis Result:");
		console.log("---------------------------");
		console.log(JSON.stringify(analysisResult, null, 2));

		// Validate the result
		if (
			analysisResult &&
			analysisResult.repositories &&
			Array.isArray(analysisResult.repositories)
		) {
			console.log("\n📊 Summary:");
			console.log(`- Total repositories: ${analysisResult.total_repositories}`);
			console.log(`- Successful: ${analysisResult.successful_repositories}`);
			console.log(`- Failed: ${analysisResult.failed_repositories}`);
			console.log(`- Overall success: ${analysisResult.success}`);

			analysisResult.repositories.forEach((repo: any, index: number) => {
				console.log(`\n${index + 1}. Repository: ${repo.repository}`);
				console.log(`   - Action: ${repo.action}`);
				console.log(`   - Status: ${repo.status}`);
				console.log(`   - Validation Passed: ${repo.validation_passed}`);
				console.log(`   - Details: ${repo.details}`);
				if (repo.pr_status) {
					console.log(`   - PR Status: ${repo.pr_status}`);
				}
				if (repo.error_message) {
					console.log(`   - Error: ${repo.error_message}`);
				}
			});
		} else {
			console.error("❌ Invalid analysis result structure!");
		}
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
