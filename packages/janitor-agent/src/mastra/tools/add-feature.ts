import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { getMastraInstance } from "../utils/mastra.js";

// Define the input schema for the feature addition tool
const featureAdditionInputSchema = z.object({
	repoPath: z.string().describe("Path to the checked out repository"),
	featureRequest: z
		.string()
		.describe(
			"Detailed description of the feature to add, including directories, files, content, and modifications."
		),
});

/**
 * Tool to invoke the Dev agent for adding features to a repository.
 */
export const add_feature = createTool({
	id: "add_feature",
	description:
		"Invokes the Dev agent to add a specified feature (create directories/files, modify files) to the repository.",
	inputSchema: featureAdditionInputSchema,
	execute: async ({ context }) => {
		try {
			console.log("\n----------------------------------------------------------------");
			console.log("----------------------------------------------------------------");
			console.log("✨ FEATURE ADDITION TOOL");
			console.log("using the 'dev' agent");
			console.log("----------------------------------------------------------------\n");

			// Get the Dev agent instance
			const mastra = getMastraInstance();
			const devAgent = mastra.getAgent("dev");
			const devPrompt = `**full path to repository**: "${context.repoPath}".
**feature request**: ${context.featureRequest}`;

			console.log(`Prompting Dev Agent: ${devPrompt}`);

			// Call the Dev agent
			const response = await devAgent.generate(devPrompt, {
				maxSteps: 20,
			});

			console.log("Dev Agent Raw Response Text:", response.text);

			return {
				success: true,
				responseText: response.text,
				description: "Dev agent executed. See responseText for details.",
			};
		} catch (error: any) {
			console.error(`Error in feature addition tool: ${error.message}`);
			return {
				description: `Failed to execute feature addition: ${error.message}`,
				success: false,
				responseText: null,
			};
		}
	},
});
