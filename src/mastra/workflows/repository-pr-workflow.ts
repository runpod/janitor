import { Step, Workflow } from "@mastra/core/workflows";
import { z } from "zod";

import { createRepositoryPR } from "../agents/repository-pr-agent.js";

// Define schema for workflow input
const triggerSchema = z.object({
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
});

// Step 1: Create a Pull Request
const createPRStep = new Step({
	id: "createPR",
	description: "Creates or updates a pull request for a fixed repository",
	outputSchema: z.object({
		prCreated: z.boolean(),
		prNumber: z.number().optional(),
		pullRequestUrl: z.string().optional(),
		prExists: z.boolean().optional(),
		message: z.string(),
	}),
	execute: async ({ context }) => {
		const { repositoryPath, repository, fixes, originalErrors, revalidationResult } =
			context.triggerData;

		console.log(`Creating PR for repository: ${repository} using GitHub MCP server`);

		// Use the MCP-powered PR creation function
		const result = await createRepositoryPR(
			repositoryPath,
			repository,
			fixes,
			originalErrors,
			revalidationResult
		);

		if (!result.success) {
			throw new Error(`Failed to create PR: ${result.message}`);
		}

		return {
			prCreated: result.success,
			prNumber: result.prNumber,
			pullRequestUrl: result.pullRequestUrl,
			prExists: result.prExists,
			message: result.message,
		};
	},
});

// Step 2: Generate a Report
const generateReportStep = new Step({
	id: "generateReport",
	description: "Generates a report about the PR creation/update",
	outputSchema: z.object({
		report: z.object({
			success: z.boolean(),
			prNumber: z.number().optional(),
			pullRequestUrl: z.string().optional(),
			isUpdate: z.boolean().optional(),
			message: z.string(),
			timestamp: z.string(),
			summary: z.string(),
		}),
	}),
	execute: async ({ context }) => {
		// Access the createPR step result through context.getStepResult
		const createPRResult = context.getStepResult(createPRStep);

		if (!createPRResult) {
			throw new Error("PR creation step did not complete");
		}

		const { prCreated, prNumber, pullRequestUrl, prExists, message } = createPRResult;

		// Generate the report
		const report = {
			success: prCreated,
			prNumber,
			pullRequestUrl,
			isUpdate: prExists,
			message,
			timestamp: new Date().toISOString(),
			summary: prExists
				? `Updated existing PR #${prNumber}`
				: `Created new PR #${prNumber}: ${pullRequestUrl}`,
		};

		return { report };
	},
});

// Create the workflow
export const repositoryPRWorkflow = new Workflow({
	name: "Repository PR Workflow",
	triggerSchema,
});

// Build workflow with sequential steps
repositoryPRWorkflow.step(createPRStep).then(generateReportStep).commit();
