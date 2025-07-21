import { config } from "dotenv";
import { and, desc, eq } from "drizzle-orm";

import { db, validationResults } from "../db/index.js";

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

// Store validation result using Drizzle
export async function storeValidationResult(result: ValidationResult) {
	try {
		const [insertedResult] = await db
			.insert(validationResults)
			.values({
				runId: result.run_id,
				repositoryName: result.repository_name,
				organization: result.organization,
				validationStatus: result.validation_status,
				resultsJson: result.results_json,
			})
			.returning();

		console.log("✅ Validation result stored successfully:", insertedResult.id);
		return insertedResult;
	} catch (error) {
		console.error("Failed to store validation result:", error);
		throw error;
	}
}

// Update validation result status using Drizzle
export async function updateValidationResult(
	runId: string,
	repositoryName: string,
	updates: Partial<ValidationResult>
) {
	try {
		const [updatedResult] = await db
			.update(validationResults)
			.set({
				...(updates.validation_status && { validationStatus: updates.validation_status }),
				...(updates.results_json && { resultsJson: updates.results_json }),
			})
			.where(
				and(
					eq(validationResults.runId, runId),
					eq(validationResults.repositoryName, repositoryName)
				)
			)
			.returning();

		console.log("✅ Validation result updated successfully");
		return updatedResult;
	} catch (error) {
		console.error("Failed to update validation result:", error);
		throw error;
	}
}

// Get validation results by run ID using Drizzle
export async function getValidationResults(runId: string) {
	try {
		const results = await db
			.select()
			.from(validationResults)
			.where(eq(validationResults.runId, runId))
			.orderBy(desc(validationResults.createdAt));

		return results;
	} catch (error) {
		console.error("Failed to fetch validation results:", error);
		throw error;
	}
}

// Get validation results by repository name using Drizzle
export async function getValidationResultsByRepo(repositoryName: string) {
	try {
		const results = await db
			.select()
			.from(validationResults)
			.where(eq(validationResults.repositoryName, repositoryName))
			.orderBy(desc(validationResults.createdAt))
			.limit(10); // Get last 10 results

		return results;
	} catch (error) {
		console.error("Failed to fetch validation results:", error);
		throw error;
	}
}
