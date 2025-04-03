import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { getMastraInstance } from "../utils/mastra";

/**
 * PR Creator - Creates a pull request for a fixed repository
 *
 * This tool serves as an integration point between the Repository Validator and the PR workflow,
 * enabling PR creation after successful validation and repairs.
 */
export const pull_request = createTool({
	id: "pull_request",
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
		try {
			console.log("\n----------------------------------------------------------------");
			console.log("----------------------------------------------------------------");
			console.log("🛠️  PULL REQUEST TOOL");
			console.log("using the 'pr creator' agent");
			console.log("----------------------------------------------------------------\n");

			// Get the mastra instance from our singleton
			const mastra = getMastraInstance();
			const agent = mastra.getAgent("prCreator");

			const prompt = `please create the pull request for:

- repository: ${context.repository}
- repository path: ${context.repositoryPath}
- fixes: 
  ${context.fixes.map(fix => `- ${fix.file}: ${fix.description}`).join("\n")}
`;

			const result = await agent.generate(prompt);

			console.log("\n----------------------------------------------------------------");
			console.log("----------------------------------------------------------------");
			console.log("🤖  pr creator");
			console.log("----------------------------------------------------------------");
			console.log(result.text);
			console.log("----------------------------------------------------------------\n");

			return `the pr was created successfully: ${result.text}`;
		} catch (error: any) {
			console.error(`Error creating repository PR: ${error.message}`);
			return `Failed to create PR: ${error instanceof Error ? error.message : String(error)}`;
		}
	},
});
