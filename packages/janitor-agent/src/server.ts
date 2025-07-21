import { config } from "dotenv";
import express from "express";
import path from "path";
import { v4 as uuidv4 } from "uuid";

import { mastra } from "./mastra/index.js";
import { parseRepositoriesFromPrompt } from "./utils/prompt-parser";
import { storeValidationResult, updateValidationResult } from "./utils/supabase.js";

// Load environment variables from project root
config({ path: ".env" });

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
	res.json({
		status: "healthy",
		timestamp: new Date().toISOString(),
		service: "janitor-mastra-server",
	});
});

// Main prompt endpoint for natural language requests
app.post("/api/prompt", async (req, res) => {
	try {
		const { message } = req.body;

		if (!message) {
			return res.status(400).json({
				error: "Missing 'message' field in request body",
			});
		}

		console.log(`📥 Received prompt: "${message}"`);

		// Generate a unique run ID for this validation session
		const runId = uuidv4();

		// Parse repositories from the natural language prompt
		const repositories = parseRepositoriesFromPrompt(message);

		if (repositories.length === 0) {
			return res.status(400).json({
				error: "Could not identify any repositories in the prompt. Please specify repositories like 'RunPod/worker-basic' or 'validate these repos: repo1, repo2'",
			});
		}

		console.log(
			`🔍 Parsed repositories: ${repositories.map((r: { org: string; name: string }) => `${r.org}/${r.name}`).join(", ")}`
		);

		// Create initial database entries for all repositories
		for (const repo of repositories) {
			await storeValidationResult({
				run_id: runId,
				repository_name: repo.name,
				organization: repo.org,
				validation_status: "running",
				results_json: {
					status: "started",
					message: "Validation initiated",
					timestamp: new Date().toISOString(),
				},
			});
		}

		// Start validation process asynchronously
		processValidationRequest(runId, repositories, message).catch(error => {
			console.error(`❌ Error processing validation request ${runId}:`, error);
		});

		// Return immediately with run ID
		res.json({
			runId,
			status: "started",
			message: `Starting validation for ${repositories.length} repositories`,
			repositories: repositories.map(
				(r: { org: string; name: string }) => `${r.org}/${r.name}`
			),
		});
	} catch (error) {
		console.error("❌ Error handling prompt:", error);
		res.status(500).json({
			error: "Internal server error processing prompt",
		});
	}
});

// Get validation results by run ID
app.get("/api/results/:runId", async (req, res) => {
	try {
		const { runId } = req.params;

		const { getValidationResults } = await import("./utils/supabase.js");
		const results = await getValidationResults(runId);

		res.json({
			runId,
			results: results || [],
			count: results?.length || 0,
		});
	} catch (error) {
		console.error("❌ Error fetching results:", error);
		res.status(500).json({
			error: "Error fetching validation results",
		});
	}
});

// Get validation results by repository name
app.get("/api/results/repo/:repoName", async (req, res) => {
	try {
		const { repoName } = req.params;

		const { getValidationResultsByRepo } = await import("./utils/supabase.js");
		const results = await getValidationResultsByRepo(repoName);

		res.json({
			repository: repoName,
			results: results || [],
			count: results?.length || 0,
		});
	} catch (error) {
		console.error("❌ Error fetching repository results:", error);
		res.status(500).json({
			error: "Error fetching repository validation results",
		});
	}
});

// Process validation request asynchronously
async function processValidationRequest(
	runId: string,
	repositories: Array<{ org: string; name: string }>,
	originalPrompt: string
) {
	console.log(`🚀 Starting async validation for run ${runId}`);

	for (const repo of repositories) {
		try {
			console.log(`🔄 Processing ${repo.org}/${repo.name}...`);

			// Use the janitor agent to validate the repository
			const agent = mastra.getAgent("janitor");
			const prompt = `Please validate this repository: ${repo.org}/${repo.name}. ${originalPrompt.includes("PR") || originalPrompt.includes("pull request") ? "Create a PR if fixes are needed." : ""}`;

			const response = await agent.generate(prompt);

			// Update database with success
			await updateValidationResult(runId, repo.name, {
				validation_status: "success",
				results_json: {
					status: "completed",
					response: response,
					timestamp: new Date().toISOString(),
					repository: `${repo.org}/${repo.name}`,
				},
			});

			console.log(`✅ Completed validation for ${repo.org}/${repo.name}`);
		} catch (error) {
			console.error(`❌ Error validating ${repo.org}/${repo.name}:`, error);

			// Update database with failure
			await updateValidationResult(runId, repo.name, {
				validation_status: "failed",
				results_json: {
					status: "failed",
					error: error instanceof Error ? error.message : String(error),
					timestamp: new Date().toISOString(),
					repository: `${repo.org}/${repo.name}`,
				},
			});
		}
	}

	console.log(`🎉 Completed all validations for run ${runId}`);
}

// Start the server
app.listen(PORT, () => {
	console.log(`🚀 Janitor Mastra Server running on port ${PORT}`);
	console.log(`🔗 Health check: http://localhost:${PORT}/health`);
	console.log(`📋 API endpoint: http://localhost:${PORT}/api/prompt`);
	console.log(`📊 Results endpoint: http://localhost:${PORT}/api/results/:runId`);
	console.log("");
	console.log("✅ Server ready to accept natural language validation requests!");
});
