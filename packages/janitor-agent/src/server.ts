import { config } from "dotenv";
import express from "express";
import { v4 as uuidv4 } from "uuid";

import { analysisResultSchema } from "./mastra/agents/analyzer.js";
import { mastra } from "./mastra/index.js";
import { generateRepositoryPrompt, parsePromptWithDSL } from "./utils/prompt-parser.js";
import { storeValidationResult, updateValidationResult } from "./utils/supabase.js";

// Load environment variables from project root
config({ path: ".env" });

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Two-Step Processing Approach:
 * 1. Main janitor agent performs all work (git checkout, docker validation, repairs, PRs)
 * 2. Analyzer agent interprets the results and provides structured output
 *
 * This approach allows:
 * - Full tool execution without interference from structured output
 * - Reliable extraction of validation results from tool call data
 * - Clean separation of concerns between execution and analysis
 */

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

		// Enhanced parsing with DSL support
		let parsedPrompt;
		try {
			parsedPrompt = parsePromptWithDSL(message);
		} catch (error) {
			return res.status(400).json({
				error: `Prompt parsing failed: ${error instanceof Error ? error.message : String(error)}`,
			});
		}

		if (parsedPrompt.repositories.length === 0) {
			return res.status(400).json({
				error: "Could not identify any repositories in the prompt. Please specify repositories like 'RunPod/worker-basic' or use DSL format with PROMPT: and REPOS: sections.",
			});
		}

		console.log(
			`🔍 Parsed repositories: ${parsedPrompt.repositories.map((r: { org: string; name: string }) => `${r.org}/${r.name}`).join(", ")}`
		);
		console.log(`🎯 Action intent: "${parsedPrompt.actionIntent}"`);

		// Create initial database entries for all repositories with enhanced context
		for (const repo of parsedPrompt.repositories) {
			const repositoryPrompt = generateRepositoryPrompt(parsedPrompt.actionIntent, repo);

			await storeValidationResult({
				run_id: runId,
				repository_name: repo.name,
				organization: repo.org,
				validation_status: "running",
				results_json: {
					status: "started",
					message: "Processing initiated",
					timestamp: new Date().toISOString(),
				},
				// Enhanced prompt tracking
				original_prompt: parsedPrompt.originalPrompt,
				repository_prompt: repositoryPrompt,
			});
		}

		// Start processing with custom prompts
		processCustomPromptRequest(runId, parsedPrompt).catch(error => {
			console.error(`❌ Error processing prompt request ${runId}:`, error);
		});

		// Return immediately with enhanced run information
		res.json({
			runId,
			status: "started",
			message: `Starting validation processing for ${parsedPrompt.repositories.length} repositories`,
			actionIntent: parsedPrompt.actionIntent,
			repositories: parsedPrompt.repositories.map(
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

// Enhanced processing function for custom prompts
async function processCustomPromptRequest(
	runId: string,
	parsedPrompt: {
		repositories: Array<{ org: string; name: string }>;
		actionIntent: string;
		originalPrompt: string;
	}
) {
	console.log(`🚀 Starting async processing for run ${runId}`);

	try {
		const customPrompt = generateRepositoryPrompt(
			parsedPrompt.actionIntent,
			parsedPrompt.repositories[0]
		);
		console.log(`📝 Repository prompt: "${customPrompt.substring(0, 100)}..."`);

		// Step 1: Run the main janitor agent (with tool calls)
		const janitorAgent = mastra.getAgent("janitor");
		const janitorResponse = await janitorAgent.generate(customPrompt, {
			maxSteps: 20,
		});

		console.log(`✅ Janitor agent completed processing`);

		// Step 2: Use analyzer agent to get structured results
		console.log(`\n\n--------------------------------`);
		console.log(`RESULT ANALYZER PROMPT`);
		console.log(`--------------------------------\n\n`);

		const analyzerAgent = mastra.getAgent("analyzer");

		// Extract tool calls from steps (multi-step execution)
		const allToolCalls = [];
		const allToolResults = [];

		if (janitorResponse.steps && Array.isArray(janitorResponse.steps)) {
			for (const step of janitorResponse.steps) {
				if (step.toolCalls) {
					allToolCalls.push(...step.toolCalls);
				}
				if (step.toolResults) {
					allToolResults.push(...step.toolResults);
				}
			}
		}

		const analysisPrompt = `Analyze the following repository operation results:

Original Prompt: ${parsedPrompt.originalPrompt}
Repositories: ${parsedPrompt.repositories.map(r => `${r.org}/${r.name}`).join(", ")}

Agent Response:
${janitorResponse.text}

Tool Calls and Results:
${JSON.stringify(allToolCalls, null, 2)}

Tool Results Details:
${JSON.stringify(allToolResults, null, 2)}

Please provide a structured analysis of what happened, focusing on:
1. Whether validation ultimately passed or failed for each repository
2. What actions were performed
3. Any PR information
4. Error details if applicable

Be precise about validation_passed - only set to true if final validation actually succeeded.`;

		const analysisResponse = await analyzerAgent.generate(analysisPrompt, {
			output: analysisResultSchema,
		});

		console.log(`✅ Analysis completed`);

		// Extract the structured analysis
		const analysisResult = (analysisResponse as any).object || analysisResponse;
		console.log(`🔍 EXTRACTED ANALYSIS RESULT:\n\n`, JSON.stringify(analysisResult, null, 2));

		if (
			!analysisResult ||
			!analysisResult.repositories ||
			!Array.isArray(analysisResult.repositories)
		) {
			console.error(`❌ Invalid analysis structure: missing repositories array`);

			// Fallback: mark all repositories as failed
			for (const repo of parsedPrompt.repositories) {
				await updateValidationResult(runId, repo.name, {
					validation_status: "failed",
					results_json: {
						status: "failed",
						error: "Analysis failed - invalid structure",
						timestamp: new Date().toISOString(),
						repository: `${repo.org}/${repo.name}`,
						janitor_response: janitorResponse.text,
						analysis_error: JSON.stringify(analysisResult),
					},
					original_prompt: parsedPrompt.originalPrompt,
				});
			}
			return;
		}

		// Process each repository result
		for (const repo of parsedPrompt.repositories) {
			const repoFullName = `${repo.org}/${repo.name}`;

			// Find the result for this repository
			const repoResult = analysisResult.repositories.find(
				(r: any) =>
					r.repository === repoFullName ||
					r.repository === repo.name ||
					r.repository.endsWith(`/${repo.name}`)
			);

			if (!repoResult) {
				console.error(`❌ No analysis result found for repository ${repoFullName}`);

				await updateValidationResult(runId, repo.name, {
					validation_status: "failed",
					results_json: {
						status: "failed",
						error: "Repository not found in analysis result",
						timestamp: new Date().toISOString(),
						repository: repoFullName,
						janitor_response: janitorResponse.text,
					},
					original_prompt: parsedPrompt.originalPrompt,
				});
				continue;
			}

			// Map validation_passed to database status
			const validationStatus: "success" | "failed" = repoResult.validation_passed
				? "success"
				: "failed";

			console.log(
				`📊 Repository ${repoFullName}: ${repoResult.status} (validation_passed: ${repoResult.validation_passed}) -> database status: ${validationStatus}`
			);

			const dataToStore = {
				validation_status: validationStatus,
				results_json: {
					status: repoResult.status,
					action: repoResult.action,
					details: repoResult.details,
					validation_passed: repoResult.validation_passed,
					pr_status: repoResult.pr_status,
					pr_url: repoResult.pr_url,
					error_message: repoResult.error_message,
					timestamp: new Date().toISOString(),
					repository: repoFullName,
					janitor_response: janitorResponse.text,
					full_analysis: analysisResult,
				},
				original_prompt: parsedPrompt.originalPrompt,
			};

			console.log(`🔍 STORING IN DATABASE:`, JSON.stringify(dataToStore, null, 2));

			// Store the analyzed result
			await updateValidationResult(runId, repo.name, dataToStore);

			console.log(`✅ Stored result for ${repoFullName}: ${validationStatus}`);
		}

		const successfulRepos = analysisResult.successful_repositories || 0;
		const totalRepos = analysisResult.total_repositories || parsedPrompt.repositories.length;
		console.log(
			`🎉 Completed all processing for run ${runId} - ${successfulRepos}/${totalRepos} successful`
		);
	} catch (error) {
		console.error(`❌ Error in overall processing for run ${runId}:`, error);

		// Mark all repositories as failed due to processing error
		for (const repo of parsedPrompt.repositories) {
			await updateValidationResult(runId, repo.name, {
				validation_status: "failed",
				results_json: {
					status: "failed",
					error: error instanceof Error ? error.message : String(error),
					timestamp: new Date().toISOString(),
					repository: `${repo.org}/${repo.name}`,
				},
				original_prompt: parsedPrompt.originalPrompt,
			});
		}
	}
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
