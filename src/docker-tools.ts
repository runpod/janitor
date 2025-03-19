import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

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
    console.log(`Finding Dockerfiles in repository at: ${repoPath}`);

    if (!fs.existsSync(repoPath)) {
      throw new Error(`Repository path does not exist: ${repoPath}`);
    }

    // Use find command to locate Dockerfiles
    const findResult = safeExecSync(
      `find . -name "Dockerfile*" -type f`,
      repoPath
    );

    if (!findResult.success) {
      throw new Error(
        `Failed to search for Dockerfiles: ${findResult.errorMessage}`
      );
    }

    // Parse results, splitting by newline and removing empty entries
    const dockerfiles = findResult.output
      ? findResult.output
          .split("\n")
          .filter((line) => line.trim() !== "")
          .map((relativePath) =>
            path.join(repoPath, relativePath.replace("./", ""))
          )
      : [];

    console.log(`Found ${dockerfiles.length} Dockerfiles:`);
    dockerfiles.forEach((file) => console.log(` - ${file}`));

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
 * Builds a Docker image from a Dockerfile
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

    // Sanitize image name (remove invalid characters)
    const sanitizedImageName = imageName
      .replace(/[^a-zA-Z0-9_.-]/g, "-")
      .toLowerCase();

    console.log(`Building image with name: ${sanitizedImageName}`);
    console.log(`Using platform: ${platform}`);
    console.log(`Building from directory: ${dockerfileDir}`);

    // Execute docker buildx build command
    const buildCommand = `docker buildx build --platform=${platform} -t ${sanitizedImageName} -f ${dockerfileName} .`;
    const buildResult = safeExecSync(buildCommand, dockerfileDir, 600000); // 10 minutes timeout

    if (!buildResult.success) {
      console.error(`Docker build failed: ${buildResult.errorMessage}`);
      if (buildResult.stderr) {
        console.error(`Error output: ${buildResult.stderr}`);
      }
      throw new Error(`Docker build failed: ${buildResult.errorMessage}`);
    }

    console.log(`Successfully built Docker image: ${sanitizedImageName}`);

    return {
      success: true,
      imageName: sanitizedImageName,
      output: buildResult.output,
    };
  } catch (error: any) {
    console.error(`Error building Docker image: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
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

    // Generate container name if not provided
    const finalContainerName = containerName || `${imageName}-${Date.now()}`;

    // Construct the run command
    let runCommand = `docker run -d --name ${finalContainerName}`;

    // Add port mappings if provided
    if (ports && ports.length > 0) {
      ports.forEach((port) => {
        runCommand += ` -p ${port}`;
      });
    }

    // Add environment variables if provided
    if (envVars) {
      Object.entries(envVars).forEach(([key, value]) => {
        runCommand += ` -e ${key}=${value}`;
      });
    }

    // Add the image name
    runCommand += ` ${imageName}`;

    // Add the command if provided
    if (command) {
      runCommand += ` ${command}`;
    }

    console.log(`Executing command: ${runCommand}`);

    // Run the container
    const runResult = safeExecSync(runCommand);

    if (!runResult.success) {
      console.error(`Docker run failed: ${runResult.errorMessage}`);
      if (runResult.stderr) {
        console.error(`Error output: ${runResult.stderr}`);
      }
      throw new Error(`Docker run failed: ${runResult.errorMessage}`);
    }

    // Get the container ID from the output
    const containerId = runResult.output ? runResult.output.trim() : "";
    console.log(
      `Successfully started Docker container with ID: ${containerId}`
    );

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
    const stopResult = safeExecSync(`docker stop ${containerId}`);

    if (!stopResult.success) {
      console.warn(
        `Warning: Failed to stop container: ${stopResult.errorMessage}`
      );
    } else {
      console.log(`Successfully stopped container: ${containerId}`);
    }

    // Remove the container
    const rmResult = safeExecSync(`docker rm ${containerId}`);

    if (!rmResult.success) {
      console.warn(
        `Warning: Failed to remove container: ${rmResult.errorMessage}`
      );
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

// Export as a tool for use with Mastra
export const dockerBuildTool = createTool({
  id: "Docker Build",
  inputSchema: z.object({
    repoPath: z
      .string()
      .describe("Path to the repository containing Dockerfile"),
    dockerfilePath: z
      .string()
      .optional()
      .describe(
        "Path to the Dockerfile (optional, will search if not provided)"
      ),
    imageName: z.string().describe("Name for the Docker image"),
    platform: z
      .string()
      .optional()
      .describe("Target platform (default: linux/amd64)"),
  }),
  description: "Builds a Docker image from a Dockerfile",
  execute: async ({ context }) => {
    console.log(`===== DOCKER BUILD OPERATION =====`);
    console.log(`Repository path: ${context.repoPath}`);
    console.log(`Image name: ${context.imageName}`);

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
        return {
          success: false,
          error: findResult.error || "No Dockerfiles found in the repository",
        };
      }

      // Use the first Dockerfile found
      dockerfilePath = findResult.dockerfiles[0];
      console.log(`Using Dockerfile: ${dockerfilePath}`);
    }

    // Step 2: Build the Docker image
    const platform = context.platform || "linux/amd64";
    const buildResult = await buildDockerImage(
      dockerfilePath,
      context.imageName,
      platform
    );

    return buildResult;
  },
});

export const dockerRunTool = createTool({
  id: "Docker Run",
  inputSchema: z.object({
    imageName: z.string().describe("Name of the Docker image to run"),
    containerName: z
      .string()
      .optional()
      .describe("Name for the container (optional)"),
    ports: z
      .array(z.string())
      .optional()
      .describe("Port mappings (e.g., ['8080:80'])"),
    envVars: z.record(z.string()).optional().describe("Environment variables"),
    command: z.string().optional().describe("Command to run (optional)"),
  }),
  description: "Runs a Docker container from an image",
  execute: async ({ context }) => {
    console.log(`===== DOCKER RUN OPERATION =====`);
    console.log(`Image name: ${context.imageName}`);

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
    containerId: z
      .string()
      .describe("ID or name of the container to stop and remove"),
  }),
  description: "Stops and removes a Docker container",
  execute: async ({ context }) => {
    console.log(`===== DOCKER CLEANUP OPERATION =====`);
    console.log(`Container ID: ${context.containerId}`);

    const cleanupResult = await cleanupContainer(context.containerId);

    return cleanupResult;
  },
});
