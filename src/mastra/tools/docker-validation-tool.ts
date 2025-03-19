import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { dockerValidationWorkflow } from "../workflows/docker-validation-workflow";

// Define input schema for the Docker validation tool
const inputSchema = z.object({
  repository: z
    .string()
    .describe("Repository name (e.g., 'organization/repo')"),
  imageName: z
    .string()
    .optional()
    .describe("Optional custom name for Docker image"),
  platform: z
    .string()
    .optional()
    .describe("Optional target platform (e.g., 'linux/amd64')"),
  ports: z.array(z.string()).optional().describe("Optional port mappings"),
  envVars: z
    .record(z.string())
    .optional()
    .describe("Optional environment variables"),
  command: z
    .string()
    .optional()
    .describe("Optional command to run in container"),
});

// Create the Docker validation tool
export const dockerValidationTool = createTool({
  id: "Docker Repository Validator",
  description:
    "Validates a Docker repository by checking out the code, building the image, running a container, and checking logs.",
  inputSchema,
  execute: async ({ context }) => {
    try {
      // Use the workflow directly
      console.log(
        `Starting Docker validation for repository: ${context.repository}`
      );

      // Create a run and execute the workflow
      const { runId, start } = dockerValidationWorkflow.createRun();

      // Start the workflow with the parameters
      const result = await start({
        triggerData: {
          repository: context.repository,
          imageName: context.imageName,
          platform: context.platform,
          ports: context.ports,
          envVars: context.envVars,
          command: context.command,
        },
      });

      // Log useful debugging information
      console.log("Workflow result keys:", Object.keys(result));

      if (result.results) {
        console.log("Steps in results:", Object.keys(result.results));
      }

      // Get the report directly from the 'report' step
      const reportStepResult = result.results?.report;

      if (
        reportStepResult?.status === "success" &&
        reportStepResult.output?.report
      ) {
        // Extract success/failure status from the report
        const report = reportStepResult.output.report;
        const isSuccess = report.includes("**Overall Success**: ✅ Passed");

        return {
          success: true,
          passed: isSuccess,
          report: report,
        };
      }

      // If we couldn't find the report step, log the full results for debugging
      console.error(
        "Couldn't find report step result. Full workflow result:",
        JSON.stringify(result, null, 2)
      );

      return {
        success: false,
        error: "Workflow completed but no report was generated",
      };
    } catch (error) {
      console.error(`Error running Docker validation workflow: ${error}`);
      return {
        success: false,
        error: `Error running Docker validation workflow: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
