import { mastra } from "./mastra";

// List of repositories to validate
const repositories = ["runpod-workers/worker-basic"];

async function validateMultipleRepositories(repos: string[]) {
	// Get agent from mastra instance
	const agent = mastra.getAgent("repositoryValidatorAgent");
	if (!agent) {
		throw new Error("Repository Validator Agent not found");
	}

	// Create a prompt asking to validate multiple repositories
	const repoList = repos.map(repo => `- ${repo}`).join("\n");
	const prompt = `Please validate the following Docker repositories with the command "echo 'Hello from Docker container!'" and provide a summary of which ones pass and which ones fail:\n${repoList}`;

	console.log("Sending prompt to agent:", prompt);

	// Generate a response using the agent with tool calling
	const response = await agent.generate(prompt);

	console.log("\n--- AGENT RESPONSE ---\n");
	console.log(response.text);

	return response.text;
}

async function main() {
	console.log("Starting validation of multiple Docker repositories...");
	console.log("Repositories to validate:", repositories);

	try {
		await validateMultipleRepositories(repositories);
	} catch (error) {
		console.error("Error validating repositories:", error);
	}
}

// Run the validation
main().catch(console.error);
