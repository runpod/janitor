import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { getMastraInstance } from "../utils/mastra.js";

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
export const docker_validation = createTool({
	id: "docker_validation",
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

			// Create a run and execute the workflow using the new API
			const run = await dockerValidationWorkflow.createRunAsync();

			// Start the workflow with the parameters - using the new input format
			const result = await run.start({
				inputData: {
					repositoryPath: repoPath,
					imageName: context.imageName,
					platform: context.platform,
					ports: context.ports,
					envVars: context.envVars,
					command: context.command,
				},
			});

			// Check if workflow was successful and has the expected result
			if (result.status === "success" && result.result) {
				const report = result.result.report;
				const isSuccess = result.result.success;

				console.log(report);

				return {
					success: true,
					passed: isSuccess,
					repoPath: context.repoPath,
					report: report,
				};
			}

			// Handle workflow failure
			if (result.status === "failed") {
				console.error("Workflow failed:", result.error);
				return {
					success: false,
					repoPath: context.repoPath,
					error: `Workflow failed: ${result.error}`,
				};
			}

			// Handle suspended workflow
			if (result.status === "suspended") {
				console.error("Workflow was suspended unexpectedly");
				return {
					success: false,
					repoPath: context.repoPath,
					error: "Workflow was suspended and requires manual intervention",
				};
			}

			// Fallback for unexpected states
			console.error(
				"Workflow completed with unexpected result:",
				JSON.stringify(result, null, 2)
			);

			return {
				success: false,
				repoPath: context.repoPath,
				error: "Workflow completed but returned unexpected result format",
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
