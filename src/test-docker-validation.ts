import { mastra } from "./mastra";

async function testDockerValidation() {
  try {
    // Get the Repository Validator Agent
    const agent = mastra.getAgent("repoValidatorAgent");
    if (!agent) {
      console.error("Repository Validator Agent not found!");
      return;
    }

    console.log("Initiating Docker validation...");

    // Call the Docker validation tool
    const toolResult = await agent.generateWithTools(
      "Validate the runpod/basic-worker repository using the Docker validation tool",
      {
        toolChoice: "runDockerValidationTool",
        toolParameters: {
          repository: "runpod/basic-worker",
          imageName: "runpod-basic-worker-test",
        },
      }
    );

    console.log("Docker validation completed!");
    console.log("Response:", toolResult.text);

    // Also print tool result if available
    if (toolResult.toolResults && toolResult.toolResults.length > 0) {
      console.log("\nTool Result:");
      const result = toolResult.toolResults[0].result;
      console.log(`Success: ${result.success}`);
      console.log(`Report:\n${result.report}`);
    }
  } catch (error) {
    console.error("Error running test:", error);
  }
}

// Run the test
testDockerValidation()
  .then(() => console.log("\nTest finished"))
  .catch((error) => console.error("Test failed:", error));
