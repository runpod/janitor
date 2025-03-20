import { mastra } from "./mastra/index.js";
import dotenv from "dotenv";
import path from "path";
import { promises as fs } from "fs";

// Load environment variables
dotenv.config({ path: ".env.development" });

/**
 * Test the integration between the Repository Validator and Repository Repair Agent
 *
 * This test demonstrates how the Validator Agent can automatically repair repositories
 * that fail validation using the Repository Repair Tool.
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

// Test the validator + repair integration
async function testValidatorRepairIntegration() {
  try {
    // Set up the failing repository
    const { repoPath, repoName } = await setupFailingRepository();

    // Prepare a scenario that simulates a failed validation
    const failedValidation = {
      repository: repoName,
      repoPath: repoPath,
      buildStatus: "failure",
      containerStatus: "failure",
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
    };

    // Get the validator agent
    console.log("Getting the repository validator agent...");
    const validatorAgent = (mastra as any).agents.repoValidatorAgent;

    if (!validatorAgent) {
      throw new Error("Repository validator agent not found in Mastra");
    }

    // Simulate the validator agent using the repair tool
    console.log("\n=== VALIDATOR REQUESTING REPAIR ===\n");

    const prompt = `
I need to validate and fix this Docker repository:

Repository: ${repoName}
Location: ${repoPath}

I already tried to validate it, but the build failed with these errors:
${failedValidation.errors.join("\n")}

The build logs show:
${failedValidation.logs}

Please analyze what went wrong and use the Repository Repair tool to fix this repository.
`;

    console.log("Sending prompt to validator agent...");
    const response = await validatorAgent.generate(prompt);

    console.log("\n=== VALIDATOR AGENT RESPONSE ===\n");
    console.log(response.text);

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
    console.error(`Error in integration test: ${error}`);
    return false;
  }
}

// Run the test
async function main() {
  console.log("Starting Repository Validator + Repair integration test...");
  const success = await testValidatorRepairIntegration();
  console.log(`\nIntegration test ${success ? "PASSED" : "FAILED"}`);
}

main();
