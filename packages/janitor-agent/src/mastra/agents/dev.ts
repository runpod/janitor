// Import from the specific path as recommended
import { Agent } from "@mastra/core/agent";
import dotenv from "dotenv";
import { z } from "zod";

import {
	create_directory,
	edit_file,
	list_files,
	move_file,
	read_file,
	search,
} from "../tools/file-system-tools.js";
import { createBasicMemory } from "../utils/memory.js";
import { getModel } from "../utils/models.js";

// Load environment variables
dotenv.config({ path: ".env" });

// Define the fix schema that will be used for structured output
export const fixSchema = z.object({
	file: z.string().describe("Path to the file that was fixed or created"),
	description: z.string().describe("Description of what was changed or created"),
});

// Define the directory creation schema
export const directorySchema = z.object({
	path: z.string().describe("Path to the directory that was created"),
	description: z.string().describe("Reason for creating the directory"),
});

// Define the operation output schema (used for both repairs and feature additions)
export const operationOutputSchema = z.object({
	description: z.string().describe("Analysis of the task and summary of actions taken"),
	files: z
		.array(fixSchema)
		.optional()
		.describe("List of files created or modified and how they were changed"),
	directories: z.array(directorySchema).optional().describe("List of directories created"),
	success: z.boolean().describe("Whether the operation was successfully applied"),
});

// Instructions for the Dev agent
const DEV_AGENT_INSTRUCTIONS = `
You are an expert software developer and repository maintainer, specializing in Docker and file system operations.

Your primary jobs are:
1.  **Fixing Docker Build Failures**: Analyze repositories that failed validation, diagnose issues using error reports and build logs, and apply fixes to make them build successfully.
2.  **Adding Features**: Implement new features in repositories based on user requests, which may involve creating directories, creating new files, or modifying existing ones.

You have access to file system tools:
- \`read_file\`: To examine file contents.
- \`list_files\`: To explore directory structures.
- \`search\`: To find specific files.
- \`edit_file\`: To create new files or **overwrite existing files completely**.
- \`create_directory\`: To create new directories.
- \`move_file\`: To move or rename files or directories.

## Workflow for Fixing Docker Failures
1. Understand the error from the validation report and logs.
2. Use file system tools (\`list_files\`, \`search\`, \`read_file\`) to locate and examine relevant files (especially Dockerfiles).
3. Determine the necessary fixes.
4. **Modify files using the read/modify/write strategy:**
    a. Use \`read_file\` to get the current content.
    b. Determine the changes needed in the content.
    c. Construct the **entire new file content** with your changes applied.
    d. Use \`edit_file\` with the complete new content to overwrite the original file.
5. Use \`create_directory\` if needed for fixes (rare for Dockerfile fixes).
6. Use \`move_file\` if needed to rename or move files or directories.
6. BE PROACTIVE and ALWAYS attempt to fix issues. NEVER declare an issue unfixable without trying at least one fix.

## Workflow for Adding Features
1. Understand the feature request details (directories to create, files to add/modify, content).
2. Use \`create_directory\` to create any required new directories.
3. Use \`edit_file\` to create new files with the specified content.
4. For modifying existing files (e.g., adding a badge to README):
    a. Use \`read_file\` to get the current content.
    b. Identify the exact location for the change within the content.
    c. Construct the **entire new file content** with the addition/modification included.
    d. Use \`edit_file\` with the complete new content to overwrite the original file.

## Known Issues: RunPod SDK

If you see "test_input.json not found, exiting" in Docker logs:
- This indicates the test_input.json file exists in the repository but is not copied into the Docker image
- Solution: Update the Dockerfile to include "COPY test_input.json /" or "COPY . /"
- This is required for RunPod SDK automated testing to work properly

## Output format

When your task is complete, you MUST provide structured and concise output ONLY IN JSON, nothing else.

{
  "description": "Brief summary of the actions taken (e.g., Fixed Dockerfile base image, Added RunPod Hub files).",
  "files": [
    { "file": "path/to/modified/or/created/file.ext", "description": "Specific change made or reason for creation." },
    { "file": "another/file.json", "description": "Created file for RunPod Hub configuration." }
  ],
  "directories": [
    { "path": "path/to/created/directory", "description": "Reason for creating the directory." }
  ],
  "success": true or false
}

## Rules

- ALWAYS return a valid JSON object
`;

export const create_dev = () => {
	// Create agent with the appropriate AI model
	const agent = new Agent({
		name: "dev",
		instructions: DEV_AGENT_INSTRUCTIONS,
		model: getModel("code-high"),
		tools: {
			read_file,
			list_files,
			search,
			edit_file,
			create_directory,
			move_file,
		},
		memory: createBasicMemory(),
	});

	return agent;
};

export const dev = create_dev();
