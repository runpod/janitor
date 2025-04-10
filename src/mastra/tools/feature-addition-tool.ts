import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { operationOutputSchema } from "../agents/dev"; // Import the output schema from Dev agent

// Define the input schema for the feature addition tool
const featureAdditionInputSchema = z.object({
	repoPath: z.string().describe("The local file system path to the checked-out repository."),
	featureRequest: z
		.string()
		.describe(
			"Detailed description of the feature to add, including directories, files, content, and modifications."
		),
});

// Define the output schema for the feature addition tool (should match Dev agent's output)
const featureAdditionOutputSchema = operationOutputSchema; // Reuse the schema

/**
 * Tool to invoke the Dev agent for adding features to a repository.
 */
export const add_feature = createTool({
	id: "add_feature",
	description:
		"Invokes the Dev agent to add a specified feature (create directories/files, modify files) to the repository.",
	inputSchema: featureAdditionInputSchema,
	outputSchema: featureAdditionOutputSchema, // Ensure tool output matches Dev agent's structured output
	execute: async ({ context, mastra }) => {
		try {
			console.log("\n----------------------------------------------------------------");
			console.log("----------------------------------------------------------------");
			console.log("✨ FEATURE ADDITION TOOL");
			console.log("using the 'dev' agent");
			console.log("----------------------------------------------------------------\n");

			console.log(`Adding feature to repo at: ${context.repoPath}`);
			console.log(`Feature Request Details: ${context.featureRequest}`);

			// Ensure Mastra instance is available
			if (!mastra) {
				throw new Error("Mastra instance is not available in the tool execution context.");
			}

			// Get the Dev agent instance
			const devAgent = mastra.getAgent("dev");
			if (!devAgent) {
				throw new Error("Dev agent instance not found.");
			}

			// Construct the prompt for the Dev agent
			// The Dev agent expects the task description directly.
			const devPrompt = `Add the following feature to the repository located at "${context.repoPath}":\n\n${context.featureRequest}\n\nEnsure you follow the required JSON output format.`;

			console.log(`Prompting Dev Agent: ${devPrompt}`);

			// Call the Dev agent
			const response = await devAgent.generate(devPrompt);

			console.log("Dev Agent Raw Response Text:", response.text);

			// Attempt to parse the structured JSON output from the Dev agent's response text
			let structuredOutput;
			try {
				// Extract JSON block if present
				const jsonMatch = response.text.match(/```json\n([\s\S]*?)\n```/);
				if (jsonMatch && jsonMatch[1]) {
					structuredOutput = JSON.parse(jsonMatch[1]);
					console.log("Parsed structured output from Dev Agent:", structuredOutput);
					// Validate against the schema
					const validationResult =
						featureAdditionOutputSchema.safeParse(structuredOutput);
					if (!validationResult.success) {
						console.error(
							"Dev agent output validation failed:",
							validationResult.error
						);
						throw new Error(
							`Dev agent returned output that failed schema validation: ${validationResult.error.message}`
						);
					}
					// Return the validated, structured output directly
					return validationResult.data;
				}
				// Fallback: Try parsing the whole text if no JSON block found
				structuredOutput = JSON.parse(response.text);
				const validationResult = featureAdditionOutputSchema.safeParse(structuredOutput);
				if (!validationResult.success) {
					console.error(
						"Dev agent output validation failed (fallback parsing):",
						validationResult.error
					);
					throw new Error(
						`Dev agent returned output that failed schema validation: ${validationResult.error.message}`
					);
				}
				console.log("Parsed structured output (fallback):", structuredOutput);
				return validationResult.data;
			} catch (parseError: any) {
				console.error("Failed to parse JSON output from Dev agent:", parseError);
				// Return a failure state if parsing fails
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

// Add export to index if needed
// export { add_feature };
