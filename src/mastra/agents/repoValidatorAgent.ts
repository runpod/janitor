import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { repoValidatorWorkflow } from "../workflows/repoValidator";
import { gitCheckoutTool } from "../../git-tools";

// Define types for step results
interface StepSuccess<T> {
  status: "success";
  output: T;
}

// Create a tool to trigger the repository validation workflow
const validateRepositoryTool = createTool({
  id: "validateRepositoryTool",
  description:
    "Validates a GitHub repository by checking out the code, locating the Dockerfile, building the Docker image, and testing the container.",
  inputSchema: z.object({
    repository: z
      .string()
      .describe(
        'The GitHub repository to validate (e.g., "username/repo" or organization/repo)'
      ),
    repositoryUrl: z
      .string()
      .optional()
      .describe("Optional URL for the repository if not on GitHub"),
  }),
  outputSchema: z.object({
    success: z.boolean().describe("Whether the validation was successful"),
    report: z.string().describe("The validation report"),
    reportPath: z.string().optional().describe("Path to the saved report file"),
  }),
  execute: async ({ context }) => {
    try {
      console.log(`Validating repository: ${context.repository}`);

      // Run the workflow
      const { start } = repoValidatorWorkflow.createRun();
      const result = await start({
        triggerData: {
          name: context.repository,
          url: context.repositoryUrl,
        },
      });

      // Extract report information
      const reportGenStep = result.results.reportGeneration;

      if (!reportGenStep || reportGenStep.status !== "success") {
        throw new Error("Report generation failed");
      }

      // Now we know reportGenStep is a successful step with output
      const reportGenResult = (reportGenStep as StepSuccess<any>).output;

      return {
        success: reportGenResult?.report?.overallSuccess || false,
        report: reportGenResult?.summary || "No report generated",
        reportPath: reportGenResult?.reportPath,
      };
    } catch (error) {
      console.error(
        `Error validating repository: ${error instanceof Error ? error.message : String(error)}`
      );
      return {
        success: false,
        report: `Error validating repository: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// Create a tool to validate multiple repositories from a file
const validateRepositoriesFromFileTool = createTool({
  id: "validateRepositoriesFromFileTool",
  description: "Validates multiple GitHub repositories listed in a file.",
  inputSchema: z.object({
    filePath: z
      .string()
      .describe("Path to the file containing repository names, one per line"),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        repository: z.string(),
        success: z.boolean(),
        reportPath: z.string().optional(),
      })
    ),
    summary: z.string(),
  }),
  execute: async ({ context }) => {
    try {
      const fs = await import("fs/promises");
      const path = await import("path");

      // Read file with repository names
      const fileContent = await fs.readFile(context.filePath, "utf-8");
      const repositories = fileContent
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      console.log(`Found ${repositories.length} repositories to validate`);

      const results = [];
      for (const repo of repositories) {
        console.log(`Processing repository: ${repo}`);

        try {
          // Run the workflow for this repository
          const { start } = repoValidatorWorkflow.createRun();
          const result = await start({
            triggerData: {
              name: repo,
            },
          });

          // Extract report information
          const reportGenStep = result.results.reportGeneration;

          if (reportGenStep && reportGenStep.status === "success") {
            const reportGenResult = (reportGenStep as StepSuccess<any>).output;

            results.push({
              repository: repo,
              success: reportGenResult?.report?.overallSuccess || false,
              reportPath: reportGenResult?.reportPath,
            });
          } else {
            results.push({
              repository: repo,
              success: false,
            });
          }
        } catch (error) {
          console.error(
            `Error validating repository ${repo}: ${error instanceof Error ? error.message : String(error)}`
          );
          results.push({
            repository: repo,
            success: false,
          });
        }
      }

      // Create summary
      const successCount = results.filter((r) => r.success).length;
      const summary = `
# Batch Validation Results

Validated ${repositories.length} repositories:
- ✅ Success: ${successCount}
- ❌ Failure: ${repositories.length - successCount}

## Repository Status

${results.map((r) => `- ${r.repository}: ${r.success ? "✅ Passed" : "❌ Failed"}`).join("\n")}

*Reports saved to individual files.*
`;

      // Save summary to file
      const reportsDir = path.join(process.cwd(), "reports");
      try {
        await fs.mkdir(reportsDir, { recursive: true });
      } catch (error) {
        // Directory already exists
      }

      const summaryFilePath = path.join(
        reportsDir,
        `batch-summary-${Date.now()}.md`
      );
      await fs.writeFile(summaryFilePath, summary);

      return {
        results,
        summary,
      };
    } catch (error) {
      console.error(
        `Error batch validating repositories: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  },
});

// Create the repo validator agent
export const repoValidatorAgent = new Agent({
  name: "Repository Validator Agent",
  instructions: `You are an AI assistant that can help validate RunPod worker repositories.
  You can:
  1. Validate a single GitHub repository by checking out the code, locating the Dockerfile, building the Docker image, and testing the container.
  2. Validate multiple repositories listed in a file.
  
  When validating repositories, you'll check:
  - If the repository exists and can be cloned
  - If it contains a valid Dockerfile
  - If the Docker image can be built successfully
  - If the built container works as expected
  
  You'll provide detailed feedback about any issues found during validation.`,
  model: openai("gpt-4o"),
  tools: {
    validateRepositoryTool,
    validateRepositoriesFromFileTool,
    gitCheckoutTool,
  },
});
