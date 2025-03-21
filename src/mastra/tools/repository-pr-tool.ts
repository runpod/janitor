import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { createRepositoryPRAgent, prResultSchema } from "../agents/repository-pr-agent";

/**
 * Repository PR Tool - Creates a pull request for a fixed repository
 *
 * This tool serves as an integration point between the Repository Validator and the Repository PR workflow,
 * enabling PR creation after successful validation and repairs.
 */
export const createRepositoryPRTool = createTool({
	id: "Repository PR Creator",
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
		originalErrors: z.array(z.string()).describe("List of original errors before fixes"),
		revalidationResult: z
			.object({
				success: z.boolean().describe("Whether revalidation was successful"),
				errors: z
					.array(z.string())
					.optional()
					.describe("List of errors if revalidation failed"),
			})
			.optional()
			.describe("Results of revalidation after fixes"),
	}),
	description: "Creates or updates a Pull Request for a repository that has been fixed",
	execute: async ({ context }) => {
		try {
			console.log(`Initiating PR creation for repository: ${context.repository}`);
			console.log(`Repository path: ${context.repositoryPath}`);
			console.log(`Fix count: ${context.fixes.length}`);

			// Only create PRs for successfully fixed repositories
			if (!context.revalidationResult?.success) {
				return {
					success: false,
					message: "PR creation skipped - repository still has validation errors",
					prCreated: false,
				};
			}

			// Create the Repository PR Agent
			console.log("Creating Repository PR Agent...");
			const repositoryPRAgent = await createRepositoryPRAgent();

			// Prepare the message for the agent with all necessary details
			const messageToAgent = `
I need you to create a Pull Request for a fixed repository with the following details:

Repository: ${context.repository}
Repository Path: ${context.repositoryPath}
Number of fixes: ${context.fixes.length}

Fixes applied:
${context.fixes.map(fix => `- ${fix.file}: ${fix.description}`).join("\n")}

Original errors:
${context.originalErrors.join("\n")}

The repository has been successfully fixed and validation has passed.
Please create a PR with these changes, following your standard process for branch creation, committing, and PR submission.

Return a structured output with the PR details including whether it was successful, the PR number, URL, and a summary of what was done.
`;

			// Call the agent to handle the PR creation with structured output
			console.log("Calling Repository PR Agent to create the PR...");
			const agentResponse = await repositoryPRAgent.generate(messageToAgent, {
				output: prResultSchema,
			});

			// Access the structured output directly
			const result = agentResponse.object;

			// Log the structured result
			console.log("\n=== STRUCTURED PR RESULTS ===");
			console.log(`Success: ${result.success}`);
			console.log(`PR Exists: ${result.prExists}`);
			console.log(`PR Number: ${result.prNumber || "Not available"}`);
			console.log(`PR URL: ${result.prUrl || "Not available"}`);
			console.log(`Branch: ${result.branch}`);
			console.log(`Summary: ${result.summary}`);
			console.log("===============================\n");

			if (result.success) {
				console.log("\n=== PR CREATION COMPLETED ===");
				console.log(`Success: ${result.success}`);

				if (result.prNumber) {
					console.log(`PR Number: ${result.prNumber}`);
				}

				if (result.prUrl) {
					console.log(`PR URL: ${result.prUrl}`);
				}

				console.log("=============================\n");

				return {
					success: true,
					message: result.prExists
						? "Pull request successfully updated"
						: "Pull request successfully created",
					prCreated: true,
					prNumber: result.prNumber,
					pullRequestUrl: result.prUrl,
					isUpdate: result.prExists,
					summary: result.summary,
					branch: result.branch,
				};
			}

			console.error("PR creation failed. See agent response for details:", result.summary);
			return {
				success: false,
				message: "PR creation failed. See summary for details.",
				prCreated: false,
				summary: result.summary,
			};
		} catch (error: any) {
			console.error(`Error creating repository PR: ${error.message}`);
			return {
				success: false,
				message: `Failed to create PR: ${error instanceof Error ? error.message : String(error)}`,
				prCreated: false,
			};
		}
	},
});
