import { mastra } from "./mastra";

async function main() {
  try {
    // Get the repo validator agent
    const agent = mastra.getAgent("repoValidatorAgent");
    if (!agent) {
      console.error("Repository Validator Agent not found!");
      return;
    }

    console.log("Running repository validation with agent...");

    // Simple request to validate a single repository
    const response = await agent.generate(
      "Please validate the Docker repository runpod-workers/worker-basic with command 'echo TEST_OUTPUT'"
    );

    console.log("\nWaiting 3 seconds for agent to finish processing...");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    if (response && response.text) {
      console.log("\nAgent Response:");
      console.log(response.text);

      // Print tool results if available
      if (response.toolResults && response.toolResults.length > 0) {
        console.log("\nTool Results:");
        for (const toolResult of response.toolResults) {
          console.log(`Tool: ${toolResult.toolName}`);
          console.log(`Result: ${JSON.stringify(toolResult.result, null, 2)}`);
        }
      }
    } else {
      console.error("No response received from agent");
    }
  } catch (error) {
    console.error("Error running agent test:", error);
  }
}

main().catch(console.error);
