import { mastra } from "./mastra";

async function main() {
  try {
    // Get the simple test workflow
    const workflow = mastra.getWorkflow("simpleTestWorkflow");
    if (!workflow) {
      console.error("Simple test workflow not found!");
      return;
    }
    console.log("Got workflow:", workflow.name);

    // Create a run
    const run = workflow.createRun();
    console.log("Created run with ID:", run.runId);

    // Start the workflow
    const result = await run.start({
      triggerData: {
        message: "Hello world from direct test!",
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
