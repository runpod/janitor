import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { getMastraInstance } from "../utils/mastra.js";
import { checkGitStatus } from "./git-tools.js";

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
			.optional()
			.describe(
				"Optional list of fixes that were applied - if not provided, will use git status to detect changes"
			),
		context: z
			.string()
			.optional()
			.describe(
				"Optional additional context about what was done (e.g., 'Added new feature', 'Fixed validation errors')"
			),
	}),
	description:
		"Creates or updates a Pull Request for a repository that has been fixed. Automatically detects changed files using git status.",
	execute: async ({ context }): Promise<any> => {
		try {
			console.log("\n----------------------------------------------------------------");
			console.log("----------------------------------------------------------------");
			console.log("🛠️  PULL REQUEST TOOL");
			console.log("using the 'pr creator' agent");
			console.log("----------------------------------------------------------------\n");

			// First, check if there are any changes in the repository
			console.log("📊 Checking for changes in the repository...");
			const statusCheck = await checkGitStatus(context.repositoryPath);

			if (!statusCheck.success) {
				console.error(`❌ Failed to check git status: ${statusCheck.error}`);
				return `Failed to check repository status: ${statusCheck.error}`;
			}

			if (!statusCheck.hasChanges) {
				console.log("ℹ️  No changes detected in repository - skipping PR creation");
				return `No changes detected in repository at ${context.repositoryPath}. No PR needed.`;
			}

			console.log(
				`✅ Changes detected! Found ${statusCheck.changedFiles.length} changed files:`
			);
			statusCheck.changedFiles.forEach(file => console.log(`   - ${file}`));

			// Get the mastra instance from our singleton
			const mastra = getMastraInstance();
			const agent = mastra.getAgent("prCreator");

			// Build the prompt - use git status as primary source, fixes as optional context
			let prompt = `please create the pull request for:

- repository: ${context.repository}
- repository path: ${context.repositoryPath}

Changed files detected by git status:
${statusCheck.changedFiles.map(file => `- ${file}`).join("\n")}`;

			// Add manual fixes context if provided
			if (context.fixes && context.fixes.length > 0) {
				prompt += `

Additional context about the changes:
${context.fixes.map(fix => `- ${fix.file}: ${fix.description}`).join("\n")}`;
			}

			// Add general context if provided
			if (context.context) {
				prompt += `

Context: ${context.context}`;
			}

			const result = await agent.generate(prompt, {
				maxSteps: 20,
			});

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
