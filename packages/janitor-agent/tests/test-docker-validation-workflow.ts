import { mastra } from "../src/mastra/index";

async function testDockerValidationWorkflow() {
	try {
		console.log("Testing Docker Validation Workflow directly...");

		// Get the Docker Validation Workflow
		const workflow = mastra.getWorkflow("dockerValidationWorkflow");
		if (!workflow) {
			console.error("Docker Validation Workflow not found!");
			return;
		}

		console.log("Workflow found, executing...");

		// Create a run instance with createRunAsync() and use start() method
		const run = await workflow.createRunAsync();
		console.log(`Created workflow run with ID: ${run.runId}`);

		// Execute the workflow with our test parameters
		const result = await run.start({
			inputData: {
				repositoryPath: "repos/TimPietrusky-worker-basic",
				imageName: "timpietrusky-basic-test",
				platform: "linux/amd64",
				ports: ["8080:80"],
				envVars: { TEST_MODE: "true" },
				command: "echo 'Hello from Docker container!'",
			},
		});

		console.log("\n--- WORKFLOW EXECUTION RESULTS ---");

		// Handle different workflow statuses
		if (result.status === "success") {
			console.log("✅ Workflow completed successfully!");
			console.log("Final result:", result.result);

			if (result.result?.report) {
				console.log("\n--- FINAL REPORT ---");
				console.log(result.result.report);
			}
		} else if (result.status === "failed") {
			console.error("❌ Workflow failed!");
			console.error("Error:", result.error);
		} else if (result.status === "suspended") {
			console.log("⏸️ Workflow was suspended");
			console.log("Suspended steps:", result.suspended);
		}

		// Log step details for debugging
		if (result.steps) {
			console.log("\nStep Results:");
			Object.entries(result.steps).forEach(([stepId, stepResult]) => {
				console.log(`\n[${stepId}]:`);
				console.log(JSON.stringify(stepResult, null, 2));
			});
		}

		console.log("\n--- END WORKFLOW RESULTS ---");

		return result;
	} catch (error) {
		console.error("Error executing workflow:", error);
	}
}

// Run the test
testDockerValidationWorkflow()
	.then(() => console.log("\nWorkflow test completed"))
	.catch(error => console.error("Workflow test failed:", error));
