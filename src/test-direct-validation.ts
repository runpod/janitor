import { dockerValidationWorkflow } from "./mastra/workflows/docker-validation-workflow";

async function main() {
  console.log("Testing Docker validation workflow directly...");

  // Create a run and execute the workflow
  const { runId, start } = dockerValidationWorkflow.createRun();

  // Start the workflow with test parameters
  console.log(`Starting workflow run with ID: ${runId}`);

  const result = await start({
    triggerData: {
      repository: "runpod-workers/worker-basic",
      imageName: "test-image-direct",
      platform: "linux/amd64",
      command: "echo 'Hello from Docker container!'",
    },
  });

  // Log all result properties to see what we have
  console.log("\nWorkflow execution complete!");
  console.log("Result keys:", Object.keys(result));

  // Check for results
  if (result.results) {
    console.log("\nStep results:");
    for (const [stepId, stepResult] of Object.entries(result.results)) {
      console.log(`\n[${stepId}] Status: ${stepResult.status}`);

      if (stepId === "report" && stepResult.status === "success") {
        console.log("\nFOUND REPORT:");
        console.log(stepResult.output.report);
      }
    }
  }
}

// Run the test
main().catch(console.error);
