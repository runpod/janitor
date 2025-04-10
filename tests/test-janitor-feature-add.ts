import fs from "fs/promises";
import path from "path";

import { mastra } from "../src/mastra/index.js";

async function main() {
	try {
		console.log("\n----------------------------------------------------------------");
		console.log("----------------------------------------------------------------");
		console.log("🚧  preparing test environment");
		console.log("----------------------------------------------------------------");
		console.log("----------------------------------------------------------------\n");

		// Define the repository and path
		const repoOwner = "TimPietrusky";
		const repoName = "worker-basic";
		const repoFullName = `${repoOwner}/${repoName}`;
		const repoPath = path.join(process.cwd(), "repos", `${repoOwner}-${repoName}`);

		// Delete the repo directory if it exists to ensure a clean start
		console.log(`Checking if repo directory exists: ${repoPath}`);
		try {
			const stats = await fs.stat(repoPath);
			if (stats.isDirectory()) {
				console.log(`Deleting existing repo directory: ${repoPath}`);
				await fs.rm(repoPath, { recursive: true, force: true });
				console.log("Repository directory deleted successfully");
			}
		} catch (err) {
			// Directory doesn't exist, which is fine
			console.log("Repository directory doesn't exist yet, will be created fresh");
		}

		// Get the janitor agent
		const agent = mastra.getAgent("janitor");
		if (!agent) {
			throw new Error("Janitor agent not found. Ensure it's registered in mastra.");
		}

		// Define the feature request prompt
		// Using a template literal for easier multi-line definition
		// IMPORTANT: Backticks within JSON content need to be escaped (\`)
		const featureRequestPrompt = `
Add a new feature to the repository ${repoFullName}: prepare the repo for the hub by adding:
- .runpod folder in the root
- hub.json (see content below)
- tests.json (see content below)
- add a badge to the readme after the headline in this format: [![RunPod](https://api.runpod.io/badge/${repoFullName})](https://www.runpod.io/console/hub/${repoFullName})

## hub.json content

\`\`\`json
{
  "title": "Worker Template",
  "description": "An example description",
  "type": "serverless",
  "category": "audio",
  "iconUrl": "https://example.com/icon.png",
  "config": {
    "runsOn": "GPU",
    "containerDiskInGb": 20,
    "presets": [
      {
        "name": "Preset 1",
        "defaults": {
          "STATIC_1": "value_1",
          "STRING_1": "default value 1"
        }
      }
    ],
    "env": [
      {
        "key": "STATIC_VAR",
        "value": "static_value"
      },
      {
        "key": "STRING_VAR",
        "input": {
          "name": "String Input",
          "type": "string",
          "description": "A string input test",
          "default": "new default value"
        }
      }
    ]
  }
}
\`\`\`

## tests.json content

\`\`\`json
{
  "tests": [
    {
      "name": "validation_text_input",
      "input": {
        "text": "Hello world",
        "language": "en"
      },
      "timeout": 10000
    }
  ],
  "config": {
    "gpuTypeId": "NVIDIA GeForce RTX 4090",
    "gpuCount": 1,
    "env": [
      {
        "key": "ENV_KEY_HERE",
        "value": "ENV_VALUE_HERE"
      }
    ],
    "allowedCudaVersions": [
      "12.7",
      "12.6",
      "12.5",
      "12.4",
      "12.3",
      "12.2",
      "12.1",
      "12.0"
    ]
  }
}
\`\`\`
`;

		console.log("\n----------------------------------------------------------------");
		console.log("----------------------------------------------------------------");
		console.log(`👤  prompt: ${featureRequestPrompt}`);
		console.log("----------------------------------------------------------------");
		console.log("----------------------------------------------------------------\n");

		// Generate the response from the agent
		const response = await agent.generate(featureRequestPrompt);

		console.log("\n----------------------------------------------------------------");
		console.log("----------------------------------------------------------------");
		console.log("🤖  janitor response");
		console.log(response.text);
		console.log("----------------------------------------------------------------");
		// Optionally log the full message history for debugging
		// console.log(JSON.stringify(response.response.messages, null, 2));
		console.log("----------------------------------------------------------------\n");

		// Add checks here later to verify files were created/modified if needed
		console.log("Test assumes manual verification of repo changes for now.");
	} catch (error) {
		console.error("Error running feature addition test:", error);
		process.exit(1); // Exit with error code
	}
}

main()
	.then(() => {
		console.log("Feature addition test finished successfully.");
		process.exit(0);
	})
	.catch(error => {
		// Catch should be handled within main, but added here as a safeguard
		console.error("Feature addition test failed unexpectedly:", error);
		process.exit(1);
	});
