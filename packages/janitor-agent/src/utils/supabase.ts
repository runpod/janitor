import { config } from "dotenv";

// Load environment variables
config();

// Type definitions for validation results
export interface ValidationResult {
	id?: string;
	run_id: string;
	repository_name: string;
	organization: string;
	validation_status: "success" | "failed" | "running";
	results_json: any;
	created_at?: string;
}

// Supabase REST API configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

const REST_API_URL = `${SUPABASE_URL}/rest/v1`;

// Helper function to make REST API requests
async function supabaseRequest(endpoint: string, options: RequestInit = {}) {
	const url = `${REST_API_URL}${endpoint}`;
	const response = await fetch(url, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			'apikey': SUPABASE_SERVICE_KEY,
			'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
			'Prefer': 'return=representation',
			...options.headers,
		},
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Supabase API error: ${response.status} ${error}`);
	}

	return response.json();
}

// Store validation result using REST API
export async function storeValidationResult(result: ValidationResult) {
	try {
		const payload = {
			run_id: result.run_id,
			repository_name: result.repository_name,
			organization: result.organization,
			validation_status: result.validation_status,
			results_json: result.results_json,
		};

		const [insertedResult] = await supabaseRequest('/validation_results', {
			method: 'POST',
			body: JSON.stringify(payload),
		});

		console.log("✅ Validation result stored successfully:", insertedResult.id);
		return insertedResult;
	} catch (error) {
		console.error("Failed to store validation result:", error);
		throw error;
	}
}

// Update validation result status using REST API
export async function updateValidationResult(
	runId: string,
	repositoryName: string,
	updates: Partial<ValidationResult>
) {
	try {
		const payload: any = {};
		if (updates.validation_status) payload.validation_status = updates.validation_status;
		if (updates.results_json) payload.results_json = updates.results_json;

		const updatedResults = await supabaseRequest(
			`/validation_results?run_id=eq.${runId}&repository_name=eq.${repositoryName}`,
			{
				method: 'PATCH',
				body: JSON.stringify(payload),
			}
		);

		console.log("✅ Validation result updated successfully");
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
