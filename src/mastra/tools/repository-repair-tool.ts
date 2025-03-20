import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { repairRepository } from "../agents/repository-repair-agent.js";

/**
 * Repository Repair Tool - Allows the Validator Agent to request repairs for failed repositories
 *
 * This tool serves as a bridge between the Repository Validator and the Repository Repair Agent,
 * enabling the validator to automatically request fixes when validation fails.
 */
export const repositoryRepairTool = createTool({
  id: "Repository Repair",
  inputSchema: z.object({
    repository: z.string().describe("Repository name (owner/repo)"),
    repoPath: z.string().describe("Path to the checked out repository"),
    buildStatus: z.enum(["success", "failure"]),
    containerStatus: z.enum(["success", "failure"]),
    errors: z.array(z.string()),
    logs: z.string(),
    customInstructions: z
      .string()
      .optional()
      .describe("Optional specific repair instructions"),
    attemptCount: z
      .number()
      .optional()
      .describe("Number of repair attempts so far"),
  }),
  description: "Attempts to repair a repository that failed validation",
  execute: async ({ context, mastra }) => {
    try {
      // Prepare the error report object
      const errorReport = {
        repository: context.repository,
        buildStatus: context.buildStatus,
        containerStatus: context.containerStatus,
        errors: context.errors,
        logs: context.logs,
      };

      console.log(`Initiating repair for repository: ${context.repository}`);
      console.log(`Repository path: ${context.repoPath}`);
      console.log(`Build status: ${context.buildStatus}`);
      console.log(`Container status: ${context.containerStatus}`);
      console.log(`Error count: ${context.errors.length}`);

      // Add custom instructions if provided
      let customPrompt = "";
      if (context.customInstructions) {
        customPrompt = `\nSpecial instructions for this repair attempt:\n${context.customInstructions}\n`;
      }

      // Add attempt count information if provided
      if (context.attemptCount && context.attemptCount > 1) {
        customPrompt += `\nThis is repair attempt #${context.attemptCount}. Previous repairs did not fully resolve the issue.\n`;
        customPrompt += `Be more aggressive with your fixes. Consider updating multiple dependencies, changing base images, or other more substantial changes.\n`;
      }

      // Instead of using the agent through mastra, directly use the repairRepository function
      console.log("Running repository repair...");
      const result = await repairRepository(context.repoPath, {
        ...errorReport,
        customPrompt,
      });

      const response = {
        success: result.success,
        repaired:
          result.success && (result.fixes ? result.fixes.length > 0 : false),
        fixes: result.fixes || [],
        response: result.response || "",
        error: result.error,
        needsRevalidation: result.success,
        repoPath: context.repoPath,
        repository: context.repository,
      };

      console.log("\n=== REPAIR COMPLETED ===");
      console.log(`Success: ${response.success}`);
      console.log(`Repaired: ${response.repaired}`);
      console.log(`Fixes made: ${response.fixes.length}`);
      console.log(`Needs revalidation: ${response.needsRevalidation}`);
      console.log("=========================\n");

      if (response.success) {
        console.log(
          "\nIMPORTANT: REPOSITORY MODIFIED - RE-VALIDATION REQUIRED"
        );
        console.log(
          "The validator agent should now revalidate the repository to check if fixes resolved the issues.\n"
        );
      }

      return response;
    } catch (error: any) {
      console.error(`Error repairing repository: ${error.message}`);
      return {
        success: false,
        repaired: false,
        error: String(error),
        needsRevalidation: false,
      };
    }
  },
});

export default repositoryRepairTool;
