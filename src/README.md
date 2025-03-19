# Docker Validation Tools

This project provides a set of Docker validation tools for the Mastra framework that help you validate Docker repositories. The validation process checks if a repository can be cloned, contains a valid Dockerfile, can be built into a Docker image, and can be run as a container.

## Components

The main components are:

1. **Core Functions** - Direct implementations for various Docker operations:

   - `findDockerfiles` - Find Dockerfiles in a repository
   - `buildDockerImage` - Build a Docker image from a Dockerfile
   - `runDockerContainer` - Run a Docker container from an image
   - `getContainerLogs` - Get logs from a running container

2. **Workflow** - A structured sequential workflow:

   - `dockerValidationWorkflow` - A workflow that performs step-by-step validation

3. **Agent** - A conversational AI agent:
   - `repoValidatorAgent` - An agent that can validate repositories using the Docker tools

## Usage Examples

### Using the Direct Functions

```typescript
import {
  findDockerfiles,
  buildDockerImage,
  runDockerContainer,
  getContainerLogs,
} from "./docker-tools";

async function validateManually(repoPath) {
  // Find Dockerfiles in the repository
  const findResult = await findDockerfiles(repoPath);

  // Build the Docker image
  const buildResult = await buildDockerImage(
    findResult.dockerfiles[0],
    "my-image-name",
    "linux/amd64"
  );

  // Run a container
  const runResult = await runDockerContainer(
    buildResult.imageName,
    "my-container-name"
  );

  // Check container logs
  const logsResult = await getContainerLogs(runResult.containerId, 100);

  return {
    success: true,
    logs: logsResult.logs,
  };
}
```

### Using the Workflow

```typescript
import { dockerValidationWorkflow } from "./mastra/workflows/docker-validation-workflow";

async function validateWithWorkflow() {
  // Create a workflow run
  const { runId, start } = dockerValidationWorkflow.createRun();

  // Execute the workflow
  const result = await start({
    triggerData: {
      repository: "organization/repo",
      imageName: "custom-image-name", // optional
      platform: "linux/amd64", // optional
      ports: ["8080:80"], // optional
      envVars: { NODE_ENV: "production" }, // optional
      command: "npm start", // optional
    },
  });

  // Check the final report
  const reportStep = result.report;
  if (reportStep?.status === "success") {
    console.log(reportStep.output.report);
  }
}
```

### Using the Agent

```typescript
import { mastra } from "./mastra";

async function validateWithAgent() {
  // Get the repository validator agent
  const agent = mastra.getAgent("repoValidatorAgent");

  // Ask the agent to validate multiple repositories
  const response = await agent.generate(
    "Please validate the following Docker repositories and provide a summary of which ones pass and which ones fail:\n" +
      "- organization/repo1\n" +
      "- organization/repo2\n" +
      "- organization/repo3"
  );

  // The agent will use the Docker validation tool, which uses the workflow internally
  console.log(response.text);
}
```

## Validation Steps

The Docker validation process involves these steps:

1. **Repository Checkout** - Clone or update the Git repository
2. **Dockerfile Detection** - Find all Dockerfiles in the repository
3. **Docker Build** - Build a Docker image from the Dockerfile
4. **Container Run** - Run a container from the built image
5. **Log Check** - Verify that the container produces logs

## Cross-Platform Support

The tools are designed to work on both Windows and Linux systems:

- On Windows, manual directory scanning is used to find Dockerfiles
- On Linux, the standard `find` command is used with fallback to manual scanning

## Error Handling

All operations include comprehensive error handling and reporting. Failed validations generate detailed reports that show:

- Which steps succeeded and which failed
- The specific error messages for each failure
- Path information for files and containers
- Preview of container logs when available
