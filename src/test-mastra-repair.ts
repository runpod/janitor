import { mastra } from "./mastra/index.js";
import dotenv from "dotenv";
import path from "path";
import { promises as fs } from "fs";

// Load environment variables
dotenv.config({ path: ".env.development" });

// Sample validation results
const sampleValidationResults = [
  {
    repository: "runpod-workers/sample-docker-success",
    buildStatus: "success" as const,
    containerStatus: "success" as const,
    errors: [],
    logs: "All tests passed successfully",
  },
  {
    repository: "runpod-workers/sample-docker-fail",
    buildStatus: "failure" as const,
    containerStatus: "failure" as const,
    errors: [
      "The command '/bin/sh -c pip install -r requirements.txt' returned a non-zero code: 1",
      "Could not find a version that satisfies the requirement outdated-package==1.0.0",
    ],
    logs: `
Step 1/10 : FROM python:3.9-slim
 ---> 5e236043dce4
Step 2/10 : WORKDIR /app
 ---> Using cache
 ---> 8ab4b91c8c2d
Step 3/10 : COPY requirements.txt .
 ---> Using cache
 ---> 7fd4a5627ea8
Step 4/10 : RUN pip install -r requirements.txt
 ---> Running in f21e93de6cd0
Collecting outdated-package==1.0.0
  ERROR: Could not find a version that satisfies the requirement outdated-package==1.0.0 (from versions: none)
ERROR: No matching distribution found for outdated-package==1.0.0
The command '/bin/sh -c pip install -r requirements.txt' returned a non-zero code: 1
    `,
  },
];

// Mock repository setup
const setupMockRepositories = async () => {
  try {
    // Create directories
    await Promise.all(
      sampleValidationResults.map(async (repo) => {
        const repoName = repo.repository.replace("/", "-");
        const repoPath = path.join(process.cwd(), "repos", repoName);

        // Create directory
        await fs.mkdir(repoPath, { recursive: true });

        if (repoName === "runpod-workers-sample-docker-fail") {
          // Create a requirements.txt file with the problematic dependency
          const requirementsContent = `
numpy==1.22.3
pandas==1.4.2
outdated-package==1.0.0
torch==1.11.0
transformers==4.18.0
          `;

          await fs.writeFile(
            path.join(repoPath, "requirements.txt"),
            requirementsContent.trim()
          );

          // Create a minimal Dockerfile
          const dockerfileContent = `
FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["python", "app.py"]
          `;

          await fs.writeFile(
            path.join(repoPath, "Dockerfile"),
            dockerfileContent.trim()
          );
        }

        console.log(`Created mock repository at: ${repoPath}`);
      })
    );

    return true;
  } catch (error) {
    console.error(`Error setting up mock repositories: ${error}`);
    return false;
  }
};

// Test the repository repair workflow
const testRepairWorkflow = async () => {
  try {
    console.log("Getting repository repair workflow...");

    // Use a type assertion to avoid TypeScript errors
    const anyMastra = mastra as any;
    const workflow = anyMastra.getWorkflow("repositoryRepairWorkflow");

    if (!workflow) {
      throw new Error("Repository repair workflow not found in Mastra");
    }

    console.log(`Running workflow: ${workflow.name}`);

    // Create a run
    const { runId, start } = workflow.createRun();
    console.log(`Created run with ID: ${runId}`);

    // Start the workflow with correct trigger data
    const result = await start({
      triggerData: {
        validationResults: sampleValidationResults,
      },
    });

    console.log(`\nWorkflow completed with result:`, result);

    if (result.results?.report?.status === "success") {
      console.log("\n=== REPAIR REPORT ===\n");
      console.log(result.results.report.output.report.summary);
      console.log("\nDetailed Results:");

      result.results.report.output.report.details.forEach(
        (detail: any, index: number) => {
          console.log(`\nRepository ${index + 1}: ${detail.repository}`);
          console.log(`Status: ${detail.status}`);

          if (detail.fixes && detail.fixes.length > 0) {
            console.log("Fixes applied:");
            detail.fixes.forEach((fix: any, i: number) => {
              console.log(`  ${i + 1}. File: ${fix.file}`);
              console.log(`     Description: ${fix.description}`);
            });
          } else {
            console.log("No fixes applied or detected");
          }
        }
      );
    } else {
      console.log("Workflow did not produce a valid report");
    }

    return true;
  } catch (error) {
    console.error("Error running repair workflow:", error);
    return false;
  }
};

// Main function
const main = async () => {
  console.log("Setting up mock repositories...");
  await setupMockRepositories();

  console.log("\n=== TESTING REPOSITORY REPAIR WORKFLOW ===\n");
  await testRepairWorkflow();
};

main();
