import { config } from "dotenv";

// Load environment variables
config();

// Enhanced type definitions for validation results with prompt tracking
export interface ValidationResult {
	id?: string;
	run_id: string;
	repository_name: string;
	organization: string;
	validation_status: "success" | "failed" | "running" | "cancelled";
	results_json: any;
	created_at?: string;
	original_prompt?: string;
	repository_prompt?: string;
}

// Supabase REST API configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

const REST_API_URL = `${SUPABASE_URL!}/rest/v1`;

// Helper function to make REST API requests
async function supabaseRequest(endpoint: string, options: RequestInit = {}) {
	const url = `${REST_API_URL}${endpoint}`;
	const response = await fetch(url, {
		...options,
		headers: {
			"Content-Type": "application/json",
			apikey: SUPABASE_SERVICE_KEY!,
			Authorization: `Bearer ${SUPABASE_SERVICE_KEY!}`,
			Prefer: "return=representation",
			...options.headers,
		},
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Supabase API error: ${response.status} ${error}`);
	}

	return response.json();
}

// Enhanced store validation result with prompt context
export async function storeValidationResult(result: ValidationResult) {
	try {
		const payload = {
			run_id: result.run_id,
			repository_name: result.repository_name,
			organization: result.organization,
			validation_status: result.validation_status,
			results_json: result.results_json,
			original_prompt: result.original_prompt,
			repository_prompt: result.repository_prompt,
		};

		const [insertedResult] = await supabaseRequest("/validation_results", {
			method: "POST",
			body: JSON.stringify(payload),
		});

		console.log("✅ Enhanced validation result stored successfully:", insertedResult.id);
		return insertedResult;
	} catch (error) {
		console.error("Failed to store validation result:", error);
		throw error;
	}
}

// Enhanced update validation result with prompt context
export async function updateValidationResult(
	runId: string,
	repositoryName: string,
	updates: Partial<ValidationResult>
) {
	try {
		const payload: any = {};
		if (updates.validation_status) payload.validation_status = updates.validation_status;
		if (updates.results_json) payload.results_json = updates.results_json;
		if (updates.original_prompt) payload.original_prompt = updates.original_prompt;
		if (updates.repository_prompt) payload.repository_prompt = updates.repository_prompt;

		const updatedResults = await supabaseRequest(
			`/validation_results?run_id=eq.${runId}&repository_name=eq.${repositoryName}`,
			{
				method: "PATCH",
				body: JSON.stringify(payload),
			}
		);

		console.log("✅ Enhanced validation result updated successfully");
		return updatedResults[0];
	} catch (error) {
		console.error("Failed to update validation result:", error);
		throw error;
	}
}

// Get validation results by run ID using REST API
export async function getValidationResults(runId: string) {
	try {
		const results = await supabaseRequest(
			`/validation_results?run_id=eq.${runId}&order=created_at.desc`
		);

		return results;
	} catch (error) {
		console.error("Failed to fetch validation results:", error);
		throw error;
	}
}

// Get validation results by repository name using REST API
export async function getValidationResultsByRepo(repositoryName: string) {
	try {
		const results = await supabaseRequest(
			`/validation_results?repository_name=eq.${repositoryName}&order=created_at.desc&limit=10`
		);

		return results;
	} catch (error) {
		console.error("Failed to fetch validation results:", error);
		throw error;
	}
}

// Get orphaned validation runs (running status older than threshold)
export async function getOrphanedValidationRuns(thresholdHours: number = 5) {
	try {
		const thresholdDate = new Date();
		thresholdDate.setHours(thresholdDate.getHours() - thresholdHours);
		const thresholdISO = thresholdDate.toISOString();

		const results = await supabaseRequest(
			`/validation_results?validation_status=eq.running&created_at=lt.${thresholdISO}&order=created_at.desc`
		);

		// Group by run_id for easier management
		const groupedRuns: Record<string, any[]> = {};
		for (const result of results) {
			if (!groupedRuns[result.run_id]) {
				groupedRuns[result.run_id] = [];
			}
			groupedRuns[result.run_id].push(result);
		}

		// Convert to array with run metadata
		return Object.keys(groupedRuns).map(runId => ({
			run_id: runId,
			repositories: groupedRuns[runId],
			repository_count: groupedRuns[runId].length,
			oldest_created_at: groupedRuns[runId][groupedRuns[runId].length - 1]?.created_at,
			original_prompt: groupedRuns[runId][0]?.original_prompt,
		}));
	} catch (error) {
		console.error("Failed to fetch orphaned validation runs:", error);
		throw error;
	}
}

// Get incomplete repositories for a specific run
export async function getIncompleteRepositoriesForRun(runId: string) {
	try {
		const results = await supabaseRequest(
			`/validation_results?run_id=eq.${runId}&validation_status=eq.running&order=created_at.desc`
		);

		return results;
	} catch (error) {
		console.error("Failed to fetch incomplete repositories:", error);
		throw error;
	}
}

// Cancel a validation run by marking all running repositories as cancelled
export async function cancelValidationRun(runId: string) {
	try {
		const payload = {
			validation_status: "cancelled",
			results_json: {
				status: "cancelled",
				message: "Run cancelled by user",
				timestamp: new Date().toISOString(),
			},
		};

		const updatedResults = await supabaseRequest(
			`/validation_results?run_id=eq.${runId}&validation_status=eq.running`,
			{
				method: "PATCH",
				body: JSON.stringify(payload),
			}
		);

		console.log(
			`✅ Cancelled validation run ${runId}: ${updatedResults.length} repositories marked as cancelled`
		);
		return updatedResults;
	} catch (error) {
		console.error("Failed to cancel validation run:", error);
		throw error;
	}
}
