import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { operationOutputSchema } from "../agents/dev"; // Import the output schema from Dev agent
import { getMastraInstance } from "../utils/mastra";

// Define the input schema for the feature addition tool
const featureAdditionInputSchema = z.object({
	repoPath: z.string().describe("Path to the checked out repository"),
	featureRequest: z
		.string()
		.describe(
			"Detailed description of the feature to add, including directories, files, content, and modifications."
		),
});

// Define the output schema for the feature addition tool (should match Dev agent's output)
const featureAdditionOutputSchema = operationOutputSchema;

/**
 * Tool to invoke the Dev agent for adding features to a repository.
 */
export const add_feature = createTool({
	id: "add_feature",
	description:
		"Invokes the Dev agent to add a specified feature (create directories/files, modify files) to the repository.",
	inputSchema: featureAdditionInputSchema,
	outputSchema: featureAdditionOutputSchema,
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

			// Attempt to parse the structured JSON output from the Dev agent's response text
			let structuredOutput;
			try {
				// Directly parse the entire response text as JSON
				structuredOutput = JSON.parse(response.text);
				console.log("Parsed structured output from Dev Agent:", structuredOutput);

				// Validate against the schema
				const validationResult = featureAdditionOutputSchema.safeParse(structuredOutput);

				if (!validationResult.success) {
					// Log validation error and return failure state
					console.error("Dev agent output validation failed:", validationResult.error);
					return {
						description:
							"Dev agent returned output that failed schema validation: " +
							validationResult.error.message,
						success: false,
						files: [],
						directories: [],
					};
				}

				// Return the validated, structured output directly
				return validationResult.data;
			} catch (parseError: any) {
				// Log parsing error and return failure state
				console.error("Failed to parse JSON output from Dev agent:", parseError);
				return {
					description:
						"Failed to parse the Dev agent's response. Raw response: " + response.text,
					success: false,
					files: [],
					directories: [],
				};
			}
		} catch (error: any) {
			console.error(`Error in feature addition tool: ${error.message}`);
			return {
				description: `Failed to execute feature addition: ${error.message}`,
				success: false,
				files: [],
				directories: [],
			};
		}
	},
});
