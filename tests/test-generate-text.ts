import { generateText, tool } from "ai";
import dotenv from "dotenv";
import { z } from "zod";

import { runpodModel } from "../mastra/utils/models";

dotenv.config({ path: ".env" });


// Create the stream using the AI SDK
const result = await generateText({
	model: runpodModel,
	messages: [
		{
			role: "system",
			content:
				"You are a helpful assistant that can answer questions and help with tasks. you can use tools if they are needed to answer the questions of the user, but if the tools is not needed, then you just answer the question",
		},
		{
			role: "user",
			content: "what is weather in Berlin Charlottenburg?",
		},
	],
	temperature: 0.0,
	maxTokens: 1000,
	tools: {
		dockerValidation: tool({
			description: "Validate a docker repository",
			parameters: z.object({
				repository: z.string().describe("The repository to validate"),
			}),
			execute: async ({ repository }) => ({
				repository,
				validation: "valid",
			}),
		}),
	},
	toolChoice: "auto",
	maxSteps: 10,
});

try {
	console.log(result);
	console.log(result.text);
} catch (error) {
	console.error("Error processing AI SDK stream:", error);
	throw error;
}
