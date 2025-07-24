import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import dotenv from "dotenv";
import { setTimeout } from "timers/promises";

// Load environment variables
dotenv.config({ path: ".env" });

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";

const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_ANON_KEY || "");

async function testServerStructuredOutput() {
	console.log("\n================================================================");
	console.log("🌐  TESTING SERVER API WITH STRUCTURED OUTPUT");
	console.log("================================================================");
	console.log(`Server URL: ${SERVER_URL}`);
	console.log("================================================================\n");

	try {
		// Test repository - you can change this
		const testRepo = process.argv[2] || "TimPietrusky/worker-basic";
		const prompt = `validate ${testRepo}`;

		console.log(`📝 Testing with prompt: "${prompt}"`);
		console.log("🚀 Sending POST request to /api/prompt...\n");

		// Send validation request
		const response = await axios.post(
			`${SERVER_URL}/api/prompt`,
			{
				message: prompt,
			},
			{
				headers: {
					"Content-Type": "application/json",
				},
				timeout: 10000,
			}
		);

		const { runId, status, message } = response.data;
		console.log("✅ Prompt request sent successfully!");
		console.log(`📊 Run ID: ${runId}`);
		console.log(`📊 Status: ${status}`);
		console.log(`📊 Message: ${message}\n`);

		// Wait for results with cleaner polling
		console.log("⏳ Waiting for agent processing to complete...");
		let attempt = 0;
		const maxAttempts = 60; // Wait up to 5 minutes (60 * 5s = 5min)
		let results: any[] = [];
		let lastStatus = "waiting"; // Track status changes
		let lastCompletedCount = 0;

		while (attempt < maxAttempts) {
			attempt++;

			// Wait between checks
			await setTimeout(5000);

			// Check for results
			const { data: currentResults, error: fetchError } = await supabase
				.from("validation_results")
				.select("*")
				.eq("run_id", runId);

			if (fetchError) {
				console.error("❌ Error checking results:", fetchError);
				continue;
			}

			results = currentResults || [];

			if (results.length > 0) {
				// Check if processing is complete (not "running" or "queued")
				const completedResults = results.filter(
					(r: any) =>
						r.validation_status !== "running" && r.validation_status !== "queued"
				);

				if (completedResults.length === results.length) {
					// All processing completed!
					console.log(`✅ Processing completed after ${attempt * 5} seconds`);
					break;
				}

				// Show update only if status changed
				if (lastStatus === "waiting") {
					console.log(`📋 Results found, processing in progress...`);
					lastStatus = "processing";
					lastCompletedCount = completedResults.length;
				} else if (completedResults.length > lastCompletedCount) {
					console.log(
						`📈 Progress: ${completedResults.length}/${results.length} completed`
					);
					lastCompletedCount = completedResults.length;
				}

				// Heartbeat every minute (12 * 5s = 60s) only if no status changes
				if (attempt % 12 === 0 && completedResults.length === lastCompletedCount) {
					console.log(
						`💓 Still processing... (${Math.round((attempt * 5) / 60)} min elapsed)`
					);
				}
			} else {
				// Show heartbeat every minute when waiting for results
				if (attempt % 12 === 0) {
					console.log(
						`💓 Still waiting for results... (${Math.round((attempt * 5) / 60)} min elapsed)`
					);
				}
			}
		}

		// Check if we have completed results
		const completedResults = results.filter(
			(r: any) => r.validation_status !== "running" && r.validation_status !== "queued"
		);

		if (results.length === 0) {
			console.error("❌ Timeout: No results found after 5 minutes");
			process.exit(1);
		}

		if (completedResults.length < results.length) {
			console.error(
				`❌ Timeout: Processing incomplete after 5 minutes (${completedResults.length}/${results.length} completed)`
			);
			process.exit(1);
		}

		// Display results
		console.log("📊 FINAL RESULTS ANALYSIS:");
		console.log("==========================");
		console.log(`Total results: ${results.length}\n`);

		results.forEach((result: any, index: number) => {
			console.log(`${index + 1}. Repository: ${result.repository_name}`);
			console.log(`   Organization: ${result.organization}`);
			console.log(`   Validation Status: ${result.validation_status}`);
			console.log(`   Created: ${result.created_at}`);

			if (result.results_json) {
				console.log(`   Details:`);

				// Parse and display the structured results
				const details = result.results_json;
				if (details.status) console.log(`     - Status: ${details.status}`);
				if (details.action) console.log(`     - Action: ${details.action}`);
				if (details.validation_passed !== undefined) {
					console.log(`     - Validation Passed: ${details.validation_passed}`);
				}
				if (details.details) console.log(`     - Details: ${details.details}`);
				if (details.pr_status) console.log(`     - PR Status: ${details.pr_status}`);
				if (details.pr_url) console.log(`     - PR URL: ${details.pr_url}`);
				if (details.error_message) console.log(`     - Error: ${details.error_message}`);
			}
			console.log("");
		});

		// Validate our structured output expectations
		console.log("🔍 STRUCTURED OUTPUT VALIDATION:");
		console.log("================================");

		let structuredOutputWorking = true;
		const issues: string[] = [];

		results.forEach((result: any) => {
			const details = result.results_json;

			// Check if we have the expected structured fields
			if (!details.hasOwnProperty("validation_passed")) {
				issues.push(`Missing 'validation_passed' field for ${result.repository_name}`);
				structuredOutputWorking = false;
			}

			if (!details.status) {
				issues.push(`Missing 'status' field for ${result.repository_name}`);
				structuredOutputWorking = false;
			}

			if (!details.action) {
				issues.push(`Missing 'action' field for ${result.repository_name}`);
				structuredOutputWorking = false;
			}

			// Check validation_status mapping
			if (details.validation_passed === true && result.validation_status !== "success") {
				issues.push(
					`Validation passed but status is not 'success' for ${result.repository_name}`
				);
				structuredOutputWorking = false;
			}

			if (details.validation_passed === false && result.validation_status !== "failed") {
				issues.push(
					`Validation failed but status is not 'failed' for ${result.repository_name}`
				);
				structuredOutputWorking = false;
			}
		});

		if (structuredOutputWorking) {
			console.log("✅ Structured output is working correctly!");
			console.log("✓ All expected fields are present");
			console.log("✓ validation_passed field correctly maps to validation_status");
			console.log("✓ Database storage is accurate");
		} else {
			console.log("❌ Issues found with structured output:");
			issues.forEach(issue => console.log(`  • ${issue}`));
		}

		console.log("\n🎉 TEST COMPLETED!");
		console.log("==================");
	} catch (error) {
		console.error("\n❌ ERROR DURING SERVER TEST:");
		console.error("============================");

		if (axios.isAxiosError(error)) {
			console.error(`HTTP Status: ${error.response?.status}`);
			console.error(`Response: ${JSON.stringify(error.response?.data, null, 2)}`);
		} else {
			console.error("Error:", error);
		}
	}
}

// Check if server is running
async function checkServerHealth() {
	try {
		console.log("🏥 Checking server health...");
		await axios.get(`${SERVER_URL}/health`, { timeout: 5000 });
		console.log("✅ Server is running!");
		return true;
	} catch (error) {
		console.log("❌ Server is not responding. Make sure to start it with:");
		console.log("   npm run start");
		console.log("   or");
		console.log("   tsx src/server.ts");
		return false;
	}
}

async function main() {
	const serverRunning = await checkServerHealth();
	if (!serverRunning) {
		process.exit(1);
	}

	await testServerStructuredOutput();
}

main()
	.then(() => {
		console.log("\n✅ Server test completed");
		process.exit(0);
	})
	.catch(error => {
		console.error("\n💥 Server test failed:", error);
		process.exit(1);
	});
