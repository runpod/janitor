import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// Replace the direct import with our singleton utility
import { getMastraInstance } from "../utils/mastra-singleton";

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
export const repair = createTool({
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

			try {
				// Get the mastra instance from our singleton
				const mastra = getMastraInstance();

				// Create the Repository Repair Agent
				console.log("Creating dev...");
				const agent: Agent = mastra.getAgent("dev");

				if (!agent) {
					console.error("dev not found!");
					return {
						success: false,
						repaired: false,
						error: "dev not found",
						needsRevalidation: false,
						fixes: [],
					};
				}

				// Generate the prompt for the repair agent
				const prompt = `
The following repository failed validation because of a at least one error:

Repository: ${context.repository}
Repository Path: ${context.repoPath}
Build Status: ${context.buildStatus}
Container Status: ${context.containerStatus}

Error Summary:
${context.errors.join("\n")}

Build Logs:
${context.logs}
${customPrompt}

Please let me know which changes you made.
`;

				// Run the agent to repair the repository using structured output
				console.log("\n=== REPAIR AGENT STARTING ===\n");

				const repairResponse = await agent.generate(prompt, {
					maxSteps: 10,
					maxRetries: 5,
				});
				console.log("\n============= REPAIR AGENT RESPONSE =============");
				console.log(repairResponse.text);
				console.log("================================================\n");

				// Return the agent's response properly formatted
				return {
					success: true,
					repaired: true,
					response: repairResponse.text,
					needsRevalidation: true,
					fixes: [], // Since we can't extract structured fixes from text
					repoPath: context.repoPath,
					repository: context.repository,
				};
			} catch (singletonError) {
				console.error(`Error accessing mastra instance: ${singletonError}`);
				return {
					success: false,
					repaired: false,
					error: `Error accessing mastra instance: ${singletonError instanceof Error ? singletonError.message : String(singletonError)}`,
					needsRevalidation: false,
					fixes: [],
				};
			}
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
