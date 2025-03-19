import {
  findDockerfiles,
  buildDockerImage,
  runDockerContainer,
  cleanupContainer,
  dockerBuildTool,
  dockerRunTool,
  dockerCleanupTool,
} from "./docker-tools.js";
import path from "path";

/**
 * Comprehensive test for both direct Docker functions and Mastra tool integration.
 * This consolidates the functionality of the previous test-docker-tools.ts and
 * test-direct-docker-tools.ts files.
 */
async function testDockerTools() {
  console.log("=== Testing Docker Tools ===");

  // Test repository path (assuming there's a sample repo with Dockerfile)
  const repoPath = path.join(
    process.cwd(),
    "repos/runpod-workers-worker-stable_diffusion_v2"
  );

  // Part 1: Test direct functions
  await testDirectFunctions(repoPath);

  // Part 2: Test Mastra tool integration
  await testMastraToolIntegration(repoPath);
}

/**
 * Tests the direct function implementations (findDockerfiles, buildDockerImage, etc.)
 */
async function testDirectFunctions(repoPath: string) {
  console.log("\n=== Testing Direct Function Implementation ===");

  console.log("\n1. Finding Dockerfiles in repository...");
  const dockerfilesResult = await findDockerfiles(repoPath);

  if (
    !dockerfilesResult.success ||
    !dockerfilesResult.dockerfiles ||
    dockerfilesResult.dockerfiles.length === 0
  ) {
    console.error(`No Dockerfiles found or error: ${dockerfilesResult.error}`);
    return;
  }

  console.log(`Found Dockerfiles: ${dockerfilesResult.dockerfiles.join(", ")}`);

  const dockerfile = dockerfilesResult.dockerfiles[0];
  const imageName = `test-worker-direct-${Date.now()}`;

  // Test building a Docker image
  console.log(`\n2. Building Docker image from ${dockerfile}...`);
  const buildResult = await buildDockerImage(dockerfile, imageName);

  if (!buildResult.success || !buildResult.imageName) {
    console.error(`Failed to build image: ${buildResult.error}`);
    return;
  }

  console.log(`Successfully built image: ${buildResult.imageName}`);

  // Test running a Docker container
  console.log("\n3. Running Docker container from image...");
  const runResult = await runDockerContainer(
    buildResult.imageName,
    `test-container-${Date.now()}`
  );

  if (!runResult.success || !runResult.containerId) {
    console.error(`Failed to run container: ${runResult.error}`);
    return;
  }

  console.log(`Successfully started container: ${runResult.containerId}`);

  // Wait for a bit
  console.log(`Waiting for 5 seconds...`);
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Test cleaning up the container
  console.log("\n4. Cleaning up container...");
  const cleanupResult = await cleanupContainer(runResult.containerId);

  if (cleanupResult.success) {
    console.log(`Successfully cleaned up container: ${runResult.containerId}`);
  } else {
    console.error(`Failed to clean up container: ${cleanupResult.error}`);
  }
}

/**
 * Tests the Mastra tool integration (dockerBuildTool, dockerRunTool, etc.)
 */
async function testMastraToolIntegration(repoPath: string) {
  console.log("\n=== Testing Mastra Tool Integration ===");

  if (!dockerBuildTool || !dockerBuildTool.execute) {
    console.error("dockerBuildTool or its execute method is not available");
    return;
  }

  // Test dockerBuildTool
  console.log("\n1. Testing dockerBuildTool...");
  const buildToolResult = await dockerBuildTool.execute({
    context: {
      repoPath,
      imageName: `test-mastra-tool-${Date.now()}`,
    },
  });

  const buildSuccess =
    buildToolResult &&
    typeof buildToolResult === "object" &&
    "success" in buildToolResult &&
    buildToolResult.success;
  const buildImageName =
    buildToolResult &&
    typeof buildToolResult === "object" &&
    "imageName" in buildToolResult
      ? (buildToolResult.imageName as string)
      : "";

  if (!buildSuccess || !buildImageName) {
    console.error(
      `Failed to build image with Mastra tool: ${
        buildToolResult &&
        typeof buildToolResult === "object" &&
        "error" in buildToolResult
          ? buildToolResult.error
          : "Unknown error"
      }`
    );
    return;
  }

  console.log(`Successfully built image with Mastra tool: ${buildImageName}`);

  // Test dockerRunTool
  if (!dockerRunTool || !dockerRunTool.execute) {
    console.error("dockerRunTool or its execute method is not available");
    return;
  }

  console.log("\n2. Testing dockerRunTool...");
  const runToolResult = await dockerRunTool.execute({
    context: {
      imageName: buildImageName,
      containerName: `test-mastra-container-${Date.now()}`,
    },
  });

  const runSuccess =
    runToolResult &&
    typeof runToolResult === "object" &&
    "success" in runToolResult &&
    runToolResult.success;
  const containerId =
    runToolResult &&
    typeof runToolResult === "object" &&
    "containerId" in runToolResult
      ? (runToolResult.containerId as string)
      : "";

  if (!runSuccess || !containerId) {
    console.error(
      `Failed to run container with Mastra tool: ${
        runToolResult &&
        typeof runToolResult === "object" &&
        "error" in runToolResult
          ? runToolResult.error
          : "Unknown error"
      }`
    );
    return;
  }

  console.log(
    `Successfully started container with Mastra tool: ${containerId}`
  );

  // Wait for a bit
  console.log(`Waiting for 5 seconds...`);
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Test dockerCleanupTool
  if (!dockerCleanupTool || !dockerCleanupTool.execute) {
    console.error("dockerCleanupTool or its execute method is not available");
    return;
  }

  console.log("\n3. Testing dockerCleanupTool...");
  const cleanupToolResult = await dockerCleanupTool.execute({
    context: {
      containerId,
    },
  });

  const cleanupSuccess =
    cleanupToolResult &&
    typeof cleanupToolResult === "object" &&
    "success" in cleanupToolResult &&
    cleanupToolResult.success;

  if (cleanupSuccess) {
    console.log(
      `Successfully cleaned up container with Mastra tool: ${containerId}`
    );
  } else {
    console.error(
      `Failed to clean up container with Mastra tool: ${
        cleanupToolResult &&
        typeof cleanupToolResult === "object" &&
        "error" in cleanupToolResult
          ? cleanupToolResult.error
          : "Unknown error"
      }`
    );
  }
}

// Run the test
testDockerTools()
  .then(() => console.log("\nTests completed successfully"))
  .catch((error) =>
    console.error(
      `Tests failed with error: ${error instanceof Error ? error.message : String(error)}`
    )
  );
