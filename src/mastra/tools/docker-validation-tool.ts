import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { getMastraInstance } from "../utils/mastra";

// Define input schema for the Docker validation tool
const inputSchema = z.object({
	repoPath: z.string().describe("Path to the local repository that has already been checked out"),
	imageName: z.string().optional().describe("Optional custom name for Docker image"),
	platform: z.string().optional().describe("Optional target platform (e.g., 'linux/amd64')"),
	ports: z.array(z.string()).optional().describe("Optional port mappings"),
	envVars: z.record(z.string()).optional().describe("Optional environment variables"),
	command: z.string().optional().describe("Optional command to run in container"),
});

// Create the Docker validation tool
export const dockerValidationTool = createTool({
	id: "Docker Repository Validator",
	description:
		"Validates a Docker repository by building the image, running a container, and checking logs. Requires that the repository has already been checked out.",
	inputSchema,
	execute: async ({ context }) => {
		console.log("\n----------------------------------------------------------------");
		console.log("----------------------------------------------------------------");
		console.log("🛠️  DOCKER VALIDATION TOOL");
		console.log(`path: ${context.repoPath}`);
		console.log("----------------------------------------------------------------\n");

		try {
			// Extract repository name from the repo path for passing to the workflow
			const repoPath = context.repoPath;

			// Get mastra from our singleton utility
			const mastra = getMastraInstance();

			// Get the workflow from the mastra instance
			const dockerValidationWorkflow = mastra.getWorkflow("dockerValidationWorkflow");
			if (!dockerValidationWorkflow) {
				return {
					success: false,
					repoPath: context.repoPath,
					error: "Docker validation workflow not found",
				};
			}

			// Create a run and execute the workflow
			const { runId, start } = dockerValidationWorkflow.createRun();

			// Start the workflow with the parameters - using the updated schema property names
			const result = await start({
				triggerData: {
					repositoryPath: repoPath, // This matches our updated workflow schema
					imageName: context.imageName,
					platform: context.platform,
					ports: context.ports,
					envVars: context.envVars,
					command: context.command,
				},
			});

			// Get the report directly from the 'report' step
			const reportStepResult = result.results?.report;

			if (reportStepResult?.status === "success" && reportStepResult.output?.report) {
				// Extract success/failure status from the report
				const report = reportStepResult.output.report;
				const isSuccess = report.includes("**Overall Success**: ✅ Passed");

				console.log(report);

				return {
					success: true,
					passed: isSuccess,
					repoPath: context.repoPath,
					report: report,
				};
			}

			// If we couldn't find the report step, log the full results for debugging
			console.error(
				"Couldn't find report step result. Full workflow result:",
				JSON.stringify(result, null, 2)
			);

			return {
				success: false,
				repoPath: context.repoPath,
				error: "Workflow completed but no report was generated",
			};
		} catch (error) {
			console.error(`Error running Docker validation workflow: ${error}`);
			return {
				success: false,
				repoPath: context.repoPath,
				error: `Error running Docker validation workflow: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	},
});
