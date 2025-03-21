import { Step, Workflow } from "@mastra/core/workflows";
import { exec } from "child_process";
import * as dotenv from "dotenv";
import * as fs from "fs/promises";
import * as path from "path";
import { promisify } from "util";
import { z } from "zod";

// Promisify exec
const execAsync = promisify(exec);

// Load environment variables
dotenv.config({ path: ".env.development" });

// Define schemas
const repositorySchema = z.object({
	name: z.string().describe("The name of the repository"),
	url: z.string().optional().describe("The URL of the repository"),
});

const checkoutResultSchema = z.object({
	success: z.boolean(),
	path: z.string().optional(),
	error: z.string().optional(),
	output: z.string().optional(),
});

const dockerfileValidationSchema = z.object({
	success: z.boolean(),
	path: z.string().optional(),
	content: z.string().optional(),
	error: z.string().optional(),
});

const buildResultSchema = z.object({
	success: z.boolean(),
	imageId: z.string().optional(),
	logs: z.string().optional(),
	error: z.string().optional(),
});

const containerTestSchema = z.object({
	success: z.boolean(),
	containerId: z.string().optional(),
	logs: z.string().optional(),
	error: z.string().optional(),
});

const reportSchema = z.object({
	success: z.boolean(),
	repository: z.string(),
	steps: z.record(
		z.string(),
		z.object({
			success: z.boolean(),
			error: z.string().optional(),
			details: z.record(z.string(), z.any()).optional(),
		})
	),
	summary: z.string(),
});

// Step 1: Repository Checkout
const repositoryCheckout = new Step({
	id: "repository-checkout",
	description: "Checks out or updates a Git repository",
	inputSchema: repositorySchema,
	outputSchema: checkoutResultSchema,
	execute: async ({ context, mastra }) => {
		try {
			const repo = context?.triggerData;
			if (!repo) {
				throw new Error("Repository information not provided");
			}

			console.log(`Checking out repository: ${repo.name}`);

			const { checkoutGitRepository } = await import("../tools/git-tools");
			const result = await checkoutGitRepository(repo.name);

			if (!result.success) {
				throw new Error(result.error || "Failed to checkout repository");
			}

			return {
				success: true,
				path: result.path,
				output: result.output,
			};
		} catch (error) {
			console.error(
				`Error checking out repository: ${error instanceof Error ? error.message : String(error)}`
			);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	},
});

// Step 2: Dockerfile Validation
const dockerfileValidation = new Step({
	id: "dockerfile-validation",
	description: "Validates the Dockerfile in the repository",
	inputSchema: checkoutResultSchema,
	outputSchema: dockerfileValidationSchema,
	execute: async ({ context }) => {
		try {
			const checkoutResult = context?.triggerData;
			if (!checkoutResult || !checkoutResult.success || !checkoutResult.path) {
				throw new Error("Repository checkout failed or path not available");
			}

			const repoPath = checkoutResult.path;
			console.log(`Looking for Dockerfile in ${repoPath}`);

			// Find Dockerfile in the repository
			// First, check for a Dockerfile in the root directory
			let dockerfilePath = path.join(repoPath, "Dockerfile");
			try {
				await fs.access(dockerfilePath);
				console.log(`Found Dockerfile at ${dockerfilePath}`);
			} catch (error) {
				// Try to find a Dockerfile in subdirectories
				console.log("Dockerfile not found in root directory, searching subdirectories...");

				// Basic find operation
				const { stdout } = await execAsync(`find ${repoPath} -name "Dockerfile" -type f`);
				const dockerfilePaths = stdout.trim().split("\n").filter(Boolean);

				if (dockerfilePaths.length === 0) {
					throw new Error("No Dockerfile found in the repository");
				}

				dockerfilePath = dockerfilePaths[0];
				console.log(`Found Dockerfile at ${dockerfilePath}`);
			}

			// Read the Dockerfile content
			const dockerfileContent = await fs.readFile(dockerfilePath, "utf-8");

			// Simple validation: check if it has a FROM statement
			if (!dockerfileContent.includes("FROM ")) {
				throw new Error("Invalid Dockerfile: missing FROM statement");
			}

			return {
				success: true,
				path: dockerfilePath,
				content: dockerfileContent,
			};
		} catch (error) {
			console.error(
				`Error validating Dockerfile: ${error instanceof Error ? error.message : String(error)}`
			);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	},
});

// Step 3: Docker Build
const dockerBuild = new Step({
	id: "docker-build",
	description: "Builds Docker image from Dockerfile",
	inputSchema: dockerfileValidationSchema,
	outputSchema: buildResultSchema,
	execute: async ({ context }) => {
		try {
			const validationResult = context?.triggerData;

			if (!validationResult || !validationResult.success || !validationResult.path) {
				throw new Error("Dockerfile validation failed or path not available");
			}

			const dockerfilePath = validationResult.path;

			// Extract repository name from the path for image tagging
			const repoPath = path.dirname(path.dirname(dockerfilePath));
			const repoName = path.basename(repoPath);
			const imageTag = `runpod-validator/${repoName.toLowerCase()}:latest`;

			// Set platform
			const platform = process.env.DOCKER_PLATFORM || "linux/amd64";

			console.log(`Building Docker image from ${dockerfilePath}`);
			console.log(`Image tag: ${imageTag}`);
			console.log(`Platform: ${platform}`);

			// Import and use the buildDockerImage function directly
			const { buildDockerImage } = await import("../tools/docker-tools.js");

			// Build the Docker image
			const buildResult = await buildDockerImage(dockerfilePath, imageTag, platform);

			if (!buildResult.success) {
				throw new Error(buildResult.error || "Failed to build Docker image");
			}

			console.log(`Docker build completed for ${imageTag}`);

			return {
				success: true,
				imageId: buildResult.imageName,
				logs: buildResult.output,
			};
		} catch (error) {
			console.error(
				`Error building Docker image: ${error instanceof Error ? error.message : String(error)}`
			);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	},
});

// Step 4: Container Testing
const containerTesting = new Step({
	id: "container-testing",
	description: "Tests if the Docker container runs properly",
	inputSchema: buildResultSchema,
	outputSchema: containerTestSchema,
	execute: async ({ context }) => {
		try {
			const buildResult = context?.triggerData;

			if (!buildResult || !buildResult.success || !buildResult.imageId) {
				throw new Error("Docker build failed or image ID not available");
			}

			console.log(`Testing container for image: ${buildResult.imageId}`);

			// Create a unique container name
			const containerName = `test-${Date.now()}`;

			console.log(`Starting container ${containerName} from image ${buildResult.imageId}`);

			// Import the docker tools
			const { runDockerContainer, cleanupContainer } = await import(
				"../tools/docker-tools.js"
			);

			// Run the container
			const runResult = await runDockerContainer(buildResult.imageId, containerName);

			if (!runResult.success || !runResult.containerId) {
				throw new Error(runResult.error || "Container test failed");
			}

			console.log(`Container started with ID: ${runResult.containerId}`);

			// Wait for a short time to let the container initialize
			console.log(`Waiting for 60 seconds to test container...`);
			await new Promise(resolve => setTimeout(resolve, 60000));

			// Get container logs
			const { execSync } = require("child_process");
			let logs = "";

			try {
				logs = execSync(`docker logs ${runResult.containerId}`, {
					encoding: "utf8",
				});
			} catch (error) {
				console.warn(
					`Warning: Failed to get container logs: ${error instanceof Error ? error.message : String(error)}`
				);
			}

			// Clean up the container
			console.log(`Cleaning up container ${runResult.containerId}`);
			await cleanupContainer(runResult.containerId);

			console.log(`Container test completed for ${containerName}`);

			return {
				success: true,
				containerId: runResult.containerId,
				logs: logs,
			};
		} catch (error) {
			console.error(
				`Error testing container: ${error instanceof Error ? error.message : String(error)}`
			);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	},
});

// Step 5: Report Generation
const reportGeneration = new Step({
	id: "report-generation",
	description: "Generates a report of the build and test process",
	inputSchema: z.object({}),
	outputSchema: reportSchema,
	execute: async ({ context }) => {
		try {
			// Get results from all previous steps
			const checkoutResult = context.getStepResult("repository-checkout");
			const validationResult = context.getStepResult("dockerfile-validation");
			const buildResult = context.getStepResult("docker-build");
			const testResult = context.getStepResult("container-testing");

			if (!checkoutResult) {
				throw new Error("Repository checkout result not available");
			}

			// Extract repository name
			const repoName = checkoutResult.path
				? path.basename(checkoutResult.path)
				: context.triggerData?.name || "unknown-repository";

			// Create report
			const report = {
				success:
					checkoutResult.success === true &&
					validationResult?.success === true &&
					buildResult?.success === true &&
					testResult?.success === true,
				repository: repoName,
				steps: {
					checkout: {
						success: checkoutResult.success === true,
						error: checkoutResult.error,
						details: {
							path: checkoutResult.path,
						},
					},
					validation: {
						success: validationResult?.success === true,
						error: validationResult?.error,
						details: {
							path: validationResult?.path,
						},
					},
					build: {
						success: buildResult?.success === true,
						error: buildResult?.error,
						details: {
							imageId: buildResult?.imageId,
						},
					},
					test: {
						success: testResult?.success === true,
						error: testResult?.error,
						details: {
							containerId: testResult?.containerId,
						},
					},
				},
				summary: "",
			};

			// Generate summary without using LLM
			const logs = [
				`Checkout: ${checkoutResult.success ? "SUCCESS" : "FAILED"}${checkoutResult.error ? ` - ${checkoutResult.error}` : ""}`,
				`Validation: ${validationResult?.success ? "SUCCESS" : "FAILED"}${validationResult?.error ? ` - ${validationResult?.error}` : ""}`,
				`Build: ${buildResult?.success ? "SUCCESS" : "FAILED"}${buildResult?.error ? ` - ${buildResult?.error}` : ""}`,
				`Test: ${testResult?.success ? "SUCCESS" : "FAILED"}${testResult?.error ? ` - ${testResult?.error}` : ""}`,
			].join("\n");

			// Create a summary manually
			report.summary = `Docker build validation for repository '${repoName}': ${report.success ? "SUCCESS" : "FAILED"}.
${logs}

${
	report.success
		? "All validation steps completed successfully. The Docker container can be built and run correctly."
		: "Some validation steps failed. Please check the details for specific errors that need to be addressed."
}`;

			console.log(`Report generated for ${repoName}`);
			console.log(JSON.stringify(report, null, 2));

			return report;
		} catch (error) {
			console.error(
				`Error generating report: ${error instanceof Error ? error.message : String(error)}`
			);
			return {
				success: false,
				repository: context.triggerData?.name || "unknown-repository",
				steps: {},
				summary: `Error generating report: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	},
});

// Define the workflow
export const repositoryValidatorWorkflow = new Workflow({
	name: "repository-build-validator", // This must match the name in the Mastra configuration
	triggerSchema: repositorySchema,
});

// Add steps to the workflow
repositoryValidatorWorkflow
	.step(repositoryCheckout)
	.then(dockerfileValidation)
	.then(dockerBuild)
	.then(containerTesting)
	.then(reportGeneration);

// Commit the workflow to finalize its structure
repositoryValidatorWorkflow.commit();
