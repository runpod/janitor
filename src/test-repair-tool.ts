import { repositoryRepairTool } from "./mastra/tools/repository-repair-tool.js";
import dotenv from "dotenv";
import path from "path";
import { promises as fs } from "fs";
import { mastra } from "./mastra/index.js";

// Load environment variables
dotenv.config({ path: ".env.development" });

/**
 * Test the Repository Repair Tool directly
 *
 * This test demonstrates how the Repository Repair Tool can be used to fix
 * failing repositories using the Repository Repair Agent.
 */

// Set up a mock failing repository
async function setupFailingRepository() {
  try {
    // Create a repository directory
    const repoName = "test-failing-repo";
    const repoPath = path.join(process.cwd(), "repos", repoName);

    // Ensure the directory exists
    await fs.mkdir(repoPath, { recursive: true });

    // Create a requirements.txt file with a problematic dependency
    const requirementsContent = `
numpy==1.22.3
pandas==1.4.2
outdated-package==1.0.0  # This doesn't exist and will cause the build to fail
torch==1.11.0
transformers==4.18.0
`;

    await fs.writeFile(
      path.join(repoPath, "requirements.txt"),
      requirementsContent.trim()
    );

    // Create a minimal Dockerfile that will fail due to the requirements.txt
    const dockerfileContent = `
FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt  # This will fail due to outdated-package

COPY . .

EXPOSE 8000

CMD ["python", "app.py"]
`;

    await fs.writeFile(
      path.join(repoPath, "Dockerfile"),
      dockerfileContent.trim()
    );

    // Create a simple app.py
    const appContent = `
import numpy as np
import pandas as pd

def main():
    print("Application started")
    
if __name__ == "__main__":
    main()
`;

    await fs.writeFile(path.join(repoPath, "app.py"), appContent.trim());

    console.log(`Created mock failing repository at: ${repoPath}`);
    return { repoPath, repoName };
  } catch (error) {
    console.error(`Error setting up failing repository: ${error}`);
    throw error;
  }
}

// Test the repair tool directly
async function testRepairTool() {
  try {
    // Set up the failing repository
    const { repoPath, repoName } = await setupFailingRepository();

    // Prepare a failed validation scenario
    const failedValidation = {
      repository: repoName,
      repoPath: repoPath,
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
      customInstructions:
        "Remove the problematic package from requirements.txt",
    };

    // Use the repair tool directly
    console.log("\n=== EXECUTING REPOSITORY REPAIR TOOL ===\n");

    // Execute the tool with the Mastra instance
    const result = (await repositoryRepairTool?.execute?.({
      context: failedValidation,
      mastra: mastra,
    })) || { success: false, error: "Tool execution failed" };

    console.log("\n=== REPAIR TOOL RESULT ===\n");
    console.log(JSON.stringify(result, null, 2));

    // Check if the repository was fixed
    console.log("\nChecking if the requirements.txt file was fixed...");
    const fixedRequirements = await fs.readFile(
      path.join(repoPath, "requirements.txt"),
      "utf8"
    );
    console.log("\nModified requirements.txt file:");
    console.log("-------------------------------");
    console.log(fixedRequirements);
    console.log("-------------------------------");

    // The outdated-package line should be removed or commented out if the repair was successful
    const wasFixed =
      !fixedRequirements.includes("outdated-package==1.0.0") ||
      fixedRequirements.includes("# outdated-package");

    console.log(
      `\nRepository repair result: ${wasFixed ? "✅ FIXED" : "❌ NOT FIXED"}`
    );

    return wasFixed;
  } catch (error) {
    console.error(`Error in repair tool test: ${error}`);
    return false;
  }
}

// Run the test
async function main() {
  console.log("Starting Repository Repair Tool test...");
  const success = await testRepairTool();
  console.log(`\nRepair tool test ${success ? "PASSED" : "FAILED"}`);
}

main();
