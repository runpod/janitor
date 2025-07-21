import { config } from "dotenv";

import { mastra } from "./mastra/index.js";
import { testPromptParser } from "./utils/prompt-parser.js";

// Load environment variables
config();

async function main() {
	console.log("🧪 Janitor Agent Local Testing");
	console.log("==============================");

	// Test prompt parser
	console.log("\n1. Testing prompt parser...");
	testPromptParser();

	// Test agent interaction
	console.log("\n2. Testing agent interaction...");

	try {
		const agent = mastra.getAgent("janitor");
		console.log("✅ Janitor agent loaded successfully");

		// Example validation (you can customize this)
		if (process.argv[2]) {
			const prompt = process.argv.slice(2).join(" ");
			console.log(`\n📤 Testing with prompt: "${prompt}"`);

			const response = await agent.generate(prompt);
			console.log("\n📥 Agent response:");
			console.log(response);
		} else {
			console.log("ℹ️  To test with a custom prompt, run:");
			console.log('   npm run start:local "validate RunPod/worker-basic"');
		}
	} catch (error) {
		console.error("❌ Error testing agent:", error);
	}
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(console.error);
}
