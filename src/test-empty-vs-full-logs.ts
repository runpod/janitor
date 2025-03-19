import { dockerValidationTool } from "./mastra/tools/docker-validation-tool";

async function testEmptyLogs() {
  console.log("=== TEST WITH EMPTY LOGS ===");

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

    // Execute with a command that produces no output
    const emptyResult = await executeTool({
      context: {
        repository: "runpod-workers/worker-basic",
        imageName: "test-empty-logs",
        command: "true",
      },
      mastra: undefined,
    });

    console.log("\nEmpty Logs Test Result:");
    console.log(`Overall success: ${emptyResult.success}`);
    console.log(`Passed validation: ${emptyResult.passed}`);

    // Extract specific sections from the report text
    const logsStatus = extractSection(
      emptyResult.report,
      "### 4. Container Logs",
      "##"
    );
    console.log("\nLogs Status Section:");
    console.log(logsStatus);

    return emptyResult;
  } catch (error) {
    console.error("Error executing tool with empty logs:", error);
    return null;
  }
}

async function testWithOutput() {
  console.log("\n=== TEST WITH OUTPUT LOGS ===");

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

    // Execute with a command that produces output
    const outputResult = await executeTool({
      context: {
        repository: "runpod-workers/worker-basic",
        imageName: "test-output-logs",
        command: "echo 'This is a test output'",
      },
      mastra: undefined,
    });

    console.log("\nOutput Logs Test Result:");
    console.log(`Overall success: ${outputResult.success}`);
    console.log(`Passed validation: ${outputResult.passed}`);

    // Extract specific sections from the report text
    const logsStatus = extractSection(
      outputResult.report,
      "### 4. Container Logs",
      "##"
    );
    console.log("\nLogs Status Section:");
    console.log(logsStatus);

    return outputResult;
  } catch (error) {
    console.error("Error executing tool with output logs:", error);
    return null;
  }
}

// Helper function to extract a section from the report text
function extractSection(
  text: string,
  startMarker: string,
  endMarker: string
): string {
  const startIndex = text.indexOf(startMarker);
  if (startIndex === -1) return "Section not found";

  const endIndex = text.indexOf(endMarker, startIndex + startMarker.length);
  if (endIndex === -1) {
    return text.substring(startIndex);
  }

  return text.substring(startIndex, endIndex).trim();
}

async function main() {
  await testEmptyLogs();
  await testWithOutput();
}

main().catch(console.error);
