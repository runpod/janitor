import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { getMastraInstance } from "../utils/mastra-singleton";

/**
 * PR Creator - Creates a pull request for a fixed repository
 *
 * This tool serves as an integration point between the Repository Validator and the PR workflow,
 * enabling PR creation after successful validation and repairs.
 */
export const pullRequest = createTool({
	id: "pull request",
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
	}),
	description: "Creates or updates a Pull Request for a repository that has been fixed",
	execute: async ({ context }): Promise<any> => {

		console.log("ARE WE EVER GOING IN HERE?")

		try {
			console.log(`Initiating PR creation for repository: ${context.repository}`);
			console.log(`Repository path: ${context.repositoryPath}`);

			try {
				// Get the mastra instance from our singleton
				const mastra = getMastraInstance();

				const agent = mastra.getAgent("prCreatorAgent");

				// Prepare the message for the agent with all necessary details
				const messageToAgent = `
- repository: ${context.repository}
- repository path: ${context.repositoryPath}
- fixes: 
  ${context.fixes.map(fix => `- ${fix.file}: ${fix.description}`).join("\n")}

The repository has been successfully fixed and validation has passed.

Return a bullet list with the PR details including whether it was successful, the PR number, URL and a summary of what was done.
`;

				// Call the agent to handle the PR creation with structured output
				console.log("Calling Repository PR Agent to create the PR...");
				const result = await agent.generate(messageToAgent);

				console.log("============= PR AGENT RESPONSE =============");
				console.log(result.text);
				console.log("--------------------------------");
				console.log(JSON.stringify(result.response.messages, null, 2));
				console.log("================================================\n");

				return result.text;
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
