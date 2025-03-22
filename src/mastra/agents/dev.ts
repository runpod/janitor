// Import crypto polyfill first to ensure crypto is available
import "../utils/crypto-polyfill.js";

import { anthropic } from "@ai-sdk/anthropic";
// Import from the specific path as recommended
import { Agent } from "@mastra/core/agent";
import dotenv from "dotenv";
import { z } from "zod";

import {
	editFileTool,
	fileReadTool,
	fileSearchTool,
	listDirectoryTool,
} from "../tools/file-system-tools";
import { createBasicMemory } from "../utils/memory";

// Load environment variables
dotenv.config({ path: ".env.development" });

// Define the fix schema that will be used for structured output
export const fixSchema = z.object({
	file: z.string().describe("Path to the file that was fixed"),
	description: z.string().describe("Description of what was changed"),
});

// Define the repair output schema
export const repairOutputSchema = z.object({
	analysis: z.string().describe("Analysis of the issue and what needed to be fixed"),
	fixes: z.array(fixSchema).describe("List of files fixed and how they were changed"),
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

{
  "description": "...",
  "files": [
    {
     "path": "/relative/path/to/file.txt",
    }
  ]
}
`;

/**
 * Creates a Repository Repair Agent using Claude-3-7-Sonnet
 */
export const create_dev = () => {
	// Check for Anthropic API key
	const apiKey = process.env.ANTHROPIC_API_KEY;

	if (!apiKey) {
		console.warn("ANTHROPIC_API_KEY not found in environment variables");
		throw new Error(
			"ANTHROPIC_API_KEY is required. Please set it in your environment variables."
		);
	}

	// Create agent with Claude-3-7-Sonnet model
	const agent = new Agent({
		name: "dev",
		instructions: REPAIR_AGENT_INSTRUCTIONS,
		model: anthropic("claude-3-7-sonnet-latest") as any, // Type assertion to bypass compatibility issues
		tools: {
			fileReadTool,
			listDirectoryTool,
			fileSearchTool,
			editFileTool,
		},
		memory: createBasicMemory(),
	});

	return agent;
};

// Initialize and export the agent
export const dev = create_dev();
