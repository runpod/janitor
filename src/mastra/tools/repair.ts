import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// Replace the direct import with our singleton utility
import { getMastraInstance } from "../utils/mastra";

export const repair = createTool({
	id: "repair",
	inputSchema: z.object({
		repository: z.string().describe("Repository name (owner/repo)"),
		repoPath: z.string().describe("Path to the checked out repository"),
		buildStatus: z.enum(["success", "failure"]),
		containerStatus: z.enum(["success", "failure"]),
		errors: z.string(),
		customInstructions: z.string().optional().describe("Optional specific repair instructions"),
		attemptCount: z.number().optional().describe("Number of repair attempts so far"),
	}),
	description: "Attempts to repair a repository that failed validation",
	execute: async ({ context }): Promise<any> => {
		try {
			console.log("\n----------------------------------------------------------------");
			console.log("----------------------------------------------------------------");
			console.log("🛠️  REPAIR TOOL");
			console.log("using the 'dev' agent");
			console.log("----------------------------------------------------------------\n");

			const mastra = getMastraInstance();
			const agent: Agent = mastra.getAgent("dev");

			// Generate the prompt for the repair agent
			const prompt = `
please fix the repository "${context.repository}" at the following path: ${context.repoPath}

the following errors were encountered:	
${context.errors}
`;

			const repairResponse = await agent.generate(prompt, {
				maxSteps: 10,
				maxRetries: 5,
				// experimental_output: repairOutputSchema,
			});

			console.log("\n----------------------------------------------------------------");
			console.log("----------------------------------------------------------------");
			console.log("🤖  dev");
			console.log(repairResponse.text);
			console.log("----------------------------------------------------------------\n");

			return repairResponse.text;
		} catch (error: any) {
			console.error(`Error repairing repository: ${error.message}`);
			return `Error repairing repository: ${error.message}`;
		}
	},
});
