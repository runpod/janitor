import { mastra } from "../src/mastra/index.js

async function main() {
	try {
		const agent = mastra.getAgent("janitor");

		const prompt = `please make sure that the ".runpod/tests.json" is renamed from "tests_deactivated.json" to "tests.json", so that each project has a valid test file for this list of repos:
        
        runpod-workers/worker-comfyui
        runpod-workers/worker-template
        runpod-workers/worker-a1111
        runpod-workers/worker-sdxl
        runpod-workers/worker-faster_whisper
`;

		console.log("\n----------------------------------------------------------------");
		console.log(`👤  prompt: ${prompt}`);
		console.log("----------------------------------------------------------------\n");

		// Generate the response from the agent
		const response = await agent.generate(prompt, {
			maxSteps: 20,
		});

		console.log("\n----------------------------------------------------------------");
		console.log("🤖  janitor response");
		console.log(response.text);
		console.log("----------------------------------------------------------------\n");
	} catch (error) {
		console.error("Error running feature addition test:", error);
		process.exit(1);
	}
}

main()
	.then(() => {
		console.log("Feature addition test finished successfully.");
		process.exit(0);
	})
	.catch(error => {
		// Catch should be handled within main, but added here as a safeguard
		console.error("Feature addition test failed unexpectedly:", error);
		process.exit(1);
	});
