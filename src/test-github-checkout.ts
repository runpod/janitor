import { mastra } from "./mastra";

async function main() {
  try {
    // Get the GitHub checkout workflow
    const workflow = mastra.getWorkflow("githubCheckoutWorkflow");
    if (!workflow) {
      console.error("GitHub checkout workflow not found!");
      return;
    }
    console.log("Got workflow:", workflow.name);

    // Create a run
    const run = workflow.createRun();
    console.log("Created run with ID:", run.runId);

    // Start the workflow with correct trigger data
    const result = await run.start({
      triggerData: {
        name: "runpod/worker-stable_diffusion_v2",
      },
    });

    console.log(
      "Workflow completed with result:",
      JSON.stringify(result, null, 2)
    );
  } catch (error) {
    console.error("Error running workflow:", error);
    // Print more detailed error information
    if (error instanceof Error) {
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    process.exit(1);
  }
}

main();
