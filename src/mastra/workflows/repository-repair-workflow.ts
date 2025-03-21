import { Step, Workflow } from "@mastra/core/workflows";
import path from "path";
import { z } from "zod";

import {
	createRepositoryRepairAgent,
	repairOutputSchema,
} from "../agents/repository-repair-agent.js";

// Define the validation result type
interface ValidationResult {
	repository: string;
	buildStatus: "success" | "failure";
	containerStatus: "success" | "failure";
	errors: string[];
	logs: string;
}

// Step 1: Analyze validation results
const analyzeValidationStep = new Step({
	id: "analyze",
	description: "Analyzes validation results to find failing repositories",
	outputSchema: z.object({
		success: z.boolean(),
		message: z.string(),
		failedRepositories: z.array(z.any()).optional(),
	}),
	execute: async ({ context }) => {
		console.log("Analyzing validation results...");
		const { validationResults } = context.triggerData;

		// Filter repositories that failed validation
		const failedRepos = validationResults.filter(
			(result: ValidationResult) =>
				result.buildStatus === "failure" || result.containerStatus === "failure"
		);

		if (failedRepos.length === 0) {
			return {
				success: true,
				message: "No failed repositories to repair.",
				failedRepositories: [],
			};
		}

		return {
			success: true,
			failedRepositories: failedRepos,
			message: `Found ${failedRepos.length} repositories that need repair.`,
		};
	},
});

// Step 2: Repair failed repositories
const repairRepositoriesStep = new Step({
	id: "repair",
	description: "Attempts to repair failing repositories",
	outputSchema: z.object({
		success: z.boolean(),
		message: z.string(),
		repairResults: z.array(z.any()).optional(),
	}),
	execute: async ({ context }) => {
		// Get failed repositories from previous step
		const analyzeStepResult = context.getStepResult(analyzeValidationStep);
		if (
			!analyzeStepResult?.success ||
			!analyzeStepResult?.failedRepositories ||
			analyzeStepResult.failedRepositories.length === 0
		) {
			return {
				success: true,
				message: "No repositories to repair.",
				repairResults: [],
			};
		}

		const failedRepositories = analyzeStepResult.failedRepositories;

		// Create the repair agent once for all repairs
		console.log("Creating Repository Repair Agent...");
		const repairAgent = await createRepositoryRepairAgent();

		// Process each failed repository
		const repairResults = await Promise.all(
			failedRepositories.map(async repo => {
				const repoPath = path.join(
					process.cwd(),
					"repos",
					repo.repository.replace("/", "-")
				);

				console.log(`Repairing repository: ${repo.repository} at ${repoPath}`);

				try {
					// Generate the prompt for the repair agent
					const prompt = `
I need your help fixing a Docker build failure in a repository.

Repository: ${repo.repository}
Build Status: ${repo.buildStatus}
Container Status: ${repo.containerStatus}

The repository is located at: ${repoPath}

Error Summary:
${repo.errors.join("\n")}

Build Logs:
${repo.logs}

Please analyze these errors and fix the issues in the repository. Start by exploring the
repository structure, identifying Dockerfiles, and understanding the build process.
Then diagnose the problems and apply appropriate fixes.

Return a structured output with your analysis, list of fixes made, and whether you were successful.
`;

					// Run the agent with structured output
					console.log(`\n=== REPAIR AGENT STARTING FOR ${repo.repository} ===\n`);
					const response = await repairAgent.generate(prompt, {
						output: repairOutputSchema,
					});

					console.log(`\n=== REPAIR AGENT COMPLETED FOR ${repo.repository} ===\n`);

					// Get the structured result
					const result = response.object;

					return {
						repository: repo.repository,
						repaired: result.success && result.fixes.length > 0,
						fixes: result.fixes,
						analysis: result.analysis,
						success: result.success,
					};
				} catch (error) {
					console.error(`Error repairing ${repo.repository}:`, error);
					return {
						repository: repo.repository,
						repaired: false,
						fixes: [],
						analysis: `Failed to repair: ${error instanceof Error ? error.message : String(error)}`,
						success: false,
					};
				}
			})
		);

		const successCount = repairResults.filter(r => r.repaired).length;

		return {
			success: true,
			repairResults,
			message: `Repaired ${successCount} out of ${repairResults.length} repositories.`,
		};
	},
});

// Step 3: Generate summary report
const generateReportStep = new Step({
	id: "report",
	description: "Generates a report of the repair results",
	outputSchema: z.object({
		success: z.boolean(),
		report: z.object({
			summary: z.string(),
			details: z.array(z.any()),
		}),
	}),
	execute: async ({ context }) => {
		// Get repair results from previous step
		const repairStepResult = context.getStepResult(repairRepositoriesStep);
		if (
			!repairStepResult?.success ||
			!repairStepResult?.repairResults ||
			repairStepResult.repairResults.length === 0
		) {
			return {
				success: true,
				report: {
					summary: "No repositories were repaired.",
					details: [],
				},
			};
		}

		const repairResults = repairStepResult.repairResults;

		// Generate detailed report
		const reportDetails = repairResults.map(result => ({
			repository: result.repository,
			status: result.repaired ? "REPAIRED" : "FAILED",
			fixes: result.fixes,
			details: result.analysis,
		}));

		const successCount = repairResults.filter(r => r.repaired).length;

		return {
			success: true,
			report: {
				summary: `Repaired ${successCount} out of ${repairResults.length} repositories.`,
				details: reportDetails,
			},
		};
	},
});

// Create the workflow
export const repositoryRepairWorkflow = new Workflow({
	name: "repository-repair",
	triggerSchema: z.object({
		validationResults: z
			.array(
				z.object({
					repository: z.string().describe("Repository name (owner/repo)"),
					buildStatus: z.enum(["success", "failure"]),
					containerStatus: z.enum(["success", "failure"]),
					errors: z.array(z.string()),
					logs: z.string(),
				})
			)
			.describe("Results from the repository validation process"),
	}),
});

// Build workflow with sequential steps
repositoryRepairWorkflow
	.step(analyzeValidationStep)
	.then(repairRepositoriesStep)
	.then(generateReportStep)
	.commit();
