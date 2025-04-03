import { Step, Workflow } from "@mastra/core/workflows";
import path from "path";
import { z } from "zod";

// Import our Docker and Git tools functions
import {
	buildDockerImage,
	findDockerfiles,
	getContainerLogs,
	runDockerContainer,
} from "../tools/docker-tools";

const retryConfig = {
	attempts: 1,
};

// Step 1: Find Dockerfile and build Docker image
const dockerBuildStep = new Step({
	id: "build",
	description: "Finds Dockerfile and builds Docker image",
	outputSchema: z.object({
		success: z.boolean(),
		imageName: z.string().optional(),
		dockerfilePath: z.string().optional(),
		error: z.string().optional(),
	}),
	retryConfig,
	execute: async ({ context }) => {
		console.log("\n----------------------------------------------------------------");
		console.log("📊  DOCKER VALIDATION: Step 1: find Dockerfile & build image");
		console.log("----------------------------------------------------------------\n");

		// Get the repository path from the trigger data
		const repoPath = context.triggerData.repositoryPath;
		if (!repoPath) {
			return {
				success: false,
				error: "Repository path not provided",
			};
		}

		try {
			// Find Dockerfiles in the repository
			const findResult = await findDockerfiles(repoPath);

			if (
				!findResult.success ||
				!findResult.dockerfiles ||
				findResult.dockerfiles.length === 0
			) {
				return {
					success: false,
					error: findResult.error || "No Dockerfiles found in the repository",
				};
			}

			// Use the first Dockerfile found
			const dockerfilePath = findResult.dockerfiles[0];
			console.log(`Found Dockerfile: ${dockerfilePath}`);

			// Generate image name based on repo name if not provided
			const repoName = path.basename(repoPath);
			const defaultImageName = `${repoName.toLowerCase()}-${Date.now()}`;
			const imageName = context.triggerData.imageName || defaultImageName;

			// Use default platform if not provided
			const platform = context.triggerData.platform || "linux/amd64";

			// Build the Docker image
			const buildResult = await buildDockerImage(dockerfilePath, imageName, platform);

			if (!buildResult.success) {
				return {
					success: false,
					error: buildResult.error || "Failed to build Docker image",
				};
			}

			return {
				success: true,
				imageName: buildResult.imageName,
				dockerfilePath,
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

// Step 2: Run Docker container
const dockerRunStep = new Step({
	id: "run",
	description: "Runs a Docker container from the built image",
	outputSchema: z.object({
		success: z.boolean(),
		containerId: z.string().optional(),
		error: z.string().optional(),
	}),
	retryConfig,
	execute: async ({ context }) => {
		// Get the image name from the previous step
		const buildStepResult = context.getStepResult(dockerBuildStep);
		if (!buildStepResult?.success || !buildStepResult?.imageName) {
			return {
				success: false,
				error: "Docker build failed or image name not available",
			};
		}

		console.log("\n----------------------------------------------------------------");
		console.log("📊  DOCKER VALIDATION: Step 2: run container");
		console.log("----------------------------------------------------------------\n");


		const imageName = buildStepResult.imageName;
		console.log(`Running container from image: ${imageName}`);

		try {
			// Generate a container name based on image name
			const containerName = `${imageName.replace(/[^a-zA-Z0-9_.-]/g, "-")}-container-${Date.now()}`;

			// Run the Docker container
			const runResult = await runDockerContainer(
				imageName,
				containerName,
				context.triggerData.ports,
				context.triggerData.envVars,
				context.triggerData.command
			);

			if (!runResult.success || !runResult.containerId) {
				return {
					success: false,
					error: runResult.error || "Failed to run Docker container",
				};
			}

			return {
				success: true,
				containerId: runResult.containerId,
			};
		} catch (error) {
			console.error(
				`Error running Docker container: ${error instanceof Error ? error.message : String(error)}`
			);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	},
});

// Step 3: Check Docker container logs
const dockerLogsStep = new Step({
	id: "logs",
	description: "Checks logs from the Docker container",
	outputSchema: z.object({
		success: z.boolean(),
		logs: z.string().optional(),
		lineCount: z.number().optional(),
		error: z.string().optional(),
	}),
	retryConfig,
	execute: async ({ context }) => {
		// Get the container ID from the previous step
		const runStepResult = context.getStepResult(dockerRunStep);
		if (!runStepResult?.success || !runStepResult?.containerId) {
			return {
				success: false,
				error: "Docker run failed or container ID not available",
			};
		}

		console.log("\n----------------------------------------------------------------");
		console.log("📊  DOCKER VALIDATION: Step 3: check container logs");
		console.log("----------------------------------------------------------------\n");

		const containerId = runStepResult.containerId;
		const waitTime = 1000; // Shorter wait time for testing
		const tail = 100;

		console.log(`Waiting ${waitTime}ms before checking logs for container: ${containerId}`);

		try {
			// Wait for container to start and generate some logs
			await new Promise(resolve => setTimeout(resolve, waitTime));

			// Get container logs
			const logsResult = await getContainerLogs(containerId, tail, "5s");

			if (!logsResult.success) {
				return {
					success: false,
					error: logsResult.error || "Failed to retrieve container logs",
				};
			}

			const logs = logsResult.logs || "";
			const lineCount = logs.split("\n").filter(line => line.trim() !== "").length;

			// Always succeed if we could retrieve logs, even if they're empty
			return {
				success: true,
				logs,
				lineCount,
			};
		} catch (error) {
			console.error(
				`Error retrieving container logs: ${error instanceof Error ? error.message : String(error)}`
			);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	},
});

// Step 4: Generate a report of the validation results
const generateReportStep = new Step({
	id: "report",
	description: "Generates a report of the Docker validation results",
	outputSchema: z.object({
		success: z.boolean(),
		report: z.string(),
	}),
	retryConfig,
	execute: async ({ context }) => {
		console.log("\n----------------------------------------------------------------");
		console.log("📊  DOCKER VALIDATION: Step 4: generate report to determine validation success");
		console.log("----------------------------------------------------------------\n");

		const repoPath = context.triggerData.repositoryPath;
		const repoName = path.basename(repoPath);
		const buildResult = context.getStepResult(dockerBuildStep);
		const runResult = context.getStepResult(dockerRunStep);
		const logsResult = context.getStepResult(dockerLogsStep);

		const dockerfilePath = buildResult?.dockerfilePath;
		const imageName = buildResult?.imageName;
		const containerId = runResult?.containerId;

		// Collect errors from steps
		const errors: Record<string, string> = {};
		if (buildResult && !buildResult.success && buildResult.error) {
			errors.build = buildResult.error.split('\n').slice(-8).join('\n');
		}
		if (runResult && !runResult.success && runResult.error) {
			errors.run = runResult.error.split('\n').slice(-8).join('\n');
		}
		if (logsResult && !logsResult.success && logsResult.error) {
			errors.logs = logsResult.error.split('\n').slice(-8).join('\n');
		}

		// Determine overall success
		const hasErrors = Object.keys(errors).length > 0;
		const allStepsCompleted =
			repoPath &&
			dockerfilePath &&
			imageName &&
			containerId &&
			logsResult &&
			logsResult.success; // Check logs step success flag, not content
		const overallSuccess = !hasErrors && allStepsCompleted;
		

		// Generate report
		const report = `# Docker Validation Report
* repository:${repoName}
* status: ${overallSuccess ? "✅ passed" : "❌ failed"}

${
	!overallSuccess && hasErrors
		? `* errors:\n${Object.entries(errors)
				.map(([step, error]) => `- ${step}: ${error}`)
				.join("\n")}`
		: ""
}
`;

		return {
			success: true,
			report,
		};
	},
});

// Create the workflow
export const dockerValidationWorkflow = new Workflow({
	name: "docker-validation",
	triggerSchema: z.object({
		repositoryPath: z.string().describe("Path to the repository on disk (already checked out)"),
		imageName: z.string().optional().describe("Optional custom name for Docker image"),
		platform: z.string().optional().describe("Optional target platform (e.g., 'linux/amd64')"),
		ports: z.array(z.string()).optional().describe("Optional port mappings"),
		envVars: z.record(z.string()).optional().describe("Optional environment variables"),
		command: z.string().optional().describe("Optional command to run in container"),
	}),
	retryConfig
});

// Build workflow with sequential steps
dockerValidationWorkflow
	.step(dockerBuildStep)
	.then(dockerRunStep)
	.then(dockerLogsStep)
	.then(generateReportStep)
	.commit();
