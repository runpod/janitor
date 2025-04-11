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

		const prompt = `Add a new feature to the repository ${repoFullName}: prepare the repo for the "RunPod hub":
- read the README.md to understand what the repo is about & select a "category" from "audio", "video", "image", "embedding", "language"
- add a badge to the "README.md" after the headline in this format: [![RunPod](https://api.runpod.io/badge/${repoFullName})](https://www.runpod.io/console/hub/${repoFullName})
- make sure that we have a "handler.py" file somewhere, sometimes this file is called "rp_handler.py", so please rename that
- .runpod folder on the top level of the repository path
- read the "test_input.json" and use that to update the "input" section of the "tests.json" file
- hub.json: extract the "title" (never use the word "template"), "description", "category" from the "README.md" and make sure to only include the "config.env" section if there are env variables required by the repo
- tests.json (check "test_input.json" of the repo to see how an example request looks like, get the "input" and replace "tests.input" with that, you can leave "name" and "timeout" as it is and make sure to only include the "config.env" section if there are env variables required by the repo)
- if there is no LICENSE file, please add an MIT license with "Copyright (c) 2025 RunPod"
- don't remove anything from the "hub.json" / "tests.json" example content below, as the "dev" agent needs to have this as a reference

ALWAYS set the "pull request title" to "feat: preparing worker for the hub"
ALWAYS generate the "iconUrl" for "hub.json" based on "https://dummyimage.com/100x100/007bff/fff&text=text" with a random color
ALWAYS include the TEMPLATES

# TEMPLATES

## hub.json

\`\`\`json
{
  "title": "example title",
  "description": "example description",
  "type": "serverless",
  "category": "audio",
  "iconUrl": "https://example.com/icon.png",
  "config": {
    "runsOn": "GPU",
    "containerDiskInGb": 20,
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

## tests.json

\`\`\`json
{
  "tests": [
    {
      "name": "basic_test",
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
      "12.1"
    ]
  }
}
\`\`\`
`;

		console.log("\n----------------------------------------------------------------");
		console.log("----------------------------------------------------------------");
		console.log(`👤  prompt: ${prompt}`);
		console.log("----------------------------------------------------------------");
		console.log("----------------------------------------------------------------\n");

		// Generate the response from the agent
		const response = await agent.generate(prompt, {
			maxSteps: 20,
		});

		console.log("\n----------------------------------------------------------------");
		console.log("----------------------------------------------------------------");
		console.log("🤖  janitor response");
		console.log(response.text);
		console.log("----------------------------------------------------------------");
		console.log("----------------------------------------------------------------\n");
	} catch (error) {
		console.error("Error running feature addition test:", error);
		process.exit(1);
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
