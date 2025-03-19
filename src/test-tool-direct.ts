import { dockerValidationTool } from "./mastra/tools/docker-validation-tool";

async function main() {
  console.log("Testing Docker validation tool directly...");

  try {
    if (!dockerValidationTool) {
      throw new Error("Docker validation tool not found");
    }

    // TypeScript assertion to fix the type error
    const executeTool = dockerValidationTool.execute as (params: {
      context: {
        repository: string;
        imageName?: string;
        platform?: string;
        ports?: string[];
        envVars?: Record<string, string>;
        command?: string;
      };
      mastra?: any;
    }) => Promise<any>;

    // Execute the tool with the required parameters
    const result = await executeTool({
      context: {
        repository: "runpod-workers/worker-basic",
        imageName: "test-image-tool-direct",
        command: "echo 'Hello from Docker container!'",
      },
      mastra: undefined,
    });

    // Log the result
    console.log("\nTool execution complete!");
    console.log("\nTool Result:");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error executing tool:", error);
  }
}

// Run the test
main().catch(console.error);
