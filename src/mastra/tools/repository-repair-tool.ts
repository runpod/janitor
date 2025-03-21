import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { mastra } from "../..";
import { repairOutputSchema } from "../agents/repository-repair-agent";

// Define the return type for the execute function
type RepairToolResult = {
	success: boolean;
	repaired: boolean;
	fixes: any[]; // Make fixes non-optional
	analysis?: string;
	response?: string;
	needsRevalidation: boolean;
	repoPath?: string;
	repository?: string;
	originalErrors?: string[];
	error?: string;
};

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
		customInstructions: z.string().optional().describe("Optional specific repair instructions"),
		attemptCount: z.number().optional().describe("Number of repair attempts so far"),
	}),
	description: "Attempts to repair a repository that failed validation",
	execute: async ({ context }): Promise<RepairToolResult> => {
		console.log("use the repositoryRepairTool to fix a problem");

		try {
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

			// Create the Repository Repair Agent
			console.log("Creating Repository Repair Agent inside tool...");
			const agent: Agent = mastra.getAgent("repositoryRepairAgent");

			// Generate the prompt for the repair agent
			const prompt = `
I need your help fixing a Docker build failure in a repository.

Repository: ${context.repository}
Build Status: ${context.buildStatus}
Container Status: ${context.containerStatus}

The repository is located at: ${context.repoPath}

Error Summary:
${context.errors.join("\n")}

Build Logs:
${context.logs}
${customPrompt}

Please analyze these errors and fix the issues in the repository. Start by exploring the
repository structure, identifying Dockerfiles, and understanding the build process.
Then diagnose the problems and apply appropriate fixes.

Return a structured output with your analysis, list of fixes made, and whether you were successful.
`;

			// Run the agent to repair the repository using structured output
			console.log("\n=== REPAIR AGENT STARTING ===\n");
			console.log(prompt);

			const agentResponse = await agent.generate(prompt, {
				output: repairOutputSchema,
			});

			// Log the agent's response details
			console.log("\n=== REPAIR AGENT RESPONSE ===\n");
			// For structured output, we need to log the object directly
			console.log(JSON.stringify(agentResponse.object, null, 2));
			console.log("\n=== END OF REPAIR AGENT RESPONSE ===\n");

			// Get the structured output directly
			const result: z.infer<typeof repairOutputSchema> = agentResponse.object;

			// Log the structured result
			console.log("\n=== STRUCTURED REPAIR RESULTS ===");
			console.log(`Success: ${result.success}`);
			console.log(`Fixes made: ${result.fixes.length}`);
			result.fixes.forEach((fix: { file: string; description: string }, index: number) => {
				console.log(`  ${index + 1}. ${fix.file}: ${fix.description}`);
			});
			console.log("=================================\n");

			const response: RepairToolResult = {
				success: true,
				repaired: result.success && result.fixes.length > 0,
				fixes: [...result.fixes],
				analysis: result.analysis,
				// We don't have text property when using structured output, so use the analysis instead
				response: result.analysis,
				needsRevalidation: result.success,
				repoPath: context.repoPath,
				repository: context.repository,
				originalErrors: context.errors,
			};

			console.log("\n=== REPAIR COMPLETED ===");
			console.log(`Success: ${response.success}`);
			console.log(`Repaired: ${response.repaired}`);
			console.log(`Fixes made: ${response.fixes.length}`);
			console.log(`Needs revalidation: ${response.needsRevalidation}`);
			console.log("=========================\n");

			if (response.success) {
				console.log("\nIMPORTANT: REPOSITORY MODIFIED - RE-VALIDATION REQUIRED");
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
				fixes: [], // Add empty fixes array to satisfy type
			};
		}
	},
});
