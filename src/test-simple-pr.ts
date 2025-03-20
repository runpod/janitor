// Minimal test for the Repository PR Agent
import { repositoryPRAgent } from "./mastra/agents/repository-pr-agent";
import path from "path";
import fs from "fs";

// Set environment variables for debugging
process.env.DEBUG = "mcp:*";
process.env.MCP_DEBUG = "1";
process.env.MASTRA_DEBUG = "1";
process.env.MASTRALOGGING = "debug";

// Create a log file
const logFile = path.resolve("pr-agent-test.log");
fs.writeFileSync(logFile, "=== PR Agent Test Log ===\n\n");

function log(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  fs.appendFileSync(logFile, logMessage + "\n");
}

async function main(): Promise<void> {
  log("Testing Repository PR Agent");
  log(`GitHub token available: ${!!process.env.GITHUB_PERSONAL_ACCESS_TOKEN}`);

  // Generate a unique timestamp for the branch
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:\.T]/g, "")
    .slice(0, 14);
  log(`Using timestamp: ${timestamp}`);

  try {
    // Simple prompt to test the agent
    const prompt = `
      Create a PR for the repository TimPietrusky/worker-basic located at ${path.resolve("test-repo")}.
      
      The fixes include:
      - Added python3-pip to Dockerfile
      - Updated dependencies in requirements.txt
      
      Use a unique branch name with this timestamp: ${timestamp} to avoid conflicts.
      
      IMPORTANT: Instead of using github_create_or_update_file for each file, use github_push_files to push all files at once.
      First create a branch, then collect all the files from the repository directory, and push them all at once with github_push_files.
      This will avoid conflicts with individual file updates.
    `;

    log("Sending prompt to agent...");

    // Call the agent
    const result = await repositoryPRAgent.generate(prompt);

    // Display the result
    log("Agent response received");
    fs.appendFileSync(logFile, "\nAgent response:\n" + result.text + "\n");

    log("Test completed successfully!");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`Error: ${errorMessage}`);
    if (error instanceof Error && error.stack) {
      fs.appendFileSync(logFile, "\nError stack trace:\n" + error.stack + "\n");
    }
  }
}

main();
