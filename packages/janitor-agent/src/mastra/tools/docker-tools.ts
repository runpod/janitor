import { createTool } from "@mastra/core/tools";
import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { z } from "zod";

/**
 * Execute a shell command with proper error handling
 */
function safeExecSync(command: string, cwd?: string, timeout = 300000) {
	try {
		const options: any = {
			encoding: "utf8",
			stdio: "pipe",
			shell: true,
			windowsHide: true,
			maxBuffer: 10 * 1024 * 1024, // 10MB buffer
			timeout: timeout, // Default 5 minute timeout for Docker operations
		};

		if (cwd) {
			options.cwd = cwd;
		}

		return {
			success: true,
			output: execSync(command, options).toString(),
		};
	} catch (error: any) {
		const stderr = error.stderr ? error.stderr.toString() : "";
		const stdout = error.stdout ? error.stdout.toString() : "";

		return {
			success: false,
			error,
			errorMessage: error.message,
			stderr,
			stdout,
			status: error.status,
		};
	}
}

/**
 * Execute a command with real-time output streaming
 */
function spawnWithLogs(
	command: string,
	args: string[],
	cwd?: string,
	timeout = 600000
): Promise<{ success: boolean; output: string; error?: string }> {
	return new Promise(resolve => {
		let output = "";
		let errorOutput = "";
		let isTimedOut = false;

		// Determine a context-specific log prefix based on the command and first argument
		let logPrefix = "[Docker]";
		if (command === "docker" && args.length > 0) {
			switch (args[0]) {
				case "build":
					logPrefix = "[Docker Build]";
					break;
				case "run":
					logPrefix = "[Docker Run]";
					break;
				case "logs":
					logPrefix = "[Docker Logs]";
					break;
				case "stop":
				case "rm":
					logPrefix = "[Docker Cleanup]";
					break;
				default:
					logPrefix = `[Docker ${args[0]}]`;
			}
		}

		console.log(`Executing command: ${command} ${args.join(" ")}`);

		const childProcess = spawn(command, args, {
			cwd,
			stdio: "pipe",
		});

		// Stream stdout in real-time
		childProcess.stdout.on("data", data => {
			const text = data.toString();
			output += text;
			console.log(`${logPrefix} ${text.trim()}`);
		});

		// Stream stderr in real-time
		childProcess.stderr.on("data", data => {
			const text = data.toString();
			// In Docker, build progress often goes to stderr
			errorOutput += text;
			console.log(`${logPrefix} ${text.trim()}`);
		});

		// Set timeout
		const timeoutId = setTimeout(() => {
			isTimedOut = true;
			console.error(`Command execution timed out after ${timeout / 1000} seconds`);
			childProcess.kill();
			resolve({
				success: false,
				output,
				error: `Command execution timed out after ${timeout / 1000} seconds`,
			});
		}, timeout);

		// Handle process completion
		childProcess.on("close", code => {
			clearTimeout(timeoutId);

			if (isTimedOut) return; // Already handled by timeout

			if (code === 0) {
				resolve({
					success: true,
					output: output + errorOutput, // Docker build info is often in stderr
				});
			} else {
				console.error(`Command failed with exit code ${code}`);
				resolve({
					success: false,
					output: output,
					error: errorOutput || `Command failed with exit code ${code}`,
				});
			}
		});

		// Handle process errors
		childProcess.on("error", error => {
			clearTimeout(timeoutId);
			console.error(`Process error: ${error.message}`);
			resolve({
				success: false,
				output,
				error: error.message,
			});
		});
	});
}

/**
 * Finds Dockerfiles in a repository directory
 */
export const findDockerfiles = async (
	repoPath: string
): Promise<{
	success: boolean;
	dockerfiles?: string[];
	error?: string;
}> => {
	try {
		console.log(`Finding Dockerfile in repository at: ${repoPath}`);

		if (!fs.existsSync(repoPath)) {
			throw new Error(`Repository path does not exist: ${repoPath}`);
		}

		// Check if we're on Windows
		const isWindows = process.platform === "win32";
		let dockerfiles: string[] = [];

		if (isWindows) {
			// Use manual recursive directory scan on Windows
			dockerfiles = findDockerfilesRecursive(repoPath);
		} else {
			// Try find command on Unix-like systems
			const findResult = safeExecSync(`find . -name "Dockerfile*" -type f`, repoPath);

			if (!findResult.success) {
				console.warn(`Find command failed: ${findResult.errorMessage}`);
				console.log("Falling back to manual directory scan");
				dockerfiles = findDockerfilesRecursive(repoPath);
			} else {
				// Parse results from find command
				dockerfiles = findResult.output
					? findResult.output
							.split("\n")
							.filter(line => line.trim() !== "")
							.map(relativePath =>
								path.join(repoPath, relativePath.replace("./", ""))
							)
					: [];
			}
		}

		console.log(`Found ${dockerfiles.length} Dockerfile(s):`);
		dockerfiles.forEach(file => console.log(` - ${file}`));

		return {
			success: true,
			dockerfiles,
		};
	} catch (error: any) {
		console.error(`Error finding Dockerfiles: ${error.message}`);
		return {
			success: false,
			error: error.message,
		};
	}
};

/**
 * Helper function to recursively find Dockerfiles in a directory
 */
function findDockerfilesRecursive(directory: string): string[] {
	const foundFiles: string[] = [];

	const scanDir = (dir: string): void => {
		try {
			const items = fs.readdirSync(dir);
			for (const item of items) {
				const itemPath = path.join(dir, item);
				try {
					const stats = fs.statSync(itemPath);

					if (stats.isDirectory()) {
						scanDir(itemPath);
					} else if (item === "Dockerfile" || item.startsWith("Dockerfile.")) {
						foundFiles.push(itemPath);
					}
				} catch (statError: any) {
					console.warn(`Unable to stat ${itemPath}: ${statError.message}`);
				}
			}
		} catch (readError: any) {
			console.warn(`Unable to read directory ${dir}: ${readError.message}`);
		}
	};

	scanDir(directory);
	return foundFiles;
}

/**
 * Builds a Docker image from a Dockerfile with real-time logging
 */
export const buildDockerImage = async (
	dockerfilePath: string,
	imageName: string,
	platform: string = "linux/amd64"
): Promise<{
	success: boolean;
	imageName?: string;
	error?: string;
	output?: string;
}> => {
	try {
		console.log(`Building Docker image from: ${dockerfilePath}`);

		if (!fs.existsSync(dockerfilePath)) {
			throw new Error(`Dockerfile does not exist at path: ${dockerfilePath}`);
		}

		const dockerfileDir = path.dirname(dockerfilePath);
		const dockerfileName = path.basename(dockerfilePath);

		// Docker image name components validation:
		// - Repository/username: may contain lowercase letters, digits, and separators (_, ., -)
		// - Image name: may contain lowercase letters, digits, and separators (_, ., -)
		// - Tag: may contain lowercase and uppercase letters, digits, underscores, periods, and dashes
		// Slashes (/) and colons (:) are used as separators between these components

		// Valid characters for the complete image name (including repo and tag)
		const sanitizedImageName = imageName.replace(/[^a-zA-Z0-9_.-:/]/g, "-");

		// If sanitized name is different from original, log the change
		if (sanitizedImageName !== imageName) {
			console.log(`Original image name "${imageName}" sanitized to "${sanitizedImageName}"`);
		}

		console.log(`Building image with name: ${sanitizedImageName}`);
		console.log(`Building from directory: ${dockerfileDir}`);

		// Split the command into command and args for spawn
		// docker build --platform=linux/amd64 -t name -f Dockerfile .
		const buildArgs = [
			"build",
			`--platform=${platform}`,
			`-t`,
			sanitizedImageName,
			`-f`,
			dockerfileName,
			".",
		];

		const buildResult = await spawnWithLogs(
			"docker",
			buildArgs,
			dockerfileDir,
			1200000 // 20 minutes timeout
		);

		if (!buildResult.success) {
			console.error(`Docker build failed`);
			return {
				success: false,
				error: buildResult.error,
			};
		}

		console.log(`Successfully built Docker image: ${sanitizedImageName}`);

		return {
			success: true,
			imageName: sanitizedImageName,
			output: buildResult.output,
		};
	} catch (error: any) {
		return {
			success: false,
			error: error.message,
		};
	}
};

/**
 * Checks if GPUs are available on the system
 */
const checkGpuAvailability = async (): Promise<boolean> => {
	try {
		// Check if nvidia-smi command exists and works
		const result = await spawnWithLogs("nvidia-smi", [], undefined, 5000);
		return result.success;
	} catch (error) {
		// nvidia-smi not available or failed
		return false;
	}
};

/**
 * Checks if a Dockerfile contains CUDA-related content
 */
export const isCudaDockerfile = (dockerfilePath: string): boolean => {
	try {
		const dockerfileContent = fs.readFileSync(dockerfilePath, "utf8").toLowerCase();

		// Check for common CUDA indicators
		const cudaIndicators = [
			"nvidia/cuda",
			"cuda:",
			"nvidia-cuda",
			"cudnn",
			"nvidia-runtime",
			"cuda-toolkit",
			"nvidia-docker",
			"gpu",
			"nvidia/driver",
		];

		return cudaIndicators.some(indicator => dockerfileContent.includes(indicator));
	} catch (error) {
		console.warn(`Could not read Dockerfile to check for CUDA: ${error}`);
		return false; // Assume non-CUDA if we can't read it
	}
};

/**
 * Runs a Docker container from an image
 */
export const runDockerContainer = async (
	imageName: string,
	containerName?: string,
	ports?: string[],
	envVars?: Record<string, string>,
	command?: string
): Promise<{
	success: boolean;
	containerId?: string;
	error?: string;
	output?: string;
}> => {
	try {
		console.log(`Running Docker container from image: ${imageName}`);

		// Check GPU availability
		const hasGpu = await checkGpuAvailability();
		console.log(`GPU availability: ${hasGpu ? "available" : "not available"}`);

		// Generate container name if not provided
		let finalContainerName;
		if (containerName) {
			finalContainerName = containerName;
		} else {
			// Auto-generate a container name, ensuring it's valid
			// Container names only allow [a-zA-Z0-9][a-zA-Z0-9_.-]
			// So we need to replace slashes, colons, and any other invalid chars
			const sanitizedBaseName = imageName.replace(/[^a-zA-Z0-9_.-]/g, "-");
			finalContainerName = `${sanitizedBaseName}-${Date.now()}`;
		}

		// Verify container name is valid
		if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(finalContainerName)) {
			console.error(`Invalid container name: ${finalContainerName}`);
			console.log(`Sanitizing container name to ensure Docker compatibility`);
			// Ensure first character is alphanumeric
			finalContainerName =
				finalContainerName.replace(/^[^a-zA-Z0-9]/, "a") + finalContainerName.substring(1);
		}

		console.log(`Using container name: ${finalContainerName}`);

		// Construct the run command args
		const runArgs = ["run", "-d"];

		// Only add GPU support if GPUs are available
		if (hasGpu) {
			runArgs.push("--gpus", "all");
			console.log(`Adding GPU support (--gpus all)`);
		} else {
			console.log(`Skipping GPU support (no GPUs detected)`);
		}

		runArgs.push("--name", finalContainerName);

		// Add port mappings if provided
		if (ports && ports.length > 0) {
			ports.forEach(port => {
				runArgs.push("-p", port);
			});
		}

		// Add environment variables if provided
		if (envVars) {
			Object.entries(envVars).forEach(([key, value]) => {
				runArgs.push("-e", `${key}=${value}`);
			});
		}

		// Add the image name
		runArgs.push(imageName);

		// Add the command if provided
		if (command) {
			// Split the command string into arguments
			command.split(" ").forEach(arg => {
				if (arg.trim()) runArgs.push(arg.trim());
			});
		}

		console.log(`Executing command: docker ${runArgs.join(" ")}`);

		// Run the container with streaming logs
		const runResult = await spawnWithLogs("docker", runArgs);

		if (!runResult.success) {
			console.error(`Docker run failed: ${runResult.error}`);
			throw new Error(`Docker run failed: ${runResult.error}`);
		}

		// Get the container ID from the output
		const containerId = runResult.output ? runResult.output.trim() : "";
		console.log(`Successfully started Docker container with ID: ${containerId}`);

		return {
			success: true,
			containerId,
			output: runResult.output,
		};
	} catch (error: any) {
		console.error(`Error running Docker container: ${error.message}`);
		return {
			success: false,
			error: error.message,
		};
	}
};

/**
 * Stops and removes a Docker container
 */
export const cleanupContainer = async (
	containerId: string
): Promise<{
	success: boolean;
	error?: string;
	output?: string;
}> => {
	try {
		console.log(`Cleaning up Docker container: ${containerId}`);

		// Stop the container
		console.log(`Stopping container: ${containerId}`);
		const stopResult = await spawnWithLogs("docker", ["stop", containerId]);

		if (!stopResult.success) {
			console.warn(`Warning: Failed to stop container: ${stopResult.error}`);
		} else {
			console.log(`Successfully stopped container: ${containerId}`);
		}

		// Remove the container
		console.log(`Removing container: ${containerId}`);
		const rmResult = await spawnWithLogs("docker", ["rm", containerId]);

		if (!rmResult.success) {
			console.warn(`Warning: Failed to remove container: ${rmResult.error}`);
		} else {
			console.log(`Successfully removed container: ${containerId}`);
		}

		return {
			success: true,
			output: `Container ${containerId} stopped and removed.`,
		};
	} catch (error: any) {
		console.error(`Error cleaning up Docker container: ${error.message}`);
		return {
			success: false,
			error: error.message,
		};
	}
};

/**
 * Gets logs from a Docker container with real-time streaming
 */
export const getContainerLogs = async (
	containerId: string,
	tail?: number,
	since?: string,
	follow: boolean = false,
	until?: string
): Promise<{
	success: boolean;
	logs?: string;
	error?: string;
}> => {
	try {
		console.log(`Getting logs for container: ${containerId}`);

		// Construct the logs command with options
		const logsArgs = ["logs"];

		// Add options
		if (tail !== undefined) {
			logsArgs.push("--tail", tail.toString());
		}

		if (since) {
			logsArgs.push("--since", since);
		}

		if (until) {
			logsArgs.push("--until", until);
		}

		if (follow) {
			logsArgs.push("--follow");
			console.log("Following logs in real-time (will stream for up to 2 minutes)...");
		}

		// Add timestamps to logs
		logsArgs.push("--timestamps");

		// Add container ID as the last argument
		logsArgs.push(containerId);

		console.log(`Executing command: docker ${logsArgs.join(" ")}`);

		// Use a shorter timeout for follow mode
		const timeout = follow ? 120000 : 30000; // 2 minutes for follow, 30 seconds otherwise

		// Run the logs command with streaming output
		const logsResult = await spawnWithLogs("docker", logsArgs, undefined, timeout);

		if (!logsResult.success) {
			console.error(`Failed to get container logs: ${logsResult.error}`);
			throw new Error(`Failed to get container logs: ${logsResult.error}`);
		}

		return {
			success: true,
			logs: logsResult.output,
		};
	} catch (error: any) {
		console.error(`Error getting container logs: ${error.message}`);
		return {
			success: false,
			error: error.message,
		};
	}
};

// Export as a tool for use with Mastra
export const dockerBuildTool = createTool({
	id: "Docker Build",
	inputSchema: z.object({
		repoPath: z.string().describe("Path to the repository containing Dockerfile"),
		dockerfilePath: z
			.string()
			.optional()
			.describe("Path to the Dockerfile (optional, will search if not provided)"),
		imageName: z.string().describe("Name for the Docker image"),
		platform: z.string().optional().describe("Target platform (default: linux/amd64)"),
	}),
	description: "Builds a Docker image from a Dockerfile",
	execute: async ({ context }) => {
		console.log(`===== DOCKER BUILD OPERATION =====`);
		console.log(`Repository path: ${context.repoPath}`);
		console.log(`Image name: ${context.imageName}`);

		// Enhanced debugging - check repository path existence
		if (!fs.existsSync(context.repoPath)) {
			console.error(`ERROR: Repository path does not exist: ${context.repoPath}`);
			console.log(`Current working directory: ${process.cwd()}`);
			console.log(`Existing directories in current path:`);
			try {
				const parentDir = path.dirname(context.repoPath);
				if (fs.existsSync(parentDir)) {
					const contents = fs.readdirSync(parentDir);
					contents.forEach(item => console.log(` - ${item}`));
				} else {
					console.log(`Parent directory ${parentDir} doesn't exist either`);
				}
			} catch (error) {
				console.error(`Error listing directory contents: ${error}`);
			}

			return {
				success: false,
				error: `Repository path does not exist: ${context.repoPath}. Please make sure you've checked out the repository first or provided the correct path.`,
			};
		}

		// Enhanced debugging - list repository contents
		console.log(`Repository directory exists. Contents:`);
		try {
			const contents = fs.readdirSync(context.repoPath);
			contents.forEach(item => {
				const itemPath = path.join(context.repoPath, item);
				const stats = fs.statSync(itemPath);
				console.log(` - ${item} (${stats.isDirectory() ? "directory" : "file"})`);
			});
		} catch (error) {
			console.error(`Error listing repository contents: ${error}`);
		}

		// Step 1: Find Dockerfile if path not provided
		let dockerfilePath = context.dockerfilePath;

		if (!dockerfilePath) {
			console.log(`Dockerfile path not provided, searching repository...`);
			const findResult = await findDockerfiles(context.repoPath);

			if (
				!findResult.success ||
				!findResult.dockerfiles ||
				findResult.dockerfiles.length === 0
			) {
				// Enhanced error reporting
				console.error(`No Dockerfiles found in ${context.repoPath}`);
				console.log(`Attempting manual find with recursive directory scan...`);

				// Fallback to manual directory scanning
				const foundFiles: string[] = [];
				try {
					const scanDir = (dir: string): void => {
						const items = fs.readdirSync(dir);
						for (const item of items) {
							const itemPath = path.join(dir, item);
							const stats = fs.statSync(itemPath);

							if (stats.isDirectory()) {
								scanDir(itemPath);
							} else if (item === "Dockerfile" || item.startsWith("Dockerfile.")) {
								foundFiles.push(itemPath);
								console.log(`Found potential Dockerfile: ${itemPath}`);
							}
						}
					};

					scanDir(context.repoPath);

					if (foundFiles.length > 0) {
						console.log(`Manual scan found ${foundFiles.length} Dockerfiles`);
						dockerfilePath = foundFiles[0];
						console.log(`Using first found Dockerfile: ${dockerfilePath}`);
					} else {
						console.error(`Manual scan found no Dockerfiles`);
					}
				} catch (error) {
					console.error(`Error during manual Dockerfile scan: ${error}`);
				}

				if (!dockerfilePath) {
					return {
						success: false,
						error:
							findResult.error ||
							"No Dockerfiles found in the repository. Make sure the repository contains a Dockerfile.",
					};
				}
			} else {
				// Use the first Dockerfile found
				dockerfilePath = findResult.dockerfiles[0];
				console.log(`Using Dockerfile: ${dockerfilePath}`);
			}
		} else {
			// Verify the provided Dockerfile path exists
			if (!fs.existsSync(dockerfilePath)) {
				console.error(`Specified Dockerfile does not exist: ${dockerfilePath}`);
				return {
					success: false,
					error: `Specified Dockerfile does not exist: ${dockerfilePath}`,
				};
			}
			console.log(`Using specified Dockerfile: ${dockerfilePath}`);
		}

		// Step 2: Build the Docker image
		const platform = context.platform || "linux/amd64";
		console.log(`Building Docker image from: ${dockerfilePath}`);

		const buildResult = await buildDockerImage(dockerfilePath, context.imageName, platform);

		return buildResult;
	},
});

export const dockerRunTool = createTool({
	id: "Docker Run",
	inputSchema: z.object({
		imageName: z
			.string()
			.describe(
				"Name of the Docker image to run - use the exact image name returned by the Docker Build tool"
			),
		containerName: z
			.string()
			.optional()
			.describe(
				"Name for the container (optional, must only contain [a-zA-Z0-9_.-] and start with alphanumeric)"
			),
		ports: z.array(z.string()).optional().describe("Port mappings (e.g., ['8080:80'])"),
		envVars: z.record(z.string()).optional().describe("Environment variables"),
		command: z.string().optional().describe("Command to run (optional)"),
	}),
	description:
		"Runs a Docker container from an image. Note: if container name is not provided, it will be auto-generated from the image name with invalid characters replaced.",
	execute: async ({ context }) => {
		console.log(`===== DOCKER RUN OPERATION =====`);
		console.log(
			`Image name: ${context.imageName} (This should match the imageName returned by Docker Build tool)`
		);

		const runResult = await runDockerContainer(
			context.imageName,
			context.containerName,
			context.ports,
			context.envVars,
			context.command
		);

		return runResult;
	},
});

export const dockerCleanupTool = createTool({
	id: "Docker Cleanup",
	inputSchema: z.object({
		containerId: z.string().describe("ID or name of the container to stop and remove"),
	}),
	description: "Stops and removes a Docker container",
	execute: async ({ context }) => {
		console.log(`===== DOCKER CLEANUP OPERATION =====`);
		console.log(`Container ID: ${context.containerId}`);

		const cleanupResult = await cleanupContainer(context.containerId);

		return cleanupResult;
	},
});

export const dockerLogsTool = createTool({
	id: "Docker Logs",
	inputSchema: z.object({
		containerId: z.string().describe("ID or name of the container to get logs from"),
		tail: z
			.number()
			.optional()
			.describe("Number of lines to show from the end of the logs (default: all)"),
		since: z
			.string()
			.optional()
			.describe(
				"Show logs since timestamp (e.g., '2021-01-01T00:00:00' or relative like '5m' for 5 minutes)"
			),
		follow: z
			.boolean()
			.optional()
			.describe("Follow log output in real-time (will stream for up to 2 minutes)"),
		until: z
			.string()
			.optional()
			.describe(
				"Show logs before a timestamp (e.g., '2021-01-01T00:00:00' or relative like '5m' for 5 minutes)"
			),
	}),
	description:
		"Retrieves and displays logs from a Docker container. Can follow logs in real-time or show historical logs with filtering options.",
	execute: async ({ context }) => {
		console.log(`===== DOCKER LOGS OPERATION =====`);
		console.log(`Container ID: ${context.containerId}`);

		if (context.tail) {
			console.log(`Showing last ${context.tail} lines`);
		}

		if (context.since) {
			console.log(`Showing logs since: ${context.since}`);
		}

		if (context.until) {
			console.log(`Showing logs until: ${context.until}`);
		}

		if (context.follow) {
			console.log(`Following logs: ${context.follow}`);
		}

		const logsResult = await getContainerLogs(
			context.containerId,
			context.tail,
			context.since,
			context.follow || false,
			context.until
		);

		if (logsResult.success && logsResult.logs) {
			// Format the logs for better readability
			const formattedLogs = logsResult.logs
				.split("\n")
				.filter(line => line.trim() !== "")
				.map(line => {
					// Try to separate timestamp from log message
					const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d+Z)\s(.*)$/);
					if (match) {
						const [, timestamp, message] = match;
						return `[${timestamp}] ${message}`;
					}
					return line;
				})
				.join("\n");

			return {
				success: true,
				logs: formattedLogs,
				lineCount: formattedLogs.split("\n").length,
			};
		}

		return logsResult;
	},
});
