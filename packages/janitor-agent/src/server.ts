import { config } from "dotenv";
import express, { Request, Response } from "express";
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

// Middleware with error handling
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Error handling middleware for body parsing issues
app.use((err: any, req: Request, res: Response, next: any) => {
	console.error("❌ Middleware error:", err.message);
	if (err.type === "entity.parse.failed" || err.message.includes("Cannot find module")) {
		return res.status(400).json({
			error: "Request parsing failed",
			details: "Server encountered an issue processing the request format",
		});
	}
	next(err);
});

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
	res.json({
		status: "healthy",
		timestamp: new Date().toISOString(),
		service: "janitor-mastra-server",
	});
});

// Main prompt endpoint for natural language requests
app.post("/api/prompt", async (req: Request, res: Response) => {
	console.log("📤 Received prompt request");
	try {
		const { message } = req.body;

		if (!message) {
			console.error("❌ Missing message field in request");
			return res.status(400).json({
				error: "Missing 'message' field in request body",
			});
		}

		console.log("💬 Processing prompt:", message.substring(0, 100) + "...");

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
app.get("/api/results/:runId", async (req: Request, res: Response) => {
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
app.get("/api/results/repo/:repoName", async (req: Request, res: Response) => {
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

// Get orphaned validation runs
app.get("/api/orphaned", async (req: Request, res: Response) => {
	try {
		const thresholdHours = req.query.thresholdHours
			? parseInt(req.query.thresholdHours as string)
			: 5;

		const { getOrphanedValidationRuns } = await import("./utils/supabase.js");
		const orphanedRuns = await getOrphanedValidationRuns(thresholdHours);

		res.json({
			orphaned_runs: orphanedRuns,
			count: orphanedRuns.length,
			threshold_hours: thresholdHours,
		});
	} catch (error) {
		console.error("❌ Error fetching orphaned runs:", error);
		res.status(500).json({
			error: "Error fetching orphaned validation runs",
		});
	}
});

// Continue a specific validation run
app.post("/api/continue/:runId", async (req: Request, res: Response) => {
	try {
		const { runId } = req.params;

		console.log(`🔄 Continuing validation run: ${runId}`);

		const { getIncompleteRepositoriesForRun } = await import("./utils/supabase.js");
		const incompleteRepos = await getIncompleteRepositoriesForRun(runId);

		if (incompleteRepos.length === 0) {
			return res.status(400).json({
				error: "No incomplete repositories found for this run",
				runId,
			});
		}

		// Get the original prompt from the first repository
		const originalPrompt = incompleteRepos[0]?.original_prompt;
		if (!originalPrompt) {
			return res.status(400).json({
				error: "Original prompt not found for this run",
				runId,
			});
		}

		// Convert incomplete repos back to the format expected by processCustomPromptRequest
		const repositories = incompleteRepos.map((repo: any) => ({
			org: repo.organization,
			name: repo.repository_name,
		}));

		const parsedPrompt = {
			repositories,
			actionIntent: originalPrompt,
			originalPrompt,
		};

		console.log(`🔄 Resuming ${repositories.length} incomplete repositories for run ${runId}`);

		// Update existing entries to refresh timestamp and ensure they're marked as running
		for (const repo of repositories) {
			await updateValidationResult(runId, repo.name, {
				validation_status: "running",
				results_json: {
					status: "resumed",
					message: "Processing resumed",
					timestamp: new Date().toISOString(),
				},
			});
		}

		// Start processing with existing run ID (use specialized continued processing)
		processContinuedPromptRequest(runId, parsedPrompt).catch((error: any) => {
			console.error(`❌ Error continuing prompt request ${runId}:`, error);
		});

		res.json({
			runId,
			status: "continued",
			message: `Continuing validation processing for ${repositories.length} incomplete repositories`,
			repositories: repositories.map(
				(r: { org: string; name: string }) => `${r.org}/${r.name}`
			),
		});
	} catch (error) {
		console.error("❌ Error continuing run:", error);
		res.status(500).json({
			error: "Error continuing validation run",
		});
	}
});

// Cancel a specific validation run
app.post("/api/cancel/:runId", async (req: Request, res: Response) => {
	try {
		const { runId } = req.params;

		console.log(`❌ Cancelling validation run: ${runId}`);

		const { cancelValidationRun } = await import("./utils/supabase.js");
		const cancelledRepos = await cancelValidationRun(runId);

		res.json({
			runId,
			status: "cancelled",
			message: `Cancelled ${cancelledRepos.length} running repositories`,
			cancelled_count: cancelledRepos.length,
		});
	} catch (error) {
		console.error("❌ Error cancelling run:", error);
		res.status(500).json({
			error: "Error cancelling validation run",
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
		console.log(
			`🚀 Processing ${parsedPrompt.repositories.length} repositories sequentially...`
		);

		// Process each repository individually
		const allRepositoryResults = [];

		for (let i = 0; i < parsedPrompt.repositories.length; i++) {
			const repo = parsedPrompt.repositories[i];
			const repoFullName = `${repo.org}/${repo.name}`;

			console.log(
				`\n📦 Processing repository ${i + 1}/${parsedPrompt.repositories.length}: ${repoFullName}`
			);

			// Step 1: Run the main janitor agent for this repository (outside try-catch to preserve response)
			let janitorResponse = null;
			let analysisResult = null;

			try {
				const customPrompt = generateRepositoryPrompt(parsedPrompt.actionIntent, repo);
				console.log(`📝 Repository prompt: "${customPrompt.substring(0, 100)}..."`);
				console.log(`Repository: ${repoFullName}...`);

				const janitorAgent = mastra.getAgent("janitor");
				janitorResponse = await janitorAgent.generate(customPrompt, {
					maxSteps: 20,
				});

				console.log(`✅ Janitor agent completed processing for ${repoFullName}`);

				// Step 2: Use analyzer agent to get structured results for this repository
				console.log(`\n--------------------------------`);
				console.log(`RESULT ANALYZER FOR ${repoFullName}`);
				console.log(`--------------------------------\n`);

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

				const analysisPrompt = `Analyze the following repository operation results for ONLY this specific repository: ${repoFullName}

Original Prompt: ${parsedPrompt.originalPrompt}
Repository to Analyze: ${repoFullName}

Agent Response:
${janitorResponse.text}

Tool Calls and Results:
${JSON.stringify(allToolCalls, null, 2)}

Tool Results Details:
${JSON.stringify(allToolResults, null, 2)}

IMPORTANT: Only provide analysis for the repository "${repoFullName}". 
If the tool results contain multiple repositories, only analyze the results relevant to "${repoFullName}".
Your response must contain exactly ONE repository result for "${repoFullName}".

Please provide a structured analysis of what happened, focusing on:
1. Whether validation ultimately passed or failed for this specific repository: ${repoFullName}
2. What actions were performed for this repository
3. Any PR information for this repository
4. Error details if applicable

Be precise about validation_passed - only set to true if final validation actually succeeded for ${repoFullName}.`;

				// Try analyzer with structured output, but catch schema validation errors
				try {
					const analysisResponse = await analyzerAgent.generate(analysisPrompt, {
						output: analysisResultSchema,
					});

					console.log(`✅ Analysis completed for ${repoFullName}`);

					// Extract the structured analysis
					analysisResult = (analysisResponse as any).object || analysisResponse;
					console.log(
						`🔍 ANALYSIS RESULT FOR ${repoFullName}:\n`,
						JSON.stringify(analysisResult, null, 2)
					);
				} catch (analyzerError) {
					console.error(
						`❌ Analyzer schema validation failed for ${repoFullName}:`,
						analyzerError
					);

					// Fallback: Try analyzer without structured output to get raw response
					try {
						const fallbackAnalysisResponse =
							await analyzerAgent.generate(analysisPrompt);
						console.log(
							`⚠️  Analyzer fallback completed for ${repoFullName} (raw text)`
						);
						console.log(`📝 Raw analyzer response: ${fallbackAnalysisResponse.text}`);

						// Create a manual analysis result since schema validation failed
						analysisResult = {
							success: false,
							total_repositories: 1,
							successful_repositories: 0,
							failed_repositories: 1,
							repositories: [
								{
									repository: repoFullName,
									action: "error",
									status: "error",
									validation_passed: false,
									error_message: `Analyzer schema validation failed: ${analyzerError instanceof Error ? analyzerError.message : String(analyzerError)}`,
									details: `Analysis could not be parsed. Raw analyzer response: ${fallbackAnalysisResponse.text?.substring(0, 500) || "No response text"}...`,
								},
							],
							summary: "Analysis failed due to schema validation error",
							notes: `Original analyzer error: ${analyzerError instanceof Error ? analyzerError.message : String(analyzerError)}. Raw response preserved in janitor_response field.`,
						};
					} catch (fallbackError) {
						console.error(
							`❌ Analyzer fallback also failed for ${repoFullName}:`,
							fallbackError
						);

						// Create a manual error result
						analysisResult = {
							success: false,
							total_repositories: 1,
							successful_repositories: 0,
							failed_repositories: 1,
							repositories: [
								{
									repository: repoFullName,
									action: "error",
									status: "error",
									validation_passed: false,
									error_message: `Complete analyzer failure: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
									details: `Both structured and fallback analysis failed. Check janitor_response for raw output.`,
								},
							],
							summary: "Analysis completely failed",
							notes: `Analyzer errors: ${analyzerError instanceof Error ? analyzerError.message : String(analyzerError)} / ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
						};
					}
				}

				// ⚡ IMMEDIATE DATABASE UPDATE - Don't wait for all repos to finish!
				if (
					analysisResult?.repositories &&
					Array.isArray(analysisResult.repositories) &&
					analysisResult.repositories.length > 0
				) {
					const repoAnalysis = analysisResult.repositories[0];
					const validationStatus: "success" | "failed" = repoAnalysis.validation_passed
						? "success"
						: "failed";

					console.log(
						`📊 Repository ${repoFullName}: ${repoAnalysis.status} (validation_passed: ${repoAnalysis.validation_passed}) -> database status: ${validationStatus}`
					);

					const dataToStore = {
						validation_status: validationStatus,
						results_json: {
							status: repoAnalysis.status,
							action: repoAnalysis.action,
							details: repoAnalysis.details,
							validation_passed: repoAnalysis.validation_passed,
							pr_status: repoAnalysis.pr_status,
							pr_url: repoAnalysis.pr_url,
							error_message: repoAnalysis.error_message,
							timestamp: new Date().toISOString(),
							repository: repoFullName,
							janitor_response: janitorResponse?.text || null,
							full_analysis: analysisResult,
						},
						original_prompt: parsedPrompt.originalPrompt,
					};

					console.log(
						`🔍 STORING IN DATABASE IMMEDIATELY:`,
						JSON.stringify(dataToStore, null, 2)
					);
					await updateValidationResult(runId, repo.name, dataToStore);
					console.log(`✅ Enhanced validation result updated successfully`);
					console.log(`✅ Stored result for ${repoFullName}: ${validationStatus}`);
				} else {
					console.error(`❌ Invalid analysis structure for repository ${repoFullName}`);
					await updateValidationResult(runId, repo.name, {
						validation_status: "failed",
						results_json: {
							status: "failed",
							error: "Analysis failed - invalid structure",
							timestamp: new Date().toISOString(),
							repository: repoFullName,
							janitor_response: janitorResponse?.text || null,
							analysis_error: JSON.stringify(analysisResult),
						},
						original_prompt: parsedPrompt.originalPrompt,
					});
					console.log(`✅ Stored invalid analysis result for ${repoFullName}: failed`);
				}

				// Store the result for final summary (keep this for the completion message)
				allRepositoryResults.push({
					repository: repo,
					janitorResponse,
					analysisResult,
					success: true,
				});
			} catch (repoError) {
				console.error(`❌ Error processing repository ${repoFullName}:`, repoError);

				// ⚡ IMMEDIATE DATABASE UPDATE FOR ERROR - PRESERVE JANITOR RESPONSE
				await updateValidationResult(runId, repo.name, {
					validation_status: "failed",
					results_json: {
						status: "error",
						error: repoError instanceof Error ? repoError.message : String(repoError),
						timestamp: new Date().toISOString(),
						repository: repoFullName,
						janitor_response: janitorResponse?.text || null, // PRESERVE janitor response
						analyzer_error: "Error occurred before or during analysis",
						full_error_stack:
							repoError instanceof Error ? repoError.stack : String(repoError),
					},
					original_prompt: parsedPrompt.originalPrompt,
				});
				console.log(`✅ Stored error result for ${repoFullName}: failed`);

				// Store error result for final summary
				allRepositoryResults.push({
					repository: repo,
					janitorResponse: null,
					analysisResult: {
						success: false,
						total_repositories: 1,
						successful_repositories: 0,
						failed_repositories: 1,
						repositories: [
							{
								repository: repoFullName,
								action: "error",
								status: "error",
								validation_passed: false,
								error_message:
									repoError instanceof Error
										? repoError.message
										: String(repoError),
								details: `Processing failed: ${repoError instanceof Error ? repoError.message : String(repoError)}`,
							},
						],
					},
					success: false,
					error: repoError,
				});
			}
		}

		console.log(
			`\n🏁 Completed processing all ${parsedPrompt.repositories.length} repositories`
		);

		// Combine all analysis results
		let combinedAnalysisResult = {
			success: true,
			total_repositories: parsedPrompt.repositories.length,
			successful_repositories: 0,
			failed_repositories: 0,
			repositories: [] as any[],
		};

		for (const repoResult of allRepositoryResults) {
			if (repoResult.success && repoResult.analysisResult?.repositories) {
				// Add repositories from this analysis and count properly
				for (const repo of repoResult.analysisResult.repositories) {
					combinedAnalysisResult.repositories.push(repo);
					if (repo.validation_passed) {
						combinedAnalysisResult.successful_repositories++;
					} else {
						combinedAnalysisResult.failed_repositories++;
					}
				}
			} else if (!repoResult.success && repoResult.analysisResult?.repositories) {
				// Add error repositories
				for (const repo of repoResult.analysisResult.repositories) {
					combinedAnalysisResult.repositories.push(repo);
					combinedAnalysisResult.failed_repositories++;
				}
			} else if (!repoResult.success) {
				// Handle cases where we have an error but no analysis result
				combinedAnalysisResult.failed_repositories++;
			}
		}

		// Use the combined analysis result for final completion message
		const analysisResult = combinedAnalysisResult;

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

// Enhanced processing function for continued prompts (skips initial database creation)
async function processContinuedPromptRequest(
	runId: string,
	parsedPrompt: {
		repositories: Array<{ org: string; name: string }>;
		actionIntent: string;
		originalPrompt: string;
	}
) {
	console.log(`🔄 Starting continued processing for run ${runId}`);

	try {
		console.log(
			`🔄 Processing ${parsedPrompt.repositories.length} repositories sequentially (continued)...`
		);

		// Process each repository individually (same logic as processCustomPromptRequest but skip initial DB creation)
		const allRepositoryResults = [];

		for (let i = 0; i < parsedPrompt.repositories.length; i++) {
			const repo = parsedPrompt.repositories[i];
			const repoFullName = `${repo.org}/${repo.name}`;

			console.log(
				`\n📦 Processing repository ${i + 1}/${parsedPrompt.repositories.length}: ${repoFullName} (continued)`
			);

			// Step 1: Run the main janitor agent for this repository (outside try-catch to preserve response)
			let janitorResponse = null;
			let analysisResult = null;

			try {
				const customPrompt = generateRepositoryPrompt(parsedPrompt.actionIntent, repo);
				console.log(`📝 Repository prompt: "${customPrompt.substring(0, 100)}..."`);
				console.log(`Repository: ${repoFullName}...`);

				const janitorAgent = mastra.getAgent("janitor");
				janitorResponse = await janitorAgent.generate(customPrompt, {
					maxSteps: 20,
				});

				console.log(`✅ Janitor agent completed processing for ${repoFullName}`);

				// Step 2: Use analyzer agent to get structured results for this repository
				console.log(`\n--------------------------------`);
				console.log(`RESULT ANALYZER FOR ${repoFullName}`);
				console.log(`--------------------------------\n`);

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

				const analysisPrompt = `Analyze the following repository operation results for ONLY this specific repository: ${repoFullName}

Original Prompt: ${parsedPrompt.originalPrompt}
Repository to Analyze: ${repoFullName}

Agent Response:
${janitorResponse.text}

Tool Calls and Results:
${JSON.stringify(allToolCalls, null, 2)}

Tool Results Details:
${JSON.stringify(allToolResults, null, 2)}

IMPORTANT: Only provide analysis for the repository "${repoFullName}". 
If the tool results contain multiple repositories, only analyze the results relevant to "${repoFullName}".
Your response must contain exactly ONE repository result for "${repoFullName}".

Please provide a structured analysis of what happened, focusing on:
1. Whether validation ultimately passed or failed for this specific repository: ${repoFullName}
2. What actions were performed for this repository
3. Any PR information for this repository
4. Error details if applicable

Be precise about validation_passed - only set to true if final validation actually succeeded for ${repoFullName}.`;

				// Try analyzer with structured output, but catch schema validation errors
				try {
					const analysisResponse = await analyzerAgent.generate(analysisPrompt, {
						output: analysisResultSchema,
					});

					console.log(`✅ Analysis completed for ${repoFullName}`);

					// Extract the structured analysis
					analysisResult = (analysisResponse as any).object || analysisResponse;
					console.log(
						`🔍 ANALYSIS RESULT FOR ${repoFullName}:\n`,
						JSON.stringify(analysisResult, null, 2)
					);
				} catch (analyzerError) {
					console.error(
						`❌ Analyzer schema validation failed for ${repoFullName}:`,
						analyzerError
					);

					// Fallback: Try analyzer without structured output to get raw response
					try {
						const fallbackAnalysisResponse =
							await analyzerAgent.generate(analysisPrompt);
						console.log(
							`⚠️  Analyzer fallback completed for ${repoFullName} (raw text)`
						);
						console.log(`📝 Raw analyzer response: ${fallbackAnalysisResponse.text}`);

						// Create a manual analysis result since schema validation failed
						analysisResult = {
							success: false,
							total_repositories: 1,
							successful_repositories: 0,
							failed_repositories: 1,
							repositories: [
								{
									repository: repoFullName,
									action: "error",
									status: "error",
									validation_passed: false,
									error_message: `Analyzer schema validation failed: ${analyzerError instanceof Error ? analyzerError.message : String(analyzerError)}`,
									details: `Analysis could not be parsed. Raw analyzer response: ${fallbackAnalysisResponse.text?.substring(0, 500) || "No response text"}...`,
								},
							],
							summary: "Analysis failed due to schema validation error",
							notes: `Original analyzer error: ${analyzerError instanceof Error ? analyzerError.message : String(analyzerError)}. Raw response preserved in janitor_response field.`,
						};
					} catch (fallbackError) {
						console.error(
							`❌ Analyzer fallback also failed for ${repoFullName}:`,
							fallbackError
						);

						// Create a manual error result
						analysisResult = {
							success: false,
							total_repositories: 1,
							successful_repositories: 0,
							failed_repositories: 1,
							repositories: [
								{
									repository: repoFullName,
									action: "error",
									status: "error",
									validation_passed: false,
									error_message: `Complete analyzer failure: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
									details: `Both structured and fallback analysis failed. Check janitor_response for raw output.`,
								},
							],
							summary: "Analysis completely failed",
							notes: `Analyzer errors: ${analyzerError instanceof Error ? analyzerError.message : String(analyzerError)} / ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
						};
					}
				}

				// ⚡ IMMEDIATE DATABASE UPDATE - Same logic as original function
				if (
					analysisResult?.repositories &&
					Array.isArray(analysisResult.repositories) &&
					analysisResult.repositories.length > 0
				) {
					const repoAnalysis = analysisResult.repositories[0];
					const validationStatus: "success" | "failed" = repoAnalysis.validation_passed
						? "success"
						: "failed";

					console.log(
						`📊 Repository ${repoFullName}: ${repoAnalysis.status} (validation_passed: ${repoAnalysis.validation_passed}) -> database status: ${validationStatus}`
					);

					const dataToStore = {
						validation_status: validationStatus,
						results_json: {
							status: repoAnalysis.status,
							action: repoAnalysis.action,
							details: repoAnalysis.details,
							validation_passed: repoAnalysis.validation_passed,
							pr_status: repoAnalysis.pr_status,
							pr_url: repoAnalysis.pr_url,
							error_message: repoAnalysis.error_message,
							timestamp: new Date().toISOString(),
							repository: repoFullName,
							janitor_response: janitorResponse?.text || null,
							full_analysis: analysisResult,
							continued: true, // Mark as continued run
						},
						original_prompt: parsedPrompt.originalPrompt,
					};

					console.log(
						`🔍 STORING IN DATABASE IMMEDIATELY (continued):`,
						JSON.stringify(dataToStore, null, 2)
					);
					await updateValidationResult(runId, repo.name, dataToStore);
					console.log(`✅ Enhanced validation result updated successfully`);
					console.log(`✅ Stored result for ${repoFullName}: ${validationStatus}`);
				} else {
					console.error(`❌ Invalid analysis structure for repository ${repoFullName}`);
					await updateValidationResult(runId, repo.name, {
						validation_status: "failed",
						results_json: {
							status: "failed",
							error: "Analysis failed - invalid structure",
							timestamp: new Date().toISOString(),
							repository: repoFullName,
							janitor_response: janitorResponse?.text || null,
							analysis_error: JSON.stringify(analysisResult),
							continued: true, // Mark as continued run
						},
						original_prompt: parsedPrompt.originalPrompt,
					});
					console.log(`✅ Stored invalid analysis result for ${repoFullName}: failed`);
				}

				// Store the result for final summary
				allRepositoryResults.push({
					repository: repo,
					janitorResponse,
					analysisResult,
					success: true,
				});
			} catch (repoError) {
				console.error(`❌ Error processing repository ${repoFullName}:`, repoError);

				// ⚡ IMMEDIATE DATABASE UPDATE FOR ERROR - PRESERVE JANITOR RESPONSE
				await updateValidationResult(runId, repo.name, {
					validation_status: "failed",
					results_json: {
						status: "error",
						error: repoError instanceof Error ? repoError.message : String(repoError),
						timestamp: new Date().toISOString(),
						repository: repoFullName,
						janitor_response: janitorResponse?.text || null, // PRESERVE janitor response
						analyzer_error: "Error occurred before or during analysis",
						full_error_stack:
							repoError instanceof Error ? repoError.stack : String(repoError),
						continued: true, // Mark as continued run
					},
					original_prompt: parsedPrompt.originalPrompt,
				});
				console.log(`✅ Stored error result for ${repoFullName}: failed`);

				// Store error result for final summary
				allRepositoryResults.push({
					repository: repo,
					janitorResponse: janitorResponse, // PRESERVE janitor response
					analysisResult: {
						success: false,
						total_repositories: 1,
						successful_repositories: 0,
						failed_repositories: 1,
						repositories: [
							{
								repository: repoFullName,
								action: "error",
								status: "error",
								validation_passed: false,
								error_message:
									repoError instanceof Error
										? repoError.message
										: String(repoError),
								details: `Processing failed: ${repoError instanceof Error ? repoError.message : String(repoError)}`,
							},
						],
					},
					success: false,
					error: repoError,
				});
			}
		}

		console.log(
			`\n🏁 Completed continued processing for all ${parsedPrompt.repositories.length} repositories`
		);

		const successfulRepos = allRepositoryResults.filter(r => r.success).length;
		const totalRepos = parsedPrompt.repositories.length;
		console.log(
			`🎉 Completed continued processing for run ${runId} - ${successfulRepos}/${totalRepos} successful`
		);
	} catch (error) {
		console.error(`❌ Error in continued processing for run ${runId}:`, error);

		// Mark all repositories as failed due to processing error
		for (const repo of parsedPrompt.repositories) {
			await updateValidationResult(runId, repo.name, {
				validation_status: "failed",
				results_json: {
					status: "failed",
					error: error instanceof Error ? error.message : String(error),
					timestamp: new Date().toISOString(),
					repository: `${repo.org}/${repo.name}`,
					continued: true, // Mark as continued run
				},
				original_prompt: parsedPrompt.originalPrompt,
			});
		}
	}
}

// Global error handler (must be last middleware)
app.use((err: any, req: Request, res: Response, next: any) => {
	console.error("❌ Unhandled server error:", err.message);
	console.error("Stack:", err.stack);

	if (!res.headersSent) {
		res.status(500).json({
			error: "Internal server error",
			message: "The server encountered an unexpected error processing your request",
			timestamp: new Date().toISOString(),
		});
	}
});

// Start the server
app.listen(PORT, () => {
	console.log(`🚀 Janitor Mastra Server running on port ${PORT}`);
	console.log(`🔗 Health check: http://localhost:${PORT}/health`);
	console.log(`📋 API endpoint: http://localhost:${PORT}/api/prompt`);
	console.log(`📊 Results endpoint: http://localhost:${PORT}/api/results/:runId`);
	console.log("");
	console.log("✅ Server ready to accept natural language validation requests!");
});
