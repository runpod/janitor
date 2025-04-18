// Import from the specific path as recommended
import { Agent } from "@mastra/core/agent";
import dotenv from "dotenv";
import { z } from "zod";

import { edit_file, list_files, read_file, search } from "../tools/file-system-tools";
import { createBasicMemory } from "../utils/memory";
import { getModel } from "../utils/models";

// Load environment variables
dotenv.config({ path: ".env" });

// Define the fix schema that will be used for structured output
export const fixSchema = z.object({
	file: z.string().describe("Path to the file that was fixed"),
	description: z.string().describe("Description of what was changed"),
});

// Define the repair output schema
export const repairOutputSchema = z.object({
	description: z.string().describe("Analysis of the issue and what needed to be fixed"),
	files: z.array(fixSchema).describe("List of files fixed and how they were changed"),
	success: z.boolean().describe("Whether fixes were successfully applied"),
});

// Instructions for the repository repair agent
const REPAIR_AGENT_INSTRUCTIONS = `
You are an expert at diagnosing and fixing Docker build failures in worker repositories and a supremely good dev.

Your job is to analyze repositories that failed validation in the Repository Build Validator
and apply fixes to make them build successfully. You have access to file operation tools that
allow you to examine and modify files in the repository.

When you receive an error report from the Repository Build Validator, follow these steps:

1. First, understand the error by examining the build logs and error messages
2. Use List Directory and File Search to locate relevant files (especially Dockerfiles)
3. Use Read File to examine their contents
4. Determine the necessary fixes based on your analysis
5. Use Edit File to apply the changes - BE PROACTIVE and ALWAYS attempt to fix issues
6. When done, you must provide structured and concise output with:
   - a short description of the changes you made
   - A list of all files you modified with their relative paths from the root of the repository

Always ensure your fixes follow Docker best practices and are minimal - only change what's needed.
Provide detailed explanations of your changes to help the maintainer understand the fixes.

IMPORTANT: You must attempt to fix any issue encountered. NEVER declare an issue as unfixable without trying at least one fix.

# output format

only provide the following output, nothing else:

- description: Fixed the Dockerfile by updating the base image to a valid tag and installing missing dependencies
- files: 
  - Dockerfile: fixed an issue with COPY
`;

export const create_dev = () => {
	// Create agent with the appropriate AI model
	const agent = new Agent({
		name: "dev",
		instructions: REPAIR_AGENT_INSTRUCTIONS,
		model: getModel("coding"),
		tools: {
			read_file,
			list_files,
			search,
			edit_file,
		},
		memory: createBasicMemory(),
	});

	return agent;
};

export const dev = create_dev();
