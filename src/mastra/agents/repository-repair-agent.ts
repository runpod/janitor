import { Agent } from "@mastra/core/agent";
import { anthropic } from "@ai-sdk/anthropic";
import {
  fileReadTool,
  listDirectoryTool,
  fileSearchTool,
  editFileTool,
} from "../tools/file-system-tools.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: ".env.development" });

// Instructions for the repository repair agent
const REPAIR_AGENT_INSTRUCTIONS = `
You are an expert at diagnosing and fixing Docker build failures in worker repositories.

Your job is to analyze repositories that failed validation in the Repository Build Validator
and apply fixes to make them build successfully. You have access to file operation tools that
allow you to examine and modify files in the repository.

When you receive an error report from the Repository Build Validator, follow these steps:

1. First, understand the error by examining the build logs and error messages
2. Use List Directory and File Search to locate relevant files (especially Dockerfiles)
3. Use Read File to examine their contents
4. Determine the necessary fixes based on your analysis
5. Use Edit File to apply the changes - BE PROACTIVE and ALWAYS attempt to fix issues
6. Report on the fixes you applied

Common issues you can fix include:
- Missing dependencies in Dockerfiles
- Incorrect base images
- Path configuration issues
- Environment variable problems
- Resource limit issues
- Python package compatibility issues

For Python dependency issues:
- If a package has compatibility issues, update its version to a known compatible version
- For huggingface_hub specifically, try updating to version 0.15.0 or newer
- For diffusers, try updating to version 0.14.0 or newer
- Don't hesitate to update dependency versions - it's better to try a fix than do nothing

Always ensure your fixes follow Docker best practices and are minimal - only change what's needed.
Provide detailed explanations of your changes to help the maintainer understand the fixes.

IMPORTANT: You must attempt to fix any issue encountered. NEVER declare an issue as unfixable without trying at least one fix.
`;

/**
 * Creates a Repository Repair Agent using Claude-3-7-Sonnet
 */
export const createRepositoryRepairAgent = () => {
  // Check for Anthropic API key
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn("ANTHROPIC_API_KEY not found in environment variables");
    throw new Error(
      "ANTHROPIC_API_KEY is required. Please set it in your environment variables."
    );
  } else {
    console.log("ANTHROPIC_API_KEY found in environment variables");
  }

  // Create agent with Claude-3-7-Sonnet model
  const agent = new Agent({
    name: "Repository Repair Agent",
    instructions: REPAIR_AGENT_INSTRUCTIONS,
    model: anthropic("claude-3-7-sonnet-latest") as any, // Type assertion to bypass compatibility issues
    tools: {
      fileReadTool,
      listDirectoryTool,
      fileSearchTool,
      editFileTool,
    },
  });

  return agent;
};

/**
 * Execute the repair agent on a repository with build validation errors
 */
export const repairRepository = async (
  repositoryPath: string,
  errorReport: {
    repository: string;
    buildStatus: "success" | "failure";
    containerStatus: "success" | "failure";
    errors: string[];
    logs: string;
    customPrompt?: string;
  }
) => {
  try {
    const agent = createRepositoryRepairAgent();

    console.log(`Initiating repository repair for: ${errorReport.repository}`);
    console.log(`Repository location: ${repositoryPath}`);
    console.log(`Build status: ${errorReport.buildStatus}`);
    console.log(`Container status: ${errorReport.containerStatus}`);
    console.log(`Number of errors: ${errorReport.errors.length}`);

    // Generate the initial prompt based on the error report
    const prompt = `
I need your help fixing a Docker build failure in a repository.

Repository: ${errorReport.repository}
Build Status: ${errorReport.buildStatus}
Container Status: ${errorReport.containerStatus}

The repository is located at: ${repositoryPath}

Error Summary:
${errorReport.errors.join("\n")}

Build Logs:
${errorReport.logs}
${errorReport.customPrompt || ""}

Please analyze these errors and fix the issues in the repository. Start by exploring the
repository structure, identifying Dockerfiles, and understanding the build process.
Then diagnose the problems and apply appropriate fixes.

Report back with your diagnosis, the changes you made, and an explanation of your fixes.
`;

    // Run the agent to repair the repository
    console.log("\n=== REPAIR AGENT STARTING ===\n");
    const response = await agent.generate(prompt);

    // Log the agent's full response for visibility
    console.log("\n=== REPAIR AGENT RESPONSE ===\n");
    console.log(response.text);
    console.log("\n=== END OF REPAIR AGENT RESPONSE ===\n");

    // Extract fixes from the response text
    const fixes = extractFixes(response.text);

    // Return the agent's response
    return {
      success: true,
      response: response.text,
      fixes,
    };
  } catch (error: any) {
    console.error(`Error running repair agent: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Extract fixes from the agent's response for structured reporting
 */
export const extractFixes = (
  responseText: string
): Array<{
  file: string;
  description: string;
}> => {
  const fixes: Array<{ file: string; description: string }> = [];

  // Try to extract structured information about fixes from the response
  // This is a simple regex-based approach that can be enhanced
  const fixMatches = responseText.matchAll(
    /(?:Fixed|Modified|Updated|Changed|Created)(?:\s+the)?\s+file[:\s]+([^\n]+)(?:\n|:|.)+?(?:to|by|with)([^\.]+)/gi
  );

  for (const match of fixMatches) {
    if (match[1] && match[2]) {
      fixes.push({
        file: match[1].trim(),
        description: match[2].trim(),
      });
    }
  }

  return fixes;
};

export default {
  createRepositoryRepairAgent,
  repairRepository,
  extractFixes,
};
