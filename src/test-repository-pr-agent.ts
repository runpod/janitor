import { mastra } from "./mastra";

async function main() {
	try {
		// Create the repository PR agent directly
		const agent = mastra.getAgent("prCreatorAgent");
		if (!agent) {
			console.error("Failed to create Repository PR Agent!");
			return;
		}

		console.log("Running repository PR agent test...");

		// Create a sample PR request with test data
		const testRepository = "TimPietrusky/worker-basic";
		const repositoryPath = "./repos/TimPietrusky-worker-basic";

		// Sample fixes that would have been applied
		const fixes = [
			{
				file: "Dockerfile",
				description: "Fixed COPY command to use correct source file name",
			},
			{
				file: "requirements.txt",
				description: "Updated package versions to be compatible",
			},
		];

		// Sample original errors
		const originalErrors = [
			"COPY failed: file not found in build context or excluded by .dockerignore: file not found",
			"Could not install packages due to version conflicts",
		];

		// Prepare the message for the agent
		const message = `
I need you to create a Pull Request for a fixed repository with the following details:

Repository: ${testRepository}
Repository Path: ${repositoryPath}
Number of fixes: ${fixes.length}

Fixes applied:
${fixes.map(fix => `- ${fix.file}: ${fix.description}`).join("\n")}

Original errors:
${originalErrors.join("\n")}

The repository has been successfully fixed and validation has passed.
Please create a PR with these changes, following your standard process for branch creation, committing, and PR submission.

This is a real PR request - please proceed with actually creating the branch, committing the changes, and submitting the PR.
Return a structured output with the PR details after you've created it.
`;

		// Request the PR creation
		const response = await agent.generate(message);

		console.log(response.text);

		// // With structured output, we get the object directly
		// console.log("\nAgent Response (Structured Output):");
		// console.log(JSON.stringify(response.object, null, 2));

		// console.log("\nPR Creation Summary:");
		// console.log(response.object.summary);

		// if (response.object.success) {
		// 	console.log(`\nSuccessfully created PR #${response.object.prNumber}`);
		// 	console.log(`PR URL: ${response.object.prUrl}`);
		// 	console.log(`Branch: ${response.object.branch}`);
		// } else {
		// 	console.log("\nFailed to create PR. See summary for details.");
		// }
	} catch (error) {
		console.error("Error running PR agent test:", error);
	}
}

main().catch(console.error);
