import { mastra } from "./mastra";

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

    // Create a run instance with createRun() and use start() method
    const { runId, start } = workflow.createRun();
    console.log(`Created workflow run with ID: ${runId}`);

    // Execute the workflow with our test parameters
    const result = await start({
      triggerData: {
        repository: "runpod-workers/worker-basic",
        imageName: "runpod-worker-basic-test",
        platform: "linux/amd64",
        ports: ["8080:80"],
        envVars: { TEST_MODE: "true" },
        command: "echo 'Hello from Docker container!'",
      },
    });

    console.log("\n--- WORKFLOW EXECUTION RESULTS ---");

    // The result object contains step results
    if (result) {
      console.log("\nStep Results:");
      Object.entries(result).forEach(([stepId, stepResult]) => {
        console.log(`\n[${stepId}]:`);
        console.log(JSON.stringify(stepResult, null, 2));
      });
    }

    // Check if the report step succeeded
    const reportStep = (result as any)?.report;
    if (reportStep?.status === "success" && reportStep.output?.report) {
      console.log("\n--- FINAL REPORT ---");
      console.log(reportStep.output.report);
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
  .catch((error) => console.error("Workflow test failed:", error));
