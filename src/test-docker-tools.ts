import {
  findDockerfiles,
  buildDockerImage,
  runDockerContainer,
  cleanupContainer,
} from "./docker-tools.js";
import path from "path";

async function testDockerTools() {
  console.log("=== Testing Docker Tools ===");

  // Test repository path (assuming there's a sample repo with Dockerfile)
  const repoPath = path.join(
    process.cwd(),
    "repos/runpod-workers-worker-stable_diffusion_v2"
  );

  console.log("\n1. Finding Dockerfiles in repository...");
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
    const imageName = "test-worker-image";

    console.log(`\n2. Building Docker image from ${dockerfile}...`);
    const buildResult = await buildDockerImage(dockerfile, imageName);

    if (buildResult.success) {
      console.log(`Successfully built image: ${buildResult.imageName}`);

      console.log("\n3. Running Docker container from image...");
      const runResult = await runDockerContainer(imageName);

      if (runResult.success && runResult.containerId) {
        console.log(`Successfully started container: ${runResult.containerId}`);

        console.log("\n4. Cleaning up container...");
        // Wait a bit to ensure the container has started
        await new Promise((resolve) => setTimeout(resolve, 5000));

        const cleanupResult = await cleanupContainer(runResult.containerId);
        if (cleanupResult.success) {
          console.log("Successfully cleaned up container");
        } else {
          console.error(`Failed to cleanup container: ${cleanupResult.error}`);
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
}

// Run the test
testDockerTools()
  .then(() => console.log("\nTest completed"))
  .catch((error) => console.error(`Test failed with error: ${error.message}`));
