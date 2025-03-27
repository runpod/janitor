import axios from "axios";

// Your endpoint URL
const ENDPOINT_URL = "https://k0guxrh3tzdbfx-8000.proxy.runpod.net/v1/chat/completions";
// Your API key - replace with your actual key
const API_KEY = "your-api-key";

// Request body
const requestBody = {
	model: "Team-ACE/ToolACE-2-8B",
	temperature: 0,
	messages: [
		{
			role: "system",
			content:
				'You are an expert Docker repository validator and fixer. \n\n  You help users check if Docker repositories are valid and working correctly by:\n  1. Cloning the Git repository using gitCheckoutTool\n  2. Finding Dockerfiles in the repository\n  3. Validating a docker image by building and running it\n  4. Checking container logs for proper operation\n  5. push changes to github via a pull request\n  \n  When validation fails, you can automatically repair common issues using your repair tools.\n  When fixing repositories:\n  - First, try to understand the root cause of the failure\n  - Use the Repository Repair tool to fix the issues with the EXACT error, not all information, just the error itself and make SUPER SURE to escape EVERY double quote\n  - When the repair tool returns with needsRevalidation=true, IMMEDIATELY re-validate the repository using the dockerValidationTool\n  - Pass the exact same repository path (repoPath) back to the dockerValidationTool\n\n After fixing repositories:\n  - validate the repository\n  - if validation passes, then use the "pull request" tool, but if it fails, that use the "repair" tool\n\n Repeat this validate → repair → validate loop until the repository passes or you\'ve tried at least 3 repair attempts\n  \n  When a repository is repaired and passes validation:\n  - Use the "pull request" tool to submit a pull request with the fixes\n  - Include all details about the fixes and validation results in the PR creation\n  \n  When given multiple repositories to validate, check each one sequentially and provide a summary of all findings.\n  Focus on providing clear, factual responses about which repositories pass validation and which ones fail.\n  If a validation fails, explain which step failed and why.\n\n  # output format\n\n  create a table showing:\n  - Repository name\n  - Validation status (✅ Pass / ❌ Fail)\n  - Repair status (🔧 Fixed / ⚠️ Unfixable) - if repair was attempted\n  - PR status (📝 Created / 🔄 Updated / ❌ Failed) - if PR was attempted\n  - Failure/fix details\n  .',
		},
		{ role: "user", content: "Please validate the reepository TimPietrusky/worker-basic" },
		{
			role: "assistant",
			content: "",
			tool_calls: [
				{
					id: "chatcmpl-tool-ad5b2ec43f1e44eea76b038d39706d4f",
					type: "function",
					function: {
						name: "gitCheckoutTool",
						arguments: '{"repository":"TimPietrusky/worker-basic"}',
					},
				},
			],
		},
		{
			role: "tool",
			tool_call_id: "chatcmpl-tool-ad5b2ec43f1e44eea76b038d39706d4f",
			content:
				'{"success":true,"path":"D:\\\\dev\\\\runpod\\\\worker-maintainer\\\\repos\\\\TimPietrusky-worker-basic","output":""}',
		},
		{
			role: "assistant",
			content: "",
			tool_calls: [
				{
					id: "chatcmpl-tool-ce5c93b0592c44d69c9159980f19af62",
					type: "function",
					function: {
						name: "dockerValidationTool",
						arguments:
							'{"repoPath":"D:\\\\dev\\\\runpod\\\\worker-maintainer\\\\repos\\\\TimPietrusky-worker-basic"}',
					},
				},
			],
		},
		{
			role: "tool",
			tool_call_id: "chatcmpl-tool-ce5c93b0592c44d69c9159980f19af62",
			content:
				'ERROR: failed to solve: failed to compute cache key: failed to calculate checksum of ref b2a7c0f2-2e93-4d96-8cb9-863c404c8820::30wb6bsbeu3aowup2y2szwt5e: \\"/README\\": not found',
		},
		{
			role: "assistant",
			content: "",
			tool_calls: [
				{
					id: "chatcmpl-tool-dbdf120607744a288fe8e78dee9a9905",
					type: "function",
					function: {
						name: "repair",
						arguments:
							'{"repository":"TimPietrusky/worker-basic","repoPath":"D:\\\\dev\\\\runpod\\\\worker-maintainer\\\\repos\\\\TimPietrusky-worker-basic","buildStatus":"failure","containerStatus":"failure","errors":"Docker build failed: #0 building with \\"desktop-linux\\" instance using docker driver","logs":"Docker build failed or image name not available"}',
					},
				},
			],
		},
		{
			role: "tool",
			tool_call_id: "chatcmpl-tool-dbdf120607744a288fe8e78dee9a9905",
			content:
				'"- description: Fixed the Dockerfile by correcting the README file name from \\"README\\" to \\"README.md\\" to match the actual file in the repository\\n- files:\\n  - Dockerfile: corrected the COPY command for README.md"',
		}
	],
	tools: [
		{
			type: "function",
			function: {
				name: "dockerValidationTool",
				description:
					"Validates a Docker repository by building the image, running a container, and checking logs. Requires that the repository has already been checked out.",
				parameters: {
					type: "object",
					properties: {
						repoPath: {
							type: "string",
							description:
								"Path to the local repository that has already been checked out",
						},
						imageName: {
							type: "string",
							description: "Optional custom name for Docker image",
						},
						platform: {
							type: "string",
							description: "Optional target platform (e.g., 'linux/amd64')",
						},
						ports: {
							type: "array",
							items: { type: "string" },
							description: "Optional port mappings",
						},
						envVars: {
							type: "object",
							additionalProperties: { type: "string" },
							description: "Optional environment variables",
						},
						command: {
							type: "string",
							description: "Optional command to run in container",
						},
					},
					required: ["repoPath"],
					additionalProperties: false,
					$schema: "http://json-schema.org/draft-07/schema#",
				},
			},
		},
		{
			type: "function",
			function: {
				name: "repair",
				description: "Attempts to repair a repository that failed validation",
				parameters: {
					type: "object",
					properties: {
						repository: { type: "string", description: "Repository name (owner/repo)" },
						repoPath: {
							type: "string",
							description: "Path to the checked out repository",
						},
						buildStatus: { type: "string", enum: ["success", "failure"] },
						containerStatus: { type: "string", enum: ["success", "failure"] },
						errors: { type: "string" },
						logs: { type: "string" },
						customInstructions: {
							type: "string",
							description: "Optional specific repair instructions",
						},
						attemptCount: {
							type: "number",
							description: "Number of repair attempts so far",
						},
					},
					required: [
						"repository",
						"repoPath",
						"buildStatus",
						"containerStatus",
						"errors",
						"logs",
					],
					additionalProperties: false,
					$schema: "http://json-schema.org/draft-07/schema#",
				},
			},
		},
		{
			type: "function",
			function: {
				name: "pullRequest",
				description:
					"Creates or updates a Pull Request for a repository that has been fixed",
				parameters: {
					type: "object",
					properties: {
						repositoryPath: {
							type: "string",
							description: "Local path to the repository",
						},
						repository: {
							type: "string",
							description: "Repository in the format 'owner/repo'",
						},
						fixes: {
							type: "array",
							items: {
								type: "object",
								properties: {
									file: { type: "string", description: "File that was fixed" },
									description: {
										type: "string",
										description: "Description of the fix",
									},
								},
								required: ["file", "description"],
								additionalProperties: false,
							},
							description: "List of fixes that were applied",
						}
					},
					required: ["repositoryPath", "repository", "fixes"],
					additionalProperties: false,
					$schema: "http://json-schema.org/draft-07/schema#",
				},
			},
		},
	],
	tool_choice: "auto",
};

async function sendRequest() {
	try {
		console.log("Sending request to RunPod endpoint...");

		const response = await axios.post("https://k0guxrh3tzdbfx-8000.proxy.runpod.net/v1/chat/completions", requestBody, {
			headers: {
				"Content-Type": "application/json"
			},
		});

		console.log("Response received:");
		console.log(JSON.stringify(response.data, null, 2));
	} catch (error) {
		console.error("Error sending request:");
		if (error.response) {
			// The request was made and the server responded with a status code
			// that falls out of the range of 2xx
			console.error("Response status:", error.response.status);
			console.error("Response data:", error.response.data);
		} else if (error.request) {
			// The request was made but no response was received
			console.error("No response received:", error.request);
		} else {
			// Something happened in setting up the request that triggered an Error
			console.error("Error message:", error.message);
		}
	}
}

// Run the function
sendRequest();
