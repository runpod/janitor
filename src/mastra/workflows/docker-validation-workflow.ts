import { Step, Workflow } from "@mastra/core/workflows";
import { z } from "zod";
import path from "path";

// Import our Docker and Git tools functions
import {
  buildDockerImage,
  findDockerfiles,
  runDockerContainer,
  getContainerLogs,
} from "../../docker-tools";
import { checkoutGitRepository } from "../../git-tools";

// Step 1: Check out the repository
const repoCheckoutStep = new Step({
  id: "checkout",
  description: "Checks out a Git repository",
  outputSchema: z.object({
    success: z.boolean(),
    repoPath: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    console.log(
      `Starting repository checkout for: ${context.triggerData.repository}`
    );

    try {
      // Use our checkoutGitRepository function
      const result = await checkoutGitRepository(
        context.triggerData.repository
      );

      if (!result.success) {
        return {
          success: false,
          error: result.error || "Failed to check out repository",
        };
      }

      return {
        success: true,
        repoPath: result.path,
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

// Step 2: Find Dockerfile and build Docker image
const dockerBuildStep = new Step({
  id: "build",
  description: "Finds Dockerfile and builds Docker image",
  outputSchema: z.object({
    success: z.boolean(),
    imageName: z.string().optional(),
    dockerfilePath: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    // Get the repository path from the previous step
    const checkoutStepResult = context.getStepResult(repoCheckoutStep);
    if (!checkoutStepResult?.success || !checkoutStepResult?.repoPath) {
      return {
        success: false,
        error: "Repository checkout failed or path not available",
      };
    }

    const repoPath = checkoutStepResult.repoPath;
    console.log(`Finding Dockerfile in repo path: ${repoPath}`);

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
      const buildResult = await buildDockerImage(
        dockerfilePath,
        imageName,
        platform
      );

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

// Step 3: Run Docker container
const dockerRunStep = new Step({
  id: "run",
  description: "Runs a Docker container from the built image",
  outputSchema: z.object({
    success: z.boolean(),
    containerId: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    // Get the image name from the previous step
    const buildStepResult = context.getStepResult(dockerBuildStep);
    if (!buildStepResult?.success || !buildStepResult?.imageName) {
      return {
        success: false,
        error: "Docker build failed or image name not available",
      };
    }

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

// Step 4: Check Docker container logs
const dockerLogsStep = new Step({
  id: "logs",
  description: "Checks logs from the Docker container",
  outputSchema: z.object({
    success: z.boolean(),
    logs: z.string().optional(),
    lineCount: z.number().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    // Get the container ID from the previous step
    const runStepResult = context.getStepResult(dockerRunStep);
    if (!runStepResult?.success || !runStepResult?.containerId) {
      return {
        success: false,
        error: "Docker run failed or container ID not available",
      };
    }

    const containerId = runStepResult.containerId;
    const waitTime = 1000; // Shorter wait time for testing
    const tail = 100;

    console.log(
      `Waiting ${waitTime}ms before checking logs for container: ${containerId}`
    );

    try {
      // Wait for container to start and generate some logs
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // Get container logs
      const logsResult = await getContainerLogs(containerId, tail, "5s");

      if (!logsResult.success) {
        return {
          success: false,
          error: logsResult.error || "Failed to retrieve container logs",
        };
      }

      const logs = logsResult.logs || "";
      const lineCount = logs
        .split("\n")
        .filter((line) => line.trim() !== "").length;

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

// Step 5: Generate a report of the validation results
const generateReportStep = new Step({
  id: "report",
  description: "Generates a report of the Docker validation results",
  outputSchema: z.object({
    success: z.boolean(),
    report: z.string(),
  }),
  execute: async ({ context }) => {
    const repository = context.triggerData.repository;
    const checkoutResult = context.getStepResult(repoCheckoutStep);
    const buildResult = context.getStepResult(dockerBuildStep);
    const runResult = context.getStepResult(dockerRunStep);
    const logsResult = context.getStepResult(dockerLogsStep);

    const repoPath = checkoutResult?.repoPath;
    const dockerfilePath = buildResult?.dockerfilePath;
    const imageName = buildResult?.imageName;
    const containerId = runResult?.containerId;
    const logs = logsResult?.logs;
    const lineCount = logsResult?.lineCount;

    // Collect errors from steps
    const errors: Record<string, string> = {};
    if (checkoutResult && !checkoutResult.success && checkoutResult.error) {
      errors.checkout = checkoutResult.error;
    }
    if (buildResult && !buildResult.success && buildResult.error) {
      errors.build = buildResult.error;
    }
    if (runResult && !runResult.success && runResult.error) {
      errors.run = runResult.error;
    }
    if (logsResult && !logsResult.success && logsResult.error) {
      errors.logs = logsResult.error;
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
    const timeNow = new Date().toISOString();
    const report = `
# Docker Validation Report: ${repository}
*Generated at: ${timeNow}*

## Summary
**Overall Success**: ${overallSuccess ? "✅ Passed" : "❌ Failed"}
${
  !overallSuccess && hasErrors
    ? `**Errors**:\n${Object.entries(errors)
        .map(([step, error]) => `- ${step}: ${error}`)
        .join("\n")}`
    : ""
}

## Validation Steps

### 1. Repository Checkout
**Status**: ${repoPath ? "✅ Success" : "❌ Failed"}
${repoPath ? `**Repository Path**: \`${repoPath}\`` : errors.checkout ? `**Error**: ${errors.checkout}` : ""}

### 2. Dockerfile Detection & Build
**Status**: ${dockerfilePath && imageName ? "✅ Success" : "❌ Failed"}
${dockerfilePath ? `**Dockerfile Path**: \`${dockerfilePath}\`` : errors.build ? `**Error**: ${errors.build}` : ""}
${imageName ? `**Image Name**: \`${imageName}\`` : ""}

### 3. Container Execution
**Status**: ${containerId ? "✅ Success" : "❌ Failed"}
${containerId ? `**Container ID**: \`${containerId}\`` : errors.run ? `**Error**: ${errors.run}` : ""}

### 4. Container Logs
**Status**: ${logsResult && logsResult.success ? "✅ Success" : "❌ Failed"}
${lineCount ? `**Log Lines**: ${lineCount}` : ""}
${errors.logs ? `**Error**: ${errors.logs}` : ""}

${
  logs
    ? `## Container Log Preview (first 20 lines)
\`\`\`
${logs.split("\n").slice(0, 20).join("\n")}
${lineCount && lineCount > 20 ? `\n... (${lineCount - 20} more lines)` : ""}
\`\`\`
`
    : logsResult && logsResult.success && (!logs || logs.trim() === "")
      ? `## Container Log Preview
\`\`\`
No logs produced by container or logs were empty. This is not an error.
\`\`\`
`
      : ""
}

## Conclusion
The Docker validation process ${overallSuccess ? "completed successfully" : "failed"}. 
${overallSuccess ? "The container started correctly and is producing logs." : "Please review the errors above."}
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
    repository: z
      .string()
      .describe("Repository name (e.g., 'organization/repo')"),
    imageName: z
      .string()
      .optional()
      .describe("Optional custom name for Docker image"),
    platform: z
      .string()
      .optional()
      .describe("Optional target platform (e.g., 'linux/amd64')"),
    ports: z.array(z.string()).optional().describe("Optional port mappings"),
    envVars: z
      .record(z.string())
      .optional()
      .describe("Optional environment variables"),
    command: z
      .string()
      .optional()
      .describe("Optional command to run in container"),
  }),
});

// Build workflow with sequential steps
dockerValidationWorkflow
  .step(repoCheckoutStep)
  .then(dockerBuildStep)
  .then(dockerRunStep)
  .then(dockerLogsStep)
  .then(generateReportStep)
  .commit();
