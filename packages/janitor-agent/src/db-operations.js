#!/usr/bin/env node

import { Client } from "pg";

// Get database credentials from environment variables
// The agent should NEVER fetch credentials itself - they should be provided
async function getDatabaseCredentials() {
	// All database credentials should be provided as environment variables
	// The agent does NOT make any AWS calls

	const requiredEnvVars = [
		"DATABASE_HOST",
		"DATABASE_PASSWORD",
		"DATABASE_USER",
		"DATABASE_NAME",
	];

	for (const envVar of requiredEnvVars) {
		if (!process.env[envVar]) {
			throw new Error(
				`Missing required environment variable: ${envVar}. Database credentials should be provided to the agent, not fetched by it.`
			);
		}
	}

	return {
		host: process.env.DATABASE_HOST,
		port: parseInt(process.env.DATABASE_PORT || "5432"),
		database: process.env.DATABASE_NAME,
		user: process.env.DATABASE_USER,
		password: process.env.DATABASE_PASSWORD,
	};
}

// Create database connection
async function createDatabaseConnection(config) {
	const client = new Client({
		host: config.host,
		port: config.port,
		database: config.database,
		user: config.user,
		password: config.password,
		ssl: {
			rejectUnauthorized: false, // Aurora requires SSL
		},
	});

	await client.connect();
	return client;
}

// Start a new validation run
async function startValidationRun(environment, instanceId, repositoryCount, reposFilePath) {
	const config = await getDatabaseCredentials();
	const client = await createDatabaseConnection(config);

	try {
		const result = await client.query(
			`INSERT INTO validation_runs (environment, instance_id, repository_count, repos_file_path, started_at) 
             VALUES ($1, $2, $3, $4, NOW()) 
             RETURNING run_id::text`,
			[environment, instanceId, repositoryCount, reposFilePath]
		);

		return result.rows[0].run_id;
	} finally {
		await client.end();
	}
}

// Complete a validation run
async function completeValidationRun(runId, status) {
	const config = await getDatabaseCredentials();
	const client = await createDatabaseConnection(config);

	try {
		await client.query(
			`UPDATE validation_runs 
             SET status = $1, completed_at = NOW() 
             WHERE run_id = $2`,
			[status, runId]
		);
	} finally {
		await client.end();
	}
}

// Store repository validation result
async function storeRepositoryValidation(
	runId,
	repositoryName,
	organization,
	validationStatus,
	validationType,
	buildSuccess,
	containerExecutionSuccess,
	gpuAvailable,
	cudaDetected,
	errorMessage,
	executionTimeSeconds
) {
	const config = await getDatabaseCredentials();
	const client = await createDatabaseConnection(config);

	try {
		const result = await client.query(
			`INSERT INTO repository_validations (
                run_id, repository_name, organization, validation_status, validation_type,
                build_success, container_execution_success, gpu_available, cuda_detected,
                error_message, execution_time_seconds
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id`,
			[
				runId,
				repositoryName,
				organization,
				validationStatus,
				validationType,
				buildSuccess,
				containerExecutionSuccess,
				gpuAvailable,
				cudaDetected,
				errorMessage,
				executionTimeSeconds,
			]
		);

		return result.rows[0].id;
	} finally {
		await client.end();
	}
}

// Store validation report
async function storeValidationReport(validationId, reportType, reportData) {
	const config = await getDatabaseCredentials();
	const client = await createDatabaseConnection(config);

	try {
		await client.query(
			`INSERT INTO validation_reports (validation_id, report_type, report_data) 
             VALUES ($1, $2, $3)`,
			[validationId, reportType, JSON.stringify(reportData)]
		);
	} finally {
		await client.end();
	}
}

// CLI interface for entrypoint.sh to call
async function main() {
	const command = process.argv[2];

	try {
		switch (command) {
			case "start-run":
				const environment = process.argv[3];
				const instanceId = process.argv[4];
				const repositoryCount = parseInt(process.argv[5]);
				const reposFilePath = process.argv[6];

				const runId = await startValidationRun(
					environment,
					instanceId,
					repositoryCount,
					reposFilePath
				);
				console.log(runId);
				break;

			case "complete-run":
				const runIdToComplete = process.argv[3];
				const status = process.argv[4];

				await completeValidationRun(runIdToComplete, status);
				console.log("completed");
				break;

			case "store-repo":
				const storeArgs = process.argv.slice(3);
				const validationId = await storeRepositoryValidation(...storeArgs);
				console.log(validationId);
				break;

			case "store-report":
				const validationIdForReport = parseInt(process.argv[3]);
				const reportType = process.argv[4];
				const reportDataPath = process.argv[5];

				const fs = await import("fs");
				const reportData = JSON.parse(fs.readFileSync(reportDataPath, "utf8"));

				await storeValidationReport(validationIdForReport, reportType, reportData);
				console.log("stored");
				break;

			default:
				console.error("Unknown command:", command);
				process.exit(1);
		}
	} catch (error) {
		console.error("Database operation failed:", error.message);
		process.exit(1);
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}
