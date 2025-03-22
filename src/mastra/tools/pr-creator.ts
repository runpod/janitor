import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { getMastraInstance } from "../utils/mastra-singleton";

/**
 * PR Creator - Creates a pull request for a fixed repository
 *
 * This tool serves as an integration point between the Repository Validator and the PR workflow,
 * enabling PR creation after successful validation and repairs.
 */
export const prCreator = createTool({
	id: "PR Creator",
	inputSchema: z.object({
		repositoryPath: z.string().describe("Local path to the repository"),
		repository: z.string().describe("Repository in the format 'owner/repo'"),
		fixes: z
			.array(
				z.object({
					file: z.string().describe("File that was fixed"),
					description: z.string().describe("Description of the fix"),
				})
			)
			.describe("List of fixes that were applied"),
		originalErrors: z.array(z.string()).describe("List of original errors before fixes"),
		revalidationResult: z
			.object({
				success: z.boolean().describe("Whether revalidation was successful"),
				errors: z
					.array(z.string())
					.optional()
					.describe("List of errors if revalidation failed"),
			})
			.optional()
			.describe("Results of revalidation after fixes"),
	}),
	description: "Creates or updates a Pull Request for a repository that has been fixed",
	execute: async ({ context }): Promise<any> => {
		try {
			console.log(`Initiating PR creation for repository: ${context.repository}`);
			console.log(`Repository path: ${context.repositoryPath}`);

			// Only create PRs for successfully fixed repositories
			if (!context.revalidationResult?.success) {
				return {
					success: false,
					message: "PR creation skipped - repository still has validation errors",
					prCreated: false,
				};
			}

			try {
				// Get the mastra instance from our singleton
				const mastra = getMastraInstance();

				const agent = mastra.getAgent("prCreatorAgent");
				if (!agent) {
					console.error("Repository PR Agent not found!");
					return {
						success: false,
						message: "Repository PR Agent not found!",
					};
				}

				// Prepare the message for the agent with all necessary details
				const messageToAgent = `
I need you to create a Pull Request for a fixed repository with the following details:

Repository: ${context.repository}
Repository Path: ${context.repositoryPath}
Number of fixes: ${context.fixes.length}

Fixes applied:
${context.fixes.map(fix => `- ${fix.file}: ${fix.description}`).join("\n")}

Original errors:
${context.originalErrors.join("\n")}

The repository has been successfully fixed and validation has passed.
Please create a PR with these changes, following your standard process for branch creation, committing, and PR submission.

Return a structured output with the PR details including whether it was successful, the PR number, URL, and a summary of what was done.
`;

				// Call the agent to handle the PR creation with structured output
				console.log("Calling Repository PR Agent to create the PR...");
				const agentResponse = await agent.generate(messageToAgent);

				console.log("\n============= PR AGENT RESPONSE =============");
				console.log(agentResponse.text);
				console.log("================================================\n");

				return agentResponse.text;
			} catch (singletonError) {
				console.error(`Error accessing mastra instance: ${singletonError}`);
				return {
					success: false,
					message: `Error accessing mastra instance: ${singletonError instanceof Error ? singletonError.message : String(singletonError)}`,
				};
			}
		} catch (error: any) {
			console.error(`Error creating repository PR: ${error.message}`);
			return `Failed to create PR: ${error instanceof Error ? error.message : String(error)}`;
		}
	},
});
