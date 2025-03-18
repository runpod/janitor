import { Step, Workflow } from "@mastra/core/workflows";
import { z } from "zod";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: ".env.development" });

// Define input schema
const repositorySchema = z.object({
  name: z.string().describe("The name of the repository"),
});

// Define output schema
const checkoutResultSchema = z.object({
  success: z.boolean(),
  path: z.string().optional(),
  error: z.string().optional(),
  output: z.string().optional(),
});

// Create step for checking out a repository
const githubCheckoutStep = new Step({
  id: "github-checkout",
  description: "Checks out a GitHub repository",
  inputSchema: repositorySchema,
  outputSchema: checkoutResultSchema,
  execute: async ({ context }) => {
    try {
      const repo = context?.triggerData;
      if (!repo) {
        throw new Error("Repository information not provided");
      }

      console.log(`Checking out repository: ${repo.name}`);

      // Use our improved Git checkout implementation
      const { checkoutGitRepository } = await import("../../git-tools");
      const result = await checkoutGitRepository(repo.name);

      if (!result.success) {
        throw new Error(result.error || "Failed to checkout repository");
      }

      return {
        success: true,
        path: result.path,
        output: result.output,
      };
    } catch (error) {
      console.error(
        `Error checking out repository: ${error instanceof Error ? error.message : String(error)}`
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

// Define the workflow
export const githubCheckoutWorkflow = new Workflow({
  name: "github-checkout",
  triggerSchema: repositorySchema,
});

// Add step to the workflow
githubCheckoutWorkflow.step(githubCheckoutStep);

// Commit the workflow
githubCheckoutWorkflow.commit();
