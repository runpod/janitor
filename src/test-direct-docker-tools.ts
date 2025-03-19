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

async function testDirectDockerTools() {
  console.log("=== Testing Direct Docker Tools ===");

  // Test repository path (assuming there's a sample repo with Dockerfile)
  const repoPath = path.join(
    process.cwd(),
    "repos/runpod-workers-worker-stable_diffusion_v2"
  );

  console.log("\n1. Testing findDockerfiles function...");
  const dockerfilesResult = await findDockerfiles(repoPath);

  if (
    dockerfilesResult.success &&
    dockerfilesResult.dockerfiles &&
    dockerfilesResult.dockerfiles.length > 0
  ) {
    console.log(
      `Found Dockerfiles: ${dockerfilesResult.dockerfiles.join(", ")}`
    );

    const dockerfile = dockerfilesResult.dockerfiles[0];
    const imageName = "test-worker-direct-" + Date.now();

    // Test building a Docker image
    console.log(`\n2. Testing buildDockerImage function...`);
    const buildResult = await buildDockerImage(dockerfile, imageName);

    if (buildResult.success && buildResult.imageName) {
      console.log(`Successfully built image: ${buildResult.imageName}`);

      // Test running a Docker container
      console.log("\n3. Testing runDockerContainer function...");
      const runResult = await runDockerContainer(
        buildResult.imageName,
        `test-container-${Date.now()}`
      );

      if (runResult.success && runResult.containerId) {
        console.log(`Successfully started container: ${runResult.containerId}`);

        // Wait for a bit
        console.log(`Waiting for 5 seconds...`);
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Test cleaning up the container
        console.log("\n4. Testing cleanupContainer function...");
        const cleanupResult = await cleanupContainer(runResult.containerId);

        if (cleanupResult.success) {
          console.log(
            `Successfully cleaned up container: ${runResult.containerId}`
          );
        } else {
          console.error(`Failed to clean up container: ${cleanupResult.error}`);
        }
      } else {
        console.error(`Failed to run container: ${runResult.error}`);
      }
    } else {
      console.error(`Failed to build image: ${buildResult.error}`);
    }
  } else {
    console.error(`No Dockerfiles found or error: ${dockerfilesResult.error}`);
  }

  console.log("\n=== Testing Mastra Tools ===");

  if (dockerBuildTool && dockerBuildTool.execute) {
    // Test dockerBuildTool
    console.log("\n1. Testing dockerBuildTool...");
    const buildToolResult = await dockerBuildTool.execute({
      context: {
        repoPath,
        imageName: "test-mastra-tool-" + Date.now(),
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

    if (buildSuccess && buildImageName) {
      console.log(
        `Successfully built image with Mastra tool: ${buildImageName}`
      );

      // Test dockerRunTool
      if (dockerRunTool && dockerRunTool.execute) {
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

        if (runSuccess && containerId) {
          console.log(
            `Successfully started container with Mastra tool: ${containerId}`
          );

          // Wait for a bit
          console.log(`Waiting for 5 seconds...`);
          await new Promise((resolve) => setTimeout(resolve, 5000));

          // Test dockerCleanupTool
          if (dockerCleanupTool && dockerCleanupTool.execute) {
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
          } else {
            console.error(
              "dockerCleanupTool or its execute method is not available"
            );
          }
        } else {
          console.error(
            `Failed to run container with Mastra tool: ${
              runToolResult &&
              typeof runToolResult === "object" &&
              "error" in runToolResult
                ? runToolResult.error
                : "Unknown error"
            }`
          );
        }
      } else {
        console.error("dockerRunTool or its execute method is not available");
      }
    } else {
      console.error(
        `Failed to build image with Mastra tool: ${
          buildToolResult &&
          typeof buildToolResult === "object" &&
          "error" in buildToolResult
            ? buildToolResult.error
            : "Unknown error"
        }`
      );
    }
  } else {
    console.error("dockerBuildTool or its execute method is not available");
  }
}

// Run the test
testDirectDockerTools()
  .then(() => console.log("\nTests completed"))
  .catch((error) =>
    console.error(
      `Tests failed with error: ${error instanceof Error ? error.message : String(error)}`
    )
  );
