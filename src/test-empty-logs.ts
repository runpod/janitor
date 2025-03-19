import { dockerValidationWorkflow } from "./mastra/workflows/docker-validation-workflow";

async function main() {
  console.log(
    "Testing Docker validation workflow with container that produces no logs..."
  );

  // Create a run and execute the workflow
  const { runId, start } = dockerValidationWorkflow.createRun();

  // Start the workflow with parameters that use a simple "true" command that exits immediately
  console.log(`Starting workflow run with ID: ${runId}`);

  const result = await start({
    triggerData: {
      repository: "runpod-workers/worker-basic",
      imageName: "test-image-no-logs",
      platform: "linux/amd64",
      command: "true", // A command that exits successfully but produces no output
    },
  });

  // Log the result
  console.log("\nWorkflow execution complete!");
  console.log("Result keys:", Object.keys(result));

  // Check for results
  if (result.results) {
    console.log("\nStep results:");
    for (const [stepId, stepResult] of Object.entries(result.results)) {
      console.log(`\n[${stepId}] Status: ${stepResult.status}`);

      if (stepId === "logs") {
        // Check if it's a success result first
        if (stepResult.status === "success") {
          const successResult = stepResult as any; // Type assertion for simplicity
          console.log(`Logs success: true`);
          console.log(
            `Logs content length: ${successResult.output?.logs?.length || 0}`
          );
          console.log(
            `Logs line count: ${successResult.output?.lineCount || 0}`
          );
        } else {
          console.log(`Logs success: false`);
          console.log(
            `Logs error: ${(stepResult as any).error || "Unknown error"}`
          );
        }
      }

      if (stepId === "report" && stepResult.status === "success") {
        console.log("\nFOUND REPORT:");
        console.log(stepResult.output.report);
      }
    }
  }
}

// Run the test
main().catch(console.error);
