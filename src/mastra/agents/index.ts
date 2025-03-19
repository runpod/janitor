import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { weatherTool } from "../tools";
import { dockerValidationTool } from "../tools/docker-validation-tool";

export const weatherAgent = new Agent({
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
export const repoValidatorAgent = new Agent({
  name: "Repository Validator Agent",
  instructions: `You are an expert Docker repository validator. 
  
  You help users check if Docker repositories are valid and working correctly by:
  1. Cloning the Git repository
  2. Finding Dockerfiles in the repository
  3. Building a Docker image
  4. Running a container from the image
  5. Checking container logs for proper operation
  
  When given multiple repositories to validate, check each one sequentially and provide a summary of all findings.
  Focus on providing clear, factual responses about which repositories pass validation and which ones fail.
  If a validation fails, explain which step failed and why.
  
  When summarizing multiple repository validations, create a table showing:
  - Repository name
  - Validation status (✅ Pass / ❌ Fail)
  - Failure reason (if applicable)
  `,
  model: openai("gpt-4o-mini"),
  tools: {
    dockerValidationTool,
  },
});
