import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// Request body
const requestBody = {
	model: process.env.RUNPOD_GENERAL_MODEL,
	temperature: 0,
	top_p: 1,
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
				'{"success":true,"passed":false,"repoPath":"D:\\\\dev\\\\runpod\\\\worker-maintainer\\\\repos\\\\TimPietrusky-worker-basic","report":"\\n# Docker Validation Report: TimPietrusky-worker-basic\\n*Generated at: 2025-03-26T12:21:34.071Z*\\n\\n## Summary\\n**Overall Success**: ❌ Failed\\n**Errors**:\\n- build: Docker build failed: #0 building with \\"desktop-linux\\" instance using docker driver\\n\\n#1 [internal] load build definition from Dockerfile\\n#1 transferring dockerfile: 246B done\\n#1 DONE 0.0s\\n\\n#2 [internal] load metadata for docker.io/library/python:3.10-slim\\n#2 DONE 0.6s\\n\\n#3 [internal] load .dockerignore\\n#3 transferring context: 2B done\\n#3 DONE 0.0s\\n\\n#4 [1/6] FROM docker.io/library/python:3.10-slim@sha256:06f6d69d229bb55fab83dded514e54eede977e33e92d855ba3f97ce0e3234abc\\n#4 DONE 0.0s\\n\\n#5 [internal] load build context\\n#5 transferring context: 623B done\\n#5 DONE 0.0s\\n\\n#6 [2/6] COPY requirements.txt /requirements.txt\\n#6 CACHED\\n\\n#7 [3/6] RUN pip install -r requirements.txt\\n#7 CACHED\\n\\n#8 [4/6] COPY rp_handler.py /\\n#8 CACHED\\n\\n#9 [5/6] COPY README /\\n#9 ERROR: failed to calculate checksum of ref b2a7c0f2-2e93-4d96-8cb9-863c404c8820::30wb6bsbeu3aowup2y2szwt5e: \\"/README\\": not found\\n------\\n > [5/6] COPY README /:\\n------\\nDockerfile:8\\n--------------------\\n   6 |     COPY rp_handler.py /\\n   7 |     \\n   8 | >>> COPY README /\\n   9 |     \\n  10 |     # Start the container\\n--------------------\\nERROR: failed to solve: failed to compute cache key: failed to calculate checksum of ref b2a7c0f2-2e93-4d96-8cb9-863c404c8820::30wb6bsbeu3aowup2y2szwt5e: \\"/README\\": not found\\n\\nView build details: docker-desktop://dashboard/build/desktop-linux/desktop-linux/xao69hqqo6cgm86q88f747odb\\n\\n- run: Docker build failed or image name not available\\n- logs: Docker run failed or container ID not available\\n\\n## Validation Steps\\n\\n### 1. Repository Path\\n**Repository Path**: `D:\\\\dev\\\\runpod\\\\worker-maintainer\\\\repos\\\\TimPietrusky-worker-basic`\\n\\n### 2. Dockerfile Detection & Build\\n**Status**: ❌ Failed\\n**Error**: Docker build failed: #0 building with \\"desktop-linux\\" instance using docker driver\\n\\n#1 [internal] load build definition from Dockerfile\\n#1 transferring dockerfile: 246B done\\n#1 DONE 0.0s\\n\\n#2 [internal] load metadata for docker.io/library/python:3.10-slim\\n#2 DONE 0.6s\\n\\n#3 [internal] load .dockerignore\\n#3 transferring context: 2B done\\n#3 DONE 0.0s\\n\\n#4 [1/6] FROM docker.io/library/python:3.10-slim@sha256:06f6d69d229bb55fab83dded514e54eede977e33e92d855ba3f97ce0e3234abc\\n#4 DONE 0.0s\\n\\n#5 [internal] load build context\\n#5 transferring context: 623B done\\n#5 DONE 0.0s\\n\\n#6 [2/6] COPY requirements.txt /requirements.txt\\n#6 CACHED\\n\\n#7 [3/6] RUN pip install -r requirements.txt\\n#7 CACHED\\n\\n#8 [4/6] COPY rp_handler.py /\\n#8 CACHED\\n\\n#9 [5/6] COPY README /\\n#9 ERROR: failed to calculate checksum of ref b2a7c0f2-2e93-4d96-8cb9-863c404c8820::30wb6bsbeu3aowup2y2szwt5e: \\"/README\\": not found\\n------\\n > [5/6] COPY README /:\\n------\\nDockerfile:8\\n--------------------\\n   6 |     COPY rp_handler.py /\\n   7 |     \\n   8 | >>> COPY README /\\n   9 |     \\n  10 |     # Start the container\\n--------------------\\nERROR: failed to solve: failed to compute cache key: failed to calculate checksum of ref b2a7c0f2-2e93-4d96-8cb9-863c404c8820::30wb6bsbeu3aowup2y2szwt5e: \\"/README\\": not found\\n\\nView build details: docker-desktop://dashboard/build/desktop-linux/desktop-linux/xao69hqqo6cgm86q88f747odb\\n\\n\\n\\n### 3. Container Execution\\n**Status**: ❌ Failed\\n**Error**: Docker build failed or image name not available\\n\\n## Conclusion\\nThe Docker validation process failed. \\nPlease review the errors above.\\n"}',
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
		},
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
						},
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

		const response = await axios.post(
			`https://api.runpod.ai/v2/${process.env.RUNPOD_GENERAL_ID}/openai/v1/chat/completions`,
			// `https://${process.env.RUNPOD_GENERAL_ID}-${process.env.RUNPOD_GENERAL_PORT}.proxy.runpod.net/v1/chat/completions`,
			requestBody,
			{
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${process.env.RUNPOD_API_KEY}`,
				},
			}
		);

		console.log("Response received:");
		console.log(JSON.stringify(response.data, null, 2));
	} catch (error) {
		console.error("Error sending request:", error);
	}
}

// Run the function
sendRequest();
