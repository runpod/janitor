import { MCPConfiguration } from "@mastra/mcp";
import path from "path";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: ".env.development" });

async function testDockerMCP() {
  console.log("=== Testing Docker MCP Server ===");

  // Create MCP configuration for Docker
  const mcp = new MCPConfiguration({
    id: "docker-test-mcp",
    servers: {
      docker: {
        command: "node",
        args: ["dist/mastra/tools/mcp-servers.js", "docker"],
        env: process.env as Record<string, string>,
      },
    },
  });

  try {
    console.log("Connecting to Docker MCP server...");

    // Get toolsets from the MCP server
    const toolsets = await mcp.getToolsets();

    console.log("Available tools:", Object.keys(toolsets).join(", "));

    // Test repository path (assuming there's a sample repo with Dockerfile)
    const repoPath = path.join(
      process.cwd(),
      "repos/runpod-workers-worker-stable_diffusion_v2"
    );

    console.log("\n1. Finding Dockerfiles in repository...");
    const findDockerfiles = toolsets["docker.findDockerfiles"] as (
      params: any
    ) => Promise<string>;
    if (!findDockerfiles) {
      throw new Error("findDockerfiles tool not found");
    }

    const dockerfilesResult = await findDockerfiles({ repoPath });
    const dockerfiles = JSON.parse(dockerfilesResult);

    if (
      !dockerfiles.success ||
      !dockerfiles.dockerfiles ||
      dockerfiles.dockerfiles.length === 0
    ) {
      throw new Error(
        `No Dockerfiles found: ${dockerfiles.error || "Unknown error"}`
      );
    }

    console.log(`Found Dockerfiles: ${dockerfiles.dockerfiles.join(", ")}`);

    // Test building a Docker image
    console.log("\n2. Building Docker image...");
    const buildImage = toolsets["docker.buildImage"] as (
      params: any
    ) => Promise<string>;
    if (!buildImage) {
      throw new Error("buildImage tool not found");
    }

    const dockerfilePath = dockerfiles.dockerfiles[0];
    const contextPath = path.dirname(dockerfilePath);
    const imageTag = "test-worker-image-" + Date.now();

    const buildResult = await buildImage({
      dockerfilePath,
      contextPath,
      imageTag,
      platform: "linux/amd64",
    });

    const buildData = JSON.parse(buildResult);

    if (!buildData.success) {
      throw new Error(`Build failed: ${buildData.error || "Unknown error"}`);
    }

    console.log(`Successfully built image: ${buildData.imageId}`);

    // Test running a container
    console.log("\n3. Running Docker container...");
    const runContainer = toolsets["docker.runContainer"] as (
      params: any
    ) => Promise<string>;
    if (!runContainer) {
      throw new Error("runContainer tool not found");
    }

    const containerName = "test-container-" + Date.now();

    const runResult = await runContainer({
      imageId: buildData.imageId,
      containerName,
      timeout: 10,
      removeAfterRun: true,
    });

    const runData = JSON.parse(runResult);

    if (!runData.success) {
      throw new Error(
        `Container run failed: ${runData.error || "Unknown error"}`
      );
    }

    console.log(`Successfully ran container: ${runData.containerId}`);
    console.log(`Container logs:\n${runData.logs || "No logs available"}`);
  } catch (error: unknown) {
    console.error(
      `Test failed: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    // Disconnect from MCP server
    await mcp.disconnect();
    console.log("\nTest completed");
  }
}

// Run the test
testDockerMCP().catch((error: unknown) =>
  console.error(
    `Error: ${error instanceof Error ? error.message : String(error)}`
  )
);
