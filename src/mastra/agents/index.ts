import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { Agent } from "@mastra/core/agent";
import { weatherTool } from "../tools";
import { dockerValidationTool } from "../tools/docker-validation-tool";
import { repositoryRepairTool } from "../tools/repository-repair-tool.js";
import {
  fileReadTool,
  listDirectoryTool,
  fileSearchTool,
  editFileTool,
} from "../tools/file-system-tools.js";
import { createRepositoryRepairAgent } from "./repository-repair-agent.js";
import { createRepositoryPRTool } from "../tools/repository-pr-tool.js";
import { createRepositoryPRAgent } from "./repository-pr-agent.js";

const weatherAgent = new Agent({
  name: "Weather Agent",
  instructions: `
      You are a helpful weather assistant that provides accurate weather information.

      Your primary function is to help users get weather details for specific locations. When responding:
      - Always ask for a location if none is provided
      - If giving a location with multiple parts (e.g. "New York, NY"), use the most relevant part (e.g. "New York")
      - Include relevant details like humidity, wind conditions, and precipitation
      - Keep responses concise but informative

      Use the weatherTool to fetch current weather data.
`,
  model: openai("gpt-4o-mini"),
  tools: { weatherTool },
});

// Define the repository validator agent
const repoValidatorAgent = new Agent({
  name: "Repository Validator Agent",
  instructions: `You are an expert Docker repository validator and fixer. 
  
  You help users check if Docker repositories are valid and working correctly by:
  1. Cloning the Git repository
  2. Finding Dockerfiles in the repository
  3. Building a Docker image
  4. Running a container from the image
  5. Checking container logs for proper operation
  
  When validation fails, you can automatically repair common issues using your repair tools.
  When fixing repositories:
  - First, try to understand the root cause of the failure
  - Use the Repository Repair tool to fix the issues
  - When the repair tool returns with needsRevalidation=true, IMMEDIATELY re-validate the repository using the dockerValidationTool
  - Pass the exact same repository path (repoPath) back to the dockerValidationTool
  - If validation still fails after repair, try repairing again with more specific instructions
  - Repeat this validate → repair → validate loop until the repository passes or you've tried at least 3 repair attempts
  - Explain the fixes that were applied
  
  IMPORTANT: For proper loop behavior, always follow this exact pattern:
  1. Validate repository with dockerValidationTool
  2. If validation fails, use repositoryRepairTool 
  3. Check if repositoryRepairTool returned needsRevalidation=true
  4. If needsRevalidation=true, IMMEDIATELY re-validate the same repository using dockerValidationTool
  5. Continue this loop until validation succeeds or you've tried 3 repair attempts
  
  When given multiple repositories to validate, check each one sequentially and provide a summary of all findings.
  Focus on providing clear, factual responses about which repositories pass validation and which ones fail.
  If a validation fails, explain which step failed and why.
  
  When summarizing multiple repository validations, create a table showing:
  - Repository name
  - Validation status (✅ Pass / ❌ Fail)
  - Repair status (🔧 Fixed / ⚠️ Unfixable) - if repair was attempted
  - Failure/fix details
  `,
  model: openai("gpt-4o"),
  tools: {
    dockerValidationTool,
    repositoryRepairTool,
  },
});

// Create the repository repair agent
const repositoryRepairAgent = createRepositoryRepairAgent();

// Create the repository PR agent
const repositoryPRAgent = createRepositoryPRAgent();

// Export all agents
export {
  weatherAgent,
  repoValidatorAgent,
  repositoryRepairAgent,
  repositoryPRAgent,
};
