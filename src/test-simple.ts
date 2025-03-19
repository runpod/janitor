import { dockerValidationWorkflow } from "./mastra/workflows/docker-validation-workflow";

// Helper to run the workflow with a specific command
async function runWorkflowWithCommand(command: string) {
  console.log(`\n[Testing with command: ${command}]`);
  console.log("=================================================");

  // Create the workflow run
  const { runId, start } = dockerValidationWorkflow.createRun();
  console.log(`Created workflow run with ID: ${runId}`);

  // Start it with the specified command
  try {
    console.log("Starting workflow execution...");
    const result = await start({
      triggerData: {
        repository: "runpod-workers/worker-basic",
        command,
      },
    });

    console.log("Workflow execution completed successfully!");

    if (result.results && result.results.logs) {
      // Print logs step results
      const logsStep = result.results.logs;
      console.log("\nLogs step result:");
      console.log(`Status: ${logsStep.status}`);
      if (logsStep.status === "success") {
        console.log(`Logs content: "${logsStep.output?.logs}"`);
        console.log(`Logs line count: ${logsStep.output?.lineCount}`);
      }

      // Print validation result
      const reportStep = result.results.report;
      if (reportStep && reportStep.status === "success") {
        console.log(
          "\nValidation succeeded? " +
            (reportStep.output.report.includes("✅ Passed") ? "YES" : "NO")
        );
      }
    }

    return result;
  } catch (error) {
    console.error("Error executing workflow:", error);
    return null;
  }
}

// Run tests with different commands
(async function () {
  console.log(
    "Testing Docker validation workflow with different log scenarios"
  );

  // Test with command that produces output
  await runWorkflowWithCommand("echo 'This is a test output'");

  // Test with command that produces no output
  await runWorkflowWithCommand("true");
})();
