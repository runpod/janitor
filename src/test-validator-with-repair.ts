import dotenv from "dotenv";
import { promises as fs } from "fs";
import path from "path";

import { repositoryValidatorAgent } from "./mastra/agents/index.js";

// Load environment variables
dotenv.config({ path: ".env.development" });

/**
 * Test the Repository Validator Agent with its new repair capabilities
 *
 * This test demonstrates how the Validator Agent can identify and fix
 * issues in repositories using the Repository Repair Tool.
 */

// Set up a mock failing repository
async function setupFailingRepository() {
	try {
		// Create a repository directory
		const repoName = "test-failing-repo-2";
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

		await fs.writeFile(path.join(repoPath, "requirements.txt"), requirementsContent.trim());

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

		await fs.writeFile(path.join(repoPath, "Dockerfile"), dockerfileContent.trim());

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

// Test the validator agent with repair
async function testValidatorWithRepair() {
	try {
		// Set up the failing repository
		const { repoPath, repoName } = await setupFailingRepository();

		// Simulate a validation scenario that failed
		console.log("\n=== VALIDATOR AGENT WITH REPAIR TEST ===\n");

		const prompt = `
I tried to build a Docker image for this repository:

Repository: ${repoName}
Location: ${repoPath}

But it failed with this error:
The command '/bin/sh -c pip install -r requirements.txt' returned a non-zero code: 1
Could not find a version that satisfies the requirement outdated-package==1.0.0

Please analyze what went wrong and fix this repository.
`;

		console.log("Sending prompt to validator agent...");
		const response = await repositoryValidatorAgent.generate(prompt);

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

		console.log(`\nRepository repair result: ${wasFixed ? "✅ FIXED" : "❌ NOT FIXED"}`);

		return wasFixed;
	} catch (error) {
		console.error(`Error in validator test: ${error}`);
		return false;
	}
}

// Run the test
async function main() {
	console.log("Starting Repository Validator with Repair test...");
	const success = await testValidatorWithRepair();
	console.log(`\nValidator Repair test ${success ? "PASSED" : "FAILED"}`);
}

main();
