import { createStep, createWorkflow } from "@mastra/core/workflows";
import path from "path";
import { z } from "zod";

// Import our Docker and Git tools functions
import {
	buildDockerImage,
	cleanupContainer,
	findDockerfiles,
	getContainerLogs,
	isCudaDockerfile,
	runDockerContainer,
} from "../tools/docker-tools.js";

const retryConfig = {
	attempts: 1,
};

// Step 1: Find Dockerfile and build Docker image
const dockerBuildStep = createStep({
	id: "build",
	description: "Finds Dockerfile and builds Docker image",
	inputSchema: z.object({
		repositoryPath: z.string(),
		imageName: z.string().optional(),
		platform: z.string().optional(),
		ports: z.array(z.string()).optional(),
		envVars: z.record(z.string()).optional(),
		command: z.string().optional(),
	}),
	outputSchema: z.object({
		success: z.boolean(),
		imageName: z.string().optional(),
		dockerfilePath: z.string().optional(),
		error: z.string().optional(),
		ports: z.array(z.string()).optional(),
		envVars: z.record(z.string()).optional(),
		command: z.string().optional(),
	}),
	execute: async ({ inputData }) => {
		console.log("\n----------------------------------------------------------------");
		console.log("📊  DOCKER VALIDATION: Step 1: find Dockerfile & build image");
		console.log("----------------------------------------------------------------\n");

		// Get the repository path from the input data
		const repoPath = inputData.repositoryPath;
		if (!repoPath) {
			return {
				success: false,
				error: "Repository path not provided",
				ports: inputData.ports,
				envVars: inputData.envVars,
				command: inputData.command,
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
					ports: inputData.ports,
					envVars: inputData.envVars,
					command: inputData.command,
				};
			}

			// Use the first Dockerfile found
			const dockerfilePath = findResult.dockerfiles[0];
			console.log(`Found Dockerfile: ${dockerfilePath}`);

			// Generate image name based on repo name if not provided
			const repoName = path.basename(repoPath);
			const defaultImageName = `${repoName.toLowerCase()}-${Date.now()}`;
			const imageName = inputData.imageName || defaultImageName;

			// Use default platform if not provided (with auto-detection for local development)
			let platform = inputData.platform;
			if (!platform) {
				// Auto-detect platform for local development on Apple Silicon
				const arch = process.arch;
				if (arch === "arm64") {
					platform = "linux/arm64";
					console.log(`🍎 Auto-detected Apple Silicon - using platform: ${platform}`);
				} else {
					platform = "linux/amd64";
					console.log(`🖥️  Auto-detected Intel/AMD - using platform: ${platform}`);
				}
			}

			// Build the Docker image
			const buildResult = await buildDockerImage(dockerfilePath, imageName, platform);

			if (!buildResult.success) {
				return {
					success: false,
					error: buildResult.error || "Failed to build Docker image",
					ports: inputData.ports,
					envVars: inputData.envVars,
					command: inputData.command,
				};
			}

			return {
				success: true,
				imageName: buildResult.imageName,
				dockerfilePath,
				ports: inputData.ports,
				envVars: inputData.envVars,
				command: inputData.command,
			};
		} catch (error) {
			console.error(
				`Error building Docker image: ${error instanceof Error ? error.message : String(error)}`
			);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				ports: inputData.ports,
				envVars: inputData.envVars,
				command: inputData.command,
			};
		}
	},
});

// Step 2: Run Docker container
const dockerRunStep = createStep({
	id: "run",
	description: "Runs a Docker container from the built image",
	inputSchema: z.object({
		success: z.boolean(),
		imageName: z.string().optional(),
		dockerfilePath: z.string().optional(),
		error: z.string().optional(),
		ports: z.array(z.string()).optional(),
		envVars: z.record(z.string()).optional(),
		command: z.string().optional(),
	}),
	outputSchema: z.object({
		success: z.boolean(),
		containerId: z.string().optional(),
		error: z.string().optional(),
		skipped: z.boolean().optional(),
		skipReason: z.string().optional(),
	}),
	execute: async ({ inputData }) => {
		// Check if the previous step was successful
		if (!inputData.success || !inputData.imageName) {
			return {
				success: false,
				error: "Docker build failed or image name not available",
			};
		}

		console.log("\n----------------------------------------------------------------");
		console.log("📊  DOCKER VALIDATION: Step 2: run container");
		console.log("----------------------------------------------------------------\n");

		const imageName = inputData.imageName;
		const dockerfilePath = inputData.dockerfilePath;

		console.log(`Running container from image: ${imageName}`);

		// Check if this is a CUDA-based image
		const isCuda = dockerfilePath ? isCudaDockerfile(dockerfilePath) : false;
		console.log(`CUDA detection: ${isCuda ? "CUDA-based image detected" : "Non-CUDA image"}`);

		// Check GPU availability (simplified check here - the actual check happens in runDockerContainer)
		let hasGpu = false;
		try {
			const { spawn } = require("child_process");
			await new Promise<number>(resolve => {
				const proc = spawn("nvidia-smi", [], { stdio: "ignore" });
				proc.on("close", (code: number) => {
					hasGpu = code === 0;
					resolve(code);
				});
				proc.on("error", () => {
					hasGpu = false;
					resolve(1);
				});
			});
		} catch (error) {
			hasGpu = false;
		}

		console.log(`GPU availability: ${hasGpu ? "available" : "not available"}`);

		// If CUDA image but no GPU available, skip container validation
		if (isCuda && !hasGpu) {
			console.log("⚠️  CUDA image detected but no GPU available");
			console.log("🚫 Skipping container validation (build-only validation)");
			console.log("ℹ️  Note: Full validation requires GPU-enabled instance");

			return {
				success: true,
				skipped: true,
				skipReason:
					"CUDA image requires GPU for validation, but no GPU detected. Image build was successful.",
			};
		}

		try {
			// Generate a container name based on image name
			const containerName = `${imageName.replace(/[^a-zA-Z0-9_.-]/g, "-")}-container-${Date.now()}`;

			// Run the Docker container
			const runResult = await runDockerContainer(
				imageName,
				containerName,
				inputData.ports,
				inputData.envVars,
				inputData.command
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
const dockerLogsStep = createStep({
	id: "logs",
	description: "Checks logs from the Docker container",
	inputSchema: z.object({
		success: z.boolean(),
		containerId: z.string().optional(),
		error: z.string().optional(),
		skipped: z.boolean().optional(),
		skipReason: z.string().optional(),
	}),
	outputSchema: z.object({
		success: z.boolean(),
		logs: z.string().optional(),
		lineCount: z.number().optional(),
		error: z.string().optional(),
		skipped: z.boolean().optional(),
		skipReason: z.string().optional(),
	}),
	execute: async ({ inputData }) => {
		// Check if the previous step was skipped
		if (inputData.skipped) {
			console.log("\n----------------------------------------------------------------");
			console.log("📊  DOCKER VALIDATION: Step 3: check container logs");
			console.log("----------------------------------------------------------------\n");
			console.log("⚠️  Container run was skipped, skipping log collection");
			console.log(`📝 Reason: ${inputData.skipReason}`);

			return {
				success: true,
				skipped: true,
				skipReason: inputData.skipReason,
				logs: "Container run skipped - no logs available",
				lineCount: 0,
			};
		}

		// Check if the previous step was successful
		if (!inputData.success || !inputData.containerId) {
			return {
				success: false,
				error: "Docker run failed or container ID not available",
			};
		}

		console.log("\n----------------------------------------------------------------");
		console.log("📊  DOCKER VALIDATION: Step 3: check container logs");
		console.log("----------------------------------------------------------------\n");

		const containerId = inputData.containerId;
		const waitTime = 3000; // Wait 3 seconds for container to run and generate logs
		const tail = 100;

		console.log(`Waiting ${waitTime}ms before checking logs for container: ${containerId}`);

		try {
			// Wait for container to start and generate some logs
			await new Promise(resolve => setTimeout(resolve, waitTime));

			// Get container logs
			const logsResult = await getContainerLogs(containerId, tail, "5s");

			let logs = "";
			let lineCount = 0;
			let logsError = null;

			if (!logsResult.success) {
				console.warn(`⚠️  Failed to retrieve container logs: ${logsResult.error}`);
				logsError = logsResult.error || "Failed to retrieve container logs";
				logs = "Failed to retrieve logs";
			} else {
				logs = logsResult.logs || "";
				lineCount = logs.split("\n").filter(line => line.trim() !== "").length;
				console.log(`📝 Retrieved ${lineCount} lines of container logs`);
			}

			// IMPORTANT: Always cleanup the container after getting logs
			console.log(`🧹 Cleaning up container: ${containerId}`);
			try {
				const cleanupResult = await cleanupContainer(containerId);

				if (cleanupResult.success) {
					console.log(`✅ Container ${containerId} cleaned up successfully`);
				} else {
					console.warn(`⚠️  Container cleanup warning: ${cleanupResult.error}`);
				}
			} catch (cleanupError) {
				console.warn(
					`⚠️  Container cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`
				);
				// Don't fail the whole step just because cleanup failed
			}

			// Return logs result (success if we got logs, even if cleanup had issues)
			if (logsError) {
				return {
					success: false,
					error: logsError,
				};
			}

			return {
				success: true,
				logs,
				lineCount,
			};
		} catch (error) {
			console.error(
				`Error retrieving container logs: ${error instanceof Error ? error.message : String(error)}`
			);

			// Try to cleanup even if logs failed
			try {
				console.log(`🧹 Attempting cleanup after error for container: ${containerId}`);
				await cleanupContainer(containerId);
			} catch (cleanupError) {
				console.warn(`⚠️  Cleanup after error failed: ${cleanupError}`);
			}

			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	},
});

// Step 4: Generate a report of the validation results
const generateReportStep = createStep({
	id: "report",
	description: "Generates a report of the Docker validation results",
	inputSchema: z.object({
		success: z.boolean(),
		logs: z.string().optional(),
		lineCount: z.number().optional(),
		error: z.string().optional(),
		skipped: z.boolean().optional(),
		skipReason: z.string().optional(),
	}),
	outputSchema: z.object({
		success: z.boolean(),
		report: z.string(),
	}),
	execute: async ({ inputData, getStepResult, getInitData }) => {
		console.log("\n----------------------------------------------------------------");
		console.log(
			"📊  DOCKER VALIDATION: Step 4: generate report to determine validation success"
		);
		console.log("----------------------------------------------------------------\n");

		// Get initial workflow data
		const initData = getInitData();
		const repoPath = initData.repositoryPath;
		const repoName = path.basename(repoPath);

		// Get results from previous steps
		const buildResult = getStepResult(dockerBuildStep);
		const runResult = getStepResult(dockerRunStep);
		const logsResult = inputData;

		const dockerfilePath = buildResult?.dockerfilePath;
		const imageName = buildResult?.imageName;
		const containerId = runResult?.containerId;
		const wasSkipped = runResult?.skipped || logsResult?.skipped;
		const skipReason = runResult?.skipReason || logsResult?.skipReason;

		// Collect errors from steps
		const errors: Record<string, string> = {};
		if (buildResult && !buildResult.success && buildResult.error) {
			errors.build = buildResult.error.split("\n").slice(-8).join("\n");
		}
		if (runResult && !runResult.success && runResult.error) {
			errors.run = runResult.error.split("\n").slice(-8).join("\n");
		}
		if (logsResult && !logsResult.success && logsResult.error) {
			errors.logs = logsResult.error.split("\n").slice(-8).join("\n");
		}

		// Determine technical success (all steps completed)
		const hasStepErrors = Object.keys(errors).length > 0;
		let allStepsCompleted = false;

		if (wasSkipped) {
			// If container run was skipped, consider it successful if build worked
			allStepsCompleted = repoPath && dockerfilePath && imageName && buildResult?.success;
		} else {
			// Normal validation path
			allStepsCompleted =
				repoPath &&
				dockerfilePath &&
				imageName &&
				containerId &&
				logsResult &&
				logsResult.success;
		}

		// NEW: Analyze container logs to determine if container ran successfully
		let containerRanSuccessfully = false; // Start with false, require positive proof of success
		const logAnalysisErrors: string[] = [];

		if (!wasSkipped && logsResult?.logs) {
			const logs = logsResult.logs;
			console.log(`🔍 Analyzing container logs for success indicators...`);
			console.log(`📝 Container logs (${logs.length} chars):`);
			console.log(`"${logs.substring(0, 500)}"`);

			const logLines = logs.split("\n").filter(line => line.trim() !== "");
			console.log(`📊 Log lines count: ${logLines.length}`);

			// FIRST: Check for clear SUCCESS indicators
			const hasRunPodSuccess =
				logs.includes("completed successfully") ||
				logs.includes("Job result:") ||
				logs.includes("Local testing complete");

			const hasServerSuccess =
				logs.includes("server") ||
				logs.includes("listening") ||
				logs.includes("ready") ||
				logs.includes("Server running");

			const hasGeneralSuccess =
				logs.includes("started") || logs.includes("running") || logLines.length > 8; // More logs usually indicate continued operation

			if (hasRunPodSuccess) {
				containerRanSuccessfully = true;
				console.log(`✅ Found RunPod success indicators`);
			} else if (hasServerSuccess) {
				containerRanSuccessfully = true;
				console.log(`✅ Found server success indicators`);
			} else if (hasGeneralSuccess) {
				containerRanSuccessfully = true;
				console.log(`✅ Found general success indicators`);
			}

			// SECOND: Check for ERROR indicators that override success
			if (logs.includes("ERROR") || logs.includes("FATAL")) {
				containerRanSuccessfully = false;
				logAnalysisErrors.push("Container had ERROR or FATAL messages");
				console.log(`❌ Found ERROR/FATAL indicators in logs`);
			}

			// THIRD: Check for specific failure patterns
			if (logs.includes("WARN") && logs.includes("not found")) {
				containerRanSuccessfully = false;
				logAnalysisErrors.push("Container missing required files or configuration");
				console.log(`❌ Found warning about missing files`);
			}

			// FOURTH: Check for too few logs (likely immediate crash)
			if (logLines.length <= 2) {
				containerRanSuccessfully = false;
				logAnalysisErrors.push("Container produced minimal logs (likely immediate exit)");
				console.log(`❌ Too few log lines (${logLines.length})`);
			}

			// FINAL: If no success indicators found
			if (!containerRanSuccessfully && logAnalysisErrors.length === 0) {
				logAnalysisErrors.push("No clear success indicators found in container logs");
				console.log(`❌ No success indicators found`);
			}

			console.log(
				`📊 Container log analysis: ${containerRanSuccessfully ? "✅ Success" : "❌ Failed"}`
			);
			if (logAnalysisErrors.length > 0) {
				console.log(`⚠️  Log analysis issues: ${logAnalysisErrors.join(", ")}`);
			}
		} else {
			console.log(
				`⚠️  No logs to analyze (wasSkipped: ${wasSkipped}, logs available: ${!!logsResult?.logs})`
			);
		}

		// Overall success requires both technical success AND container running successfully
		const overallSuccess =
			!hasStepErrors && allStepsCompleted && (wasSkipped || containerRanSuccessfully);

		// Generate report
		let report = `# Docker Validation Report
* repository: ${repoName}
* status: ${overallSuccess ? "✅ passed" : "❌ failed"}`;

		if (wasSkipped) {
			report += `
* validation: ⚠️ partial (build-only)
* reason: ${skipReason}`;
		} else if (!containerRanSuccessfully) {
			report += `
* container_status: ❌ failed to run successfully
* issues: ${logAnalysisErrors.join(", ")}`;

			// Include actual container logs for janitor agent to analyze
			if (logsResult?.logs) {
				report += `
* container_logs:
${logsResult.logs}`;
			}
		}

		if (!overallSuccess && hasStepErrors) {
			report += `
* step_errors:
${Object.entries(errors)
	.map(([step, error]) => `  - ${step}: ${error}`)
	.join("\n")}`;
		}

		return {
			success: overallSuccess,
			report,
		};
	},
});

// Create the workflow
export const dockerValidationWorkflow = createWorkflow({
	id: "docker-validation",
	description: "Validates Docker repositories by building and running containers",
	inputSchema: z.object({
		repositoryPath: z.string().describe("Path to the repository on disk (already checked out)"),
		imageName: z.string().optional().describe("Optional custom name for Docker image"),
		platform: z.string().optional().describe("Optional target platform (e.g., 'linux/amd64')"),
		ports: z.array(z.string()).optional().describe("Optional port mappings"),
		envVars: z.record(z.string()).optional().describe("Optional environment variables"),
		command: z.string().optional().describe("Optional command to run in container"),
	}),
	outputSchema: z.object({
		success: z.boolean(),
		report: z.string(),
	}),
	steps: [dockerBuildStep, dockerRunStep, dockerLogsStep, generateReportStep],
})
	.then(dockerBuildStep)
	.then(dockerRunStep)
	.then(dockerLogsStep)
	.then(generateReportStep)
	.commit();
