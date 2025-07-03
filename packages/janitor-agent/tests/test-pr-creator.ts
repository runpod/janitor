import { mastra } from "../src/mastra/index";

async function testPRCreatorAgent() {
	try {
		console.log("=== Testing PR Creator Agent (New Simplified Workflow) ===");

		// Create the repository PR agent directly
		const agent = mastra.getAgent("prCreator");
		if (!agent) {
			console.error("Failed to get PR Creator Agent!");
			return;
		}

		console.log("Running repository PR agent test...");

		const testRepository = "TimPietrusky/worker-basic";
		const repositoryPath = "./repos/TimPietrusky-worker-basic";

		console.log("\n--- OLD WAY (Manual file tracking) ---");
		console.log("❌ Required manually tracking files:");
		console.log("   - Dockerfile: Fixed COPY command");
		console.log("   - requirements.txt: Updated versions");
		console.log("   - Risk of missing files or wrong descriptions");

		console.log("\n--- NEW WAY (Automatic git status detection) ---");
		console.log("✅ Just provide context, let git handle file detection!");

		// NEW SIMPLE MESSAGE: No need to manually list files
		const message = `
I need you to create a Pull Request for a repository that has been fixed:

Repository: ${testRepository}
Repository Path: ${repositoryPath}
Context: Fixed Docker validation errors and updated dependencies

The repository has been successfully fixed and validation has passed.
Please create a PR with the changes found in the repository, following your standard process for branch creation, committing, and PR submission.

Use your git tools to detect what files have changed and create the PR accordingly.
`;

		const response = await agent.generate(message, {
			maxSteps: 15,
		});

		console.log("Agent Response:", response.text);

		console.log("\n✅ Benefits of new approach:");
		console.log("   - No manual file tracking required");
		console.log("   - Automatic detection of all changed files");
		console.log("   - No risk of missing files");
		console.log("   - Simpler API for agents to use");
		console.log("   - Optional detailed context if needed");
	} catch (error) {
		console.error("Error running PR agent test:", error);
	}
}

async function main() {
	await testPRCreatorAgent();
}

main().catch(console.error);
