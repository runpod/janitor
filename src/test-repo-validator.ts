import { mastra } from "./mastra";

async function main() {
  try {
    // Get the repository validator workflow
    const workflow = mastra.getWorkflow("repoValidatorWorkflow");
    if (!workflow) {
      console.error("Repository validator workflow not found!");
      return;
    }
    console.log("Got workflow:", workflow.name);

    // Create a run
    const run = workflow.createRun();
    console.log("Created run with ID:", run.runId);

    // Start the workflow
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
  }
}

main();
