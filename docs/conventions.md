# Worker Maintainer Project Conventions

This document outlines the conventions, patterns, and lessons learned during the development of the
Worker Maintainer project. Use this as a reference for future development and to onboard new
contributors.

## Project Structure

### Directory Organization

- Place all Mastra-related code in `src/mastra/` directory
- Organize by component type:
    - Agents: `src/mastra/agents/`
    - Tools: `src/mastra/tools/`
    - Workflows: `src/mastra/workflows/`
- Keep test files with `test-` prefix in `src/` directory
- Use index files to export components from each directory

### Export Patterns

- Create agent instances in their own files (e.g., `repository-repair-agent.ts`)
- Export core agent creation functions (e.g., `createRepositoryRepairAgent`)
- Export agent instances from `src/mastra/agents/index.ts`
- Register all components in the main Mastra instance in `src/mastra/index.ts`

## Tool Implementation Approaches

### Direct Tool Integration (PREFERRED)

**ALWAYS use this approach unless you have a specific reason to use MCP servers.**

Tools should be implemented directly as Mastra tools using the `createTool` function from
`@mastra/core/tools`. This is the simplest and most efficient approach that should be used for most
use cases.

Key characteristics:

- Tools are defined in dedicated files (e.g., `git-tools.ts`, `docker-tools.ts`)
- Core functionality is implemented as standalone exportable functions
- Tools are created using `createTool` and registered with agents directly
- No separate server process is required

Example:

```typescript
// Implementation in docker-tools.ts
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// Implement core functionality as standalone functions
export const buildDockerImage = async (dockerfilePath, imageName, platform) => {
    // Implementation...
};

// Export as a tool for use with Mastra
export const dockerBuildTool = createTool({
    id: "Docker Build",
    inputSchema: z.object({
        // Schema definition...
    }),
    description: "Builds a Docker image from a Dockerfile",
    execute: async ({ context }) => {
        // Call the core function with context parameters
        return await buildDockerImage(context.dockerfilePath, context.imageName, context.platform);
    },
});
```

Usage in workflow:

```typescript
// Option 1: Import and use functions directly in workflow steps
const { buildDockerImage } = await import("../../docker-tools.js");
const result = await buildDockerImage(dockerfilePath, imageTag, platform);

// Option 2: Register and use via the agent's tools configuration
tools: {
  gitCheckoutTool,
  dockerBuildTool,
  dockerRunTool,
}
```

### MCP Server Integration (ONLY FOR SPECIFIC CASES)

**DO NOT use this approach unless you need to run tools in a separate process or integrate with
external MCP servers.**

MCP (Model Context Protocol) servers should only be used when:

1. You need to run tools in a separate process for isolation or security
2. You're integrating with external MCP servers (e.g., GitHub, third-party services)
3. You need cross-language tool execution

Key characteristics:

- Requires implementing a separate MCP server process
- Adds complexity with additional serialization/deserialization
- Requires maintaining both tool implementation and server integration
- Uses network communication between the main process and tool process

When using external MCP servers (like the GitHub server), configure them in the MCP configuration:

```typescript
const mcp = new MCPConfiguration({
    servers: {
        github: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: {
                /* environment variables */
            },
        },
    },
});
```

#### GitHub MCP Server Configuration

When working with the GitHub MCP server specifically:

1. **GitHub Personal Access Token**: Always store GitHub tokens in `.env` with the name
   `GITHUB_PERSONAL_ACCESS_TOKEN` and ensure it has appropriate repository permissions.

2. **MCP Server Configuration**: Configure the GitHub MCP server with the proper command and
   arguments based on your operating system:

    **For Windows:**

    ```typescript
    const githubMCP = new MCPConfiguration({
        id: "github-server-agent",
        servers: {
            github: {
                command: "cmd",
                args: ["/c", "npx -y @modelcontextprotocol/server-github"],
                env: {
                    GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN || "",
                },
            },
        },
    });
    ```

    **For Mac/Linux:**

    ```typescript
    const githubMCP = new MCPConfiguration({
        id: "github-server-agent",
        servers: {
            github: {
                command: "npx",
                args: ["-y", "@modelcontextprotocol/server-github"],
                env: {
                    GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN || "",
                },
            },
        },
    });
    ```

## Agent Architecture

### Agent-as-Tool Pattern (REQUIRED)

When one agent needs to use another agent, always follow the agent-as-tool pattern:

1. **Create a specialized agent creation function**:

    - Define a function in the agent file that creates and returns the agent
    - Example: `createRepositoryRepairAgent()` in `repository-repair-agent.ts`

2. **Create a tool that uses this agent directly**:

    - Import the agent creation function in your tool file
    - Create the agent instance within the tool's execute function
    - Use the agent directly by calling its generate() method
    - Process the agent's response and return a structured result

3. **Never use wrapper functions that internally create and use agents**:

    - AVOID pattern: `repairRepository(repoPath, errorReport)` that internally creates and uses an
      agent
    - PREFERRED pattern: Tool creates and directly uses the agent instance

4. **Return clear, structured results from tools**:
    - Extract and format relevant information from the agent's response
    - Use consistent property naming across tools

Example of the correct agent-as-tool pattern:

```typescript
// In repository-repair-tool.ts
import { createTool } from "@mastra/core/tools";
import { createRepositoryRepairAgent } from "../agents/repository-repair-agent.js";

import { getMastraInstance } from "../utils/mastra-singleton";

export const repositoryRepairTool = createTool({
    id: "Repository Repair",
    // ...schema and description...
    execute: async ({ context }) => {
        try {
            const mastra = getMastraInstance();

            // Create the agent directly
            const repairAgent = mastra.getAgent("repairAgent");

            // Generate prompt
            const prompt = `...${context.repository}...${context.errors}...`;

            // Use the agent directly
            const agentResponse = await repairAgent.generate(prompt);

            // Process the response
            const fixes = extractFixes(agentResponse.text);

            // Return structured result
            return {
                success: true,
                fixes: fixes,
                // ...other properties...
            };
        } catch (error) {
            return { success: false, error: String(error) };
        }
    },
});
```

This pattern provides several benefits:

- Clearer separation of concerns
- Explicit agent creation and usage
- Better testability
- More consistent with Mastra's recommended patterns

### Component Communication Patterns

When implementing agent workflows with multiple components:

1. **Validator-Repair Pattern**:

    - Validator agents should use tool interfaces to request repairs
    - Repair tools should connect to specialized repair agents
    - Each component should have a single responsibility
    - Use clear signaling between components for next actions

2. **Tool Response Structure**:

    - Always include a `success` boolean flag
    - Return rich metadata needed for subsequent steps
    - Use consistent property naming across tools
    - Signal when additional actions are required
    - Example:
        ```typescript
        return {
            success: true,
            // Additional metadata for next steps
            needsNextStep: true,
            sourcePath: context.inputPath,
        };
        ```

3. **Multiple Agent Coordination**:
    - Use separation of concerns between specialized agents
    - Orchestrator agents focus on coordination and decision-making
    - Worker agents focus on specific tasks (validation, repair)
    - Maintain clear communication interfaces between them

## Git Operations

### Repository Checkout Implementation

We've created a robust Git checkout system with the following features:

- **Direct Git Command Execution**: We use Node.js's `execSync` with proper error handling,
  timeouts, and output capturing.
- **Auto-retry with Organization Fallback**: If a repository is not found in the specified
  organization, we automatically try with the "runpod-workers" organization as fallback.
- **Timeout Controls**: Short timeout values (5s) prevent hanging on non-existent repositories.
- **Content Verification**: After checkout, we list directory contents to verify success.
- **Path Conventions**: Repositories are cloned to:
    ```
    <project_root>/repos/<organization>-<repository_name>
    ```

### Error Handling Best Practices

- Use a wrapper function (`safeExecSync`) around `execSync` to handle errors consistently
- Capture both stdout and stderr for comprehensive error reporting
- Implement timeouts to prevent hanging processes
- Include error classification for common Git failure scenarios (not found, timeout, etc.)
- Return structured error objects rather than throwing exceptions

## Docker Operations

### Cross-Platform Support

The Docker tools provide cross-platform compatibility, ensuring proper operation on both Windows and
Linux:

- Windows systems use manual directory scanning to find Dockerfiles
- Linux systems use the `find` command with a fallback to manual scanning if it fails
- Use platform detection (`process.platform === 'win32'`) to select the appropriate method

### Logs Handling

When dealing with Docker container logs:

- Always consider containers with no logs as valid (not an error condition)
- Check the success status of log retrieval operations, not the presence of logs
- Use `lineCount` to indicate empty logs rather than treating them as failures
- Include helpful messages in the report for empty logs (e.g., "No logs produced by container or
  logs were empty. This is not an error.")

## Environment Configuration

### API Key Management

- Store all API keys in `.env`
- Follow standard naming conventions (e.g., `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`)
- Check for presence of required keys before agent initialization
- Provide clear error messages when keys are missing

### Model Configuration

- Configure model parameters in the agent creation files
- Use appropriate model identifiers for each AI provider:
    - For Anthropic: Use correct versioned identifiers (e.g., `claude-3-sonnet-20240229`,
      `claude-3-7-sonnet-latest`)
    - For OpenAI: Use their model naming format (e.g., `gpt-4o`)
- Verify model availability with your API key before deployment

## Mastra Integration

### Workflow-Agent Integration

When connecting workflows with agents:

1. **Create a Tool Wrapper**:

    - Import the workflow directly in the tool file (avoid circular imports)
    - Execute the workflow using `createRun()` and `start()`
    - Extract and format the report from workflow results

2. **Access the Mastra Instance**:
    - Get it via the `mastra` parameter in the tool's execute function
    - Don't import the mastra instance directly in tool files
    - Use it to access workflows: `mastra.getWorkflow("workflowName")`

Example of a tool that executes a workflow:

```typescript
import { getMastraInstance } from "utils/mastra-singleton";

export const dockerValidationTool = createTool({
  id: "Docker Repository Validator",
  description: "Validates a Docker repository",
  inputSchema,
  execute: async ({ context }) => {
    try {
      const mastra = getMastraInstance();

      const workflow = mastra.getWorkflow("dockerValidationWorkflow");
      const { runId, start } = workflow.createRun();
      const result = await start({
        triggerData: { repository: context.repository, ... }
      });

      // Extract the report from results
      const reportStep = result.results?.report;
      if (reportStep?.status === "success") {
        return {
          success: true,
          report: reportStep.output.report
        };
      }

      return { success: false, error: "Report generation failed" };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },
});
```

### Step Design

When designing workflow steps:

1. **Give Clear IDs**: Use descriptive step IDs (e.g., `checkout`, `build`, `report`) that match how
   you'll access them in results
2. **Handle Empty Outputs**: Consider empty results like logs as valid rather than errors
3. **Use Report Pattern**: Create a dedicated report generation step that summarizes all previous
   steps

### Tool Implementation

Tools in Mastra should follow these patterns:

1. **Tool Creation**:

    - Use `createTool` from `@mastra/core/tools`
    - Implement tools in a dedicated file (e.g., `git-tools.ts`, `docker-tools.ts`)
    - Export both the core functions and the Mastra tool

2. **Schema Definition**:

    - Use Zod for schema validation
    - Provide clear descriptions for each field
    - Match UI expectations in the schema (separate fields vs combined values)

3. **Function Execution**:

    - Implement core functionality in a standalone function
    - Have the tool's execute function call that standalone function
    - Provide detailed logging for debugging

4. **Error Handling**:

    - Return objects with a `success` property to indicate status
    - Include error messages for failures
    - Log detailed information to help with debugging

5. **Tool Registration**:
    - Register tools in an agent's configuration
    - Make sure tool IDs match the UI expectation

### Workflow Integration

When integrating tools with workflows:

1. For direct tool usage, import functionality from the tool's module:

```typescript
const { buildDockerImage } = await import("../../docker-tools.js");
```

2. Call the function with parameters from the workflow context:

```typescript
const result = await buildDockerImage(dockerfilePath, imageTag, platform);
```

3. Handle and propagate errors appropriately:

```typescript
if (!result.success) {
    throw new Error(result.error || "Failed to build Docker image");
}
```

## Testing Approaches

### Test Organization

- Name test files with the `test-` prefix followed by what is being tested
- Examples: `test-repair-tool.ts`, `test-validator-repair-integration.ts`
- Register all test scripts in `package.json` under "scripts" section
- Use consistent naming patterns: `test:repair-tool`, `test:integration`
- Create separate tests for:
    - Direct function tests
    - Tool interface tests
    - Agent tests
    - Integration tests between components

### Direct Function Testing

- Create dedicated test files for core functions (e.g., `test-docker-tools.ts`)
- Test each function with valid and invalid inputs
- Ensure comprehensive error handling

### Workflow Testing

- Test workflows directly using `createRun()` and `start()`
- Verify each step's output and the final results
- Test different input scenarios, including edge cases

### Tool Testing

- Test tools by directly calling the `execute` method with correct context
- Use type assertions if needed to satisfy TypeScript requirements
- Check tool results for expected output format and content

### Agent Testing

- Test agents by generating responses with specific prompts
- Examine both the response text and tool results
- Include proper error handling for agent responses

### Cross-Platform Testing

- Always test file operations on both Windows and Linux
- Use platform detection to handle differences
- Implement fallback mechanisms for platform-specific features

### Integration Testing

- Test individual components first (tools, agents)
- Then test integration between components
- Create mock repositories with known issues for testing
- Verify the end-to-end workflow functions correctly

## Common Issues & Solutions

### Process Execution

**Issue**: `execSync` can hang indefinitely without proper configuration.

**Solution**:

- Always set timeouts
- Use `stdio: "pipe"` to capture output
- Handle errors comprehensively

```typescript
const options = {
    encoding: "utf8",
    stdio: "pipe",
    shell: true,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    timeout: 5000, // 5 second timeout
};
```

### Repository Naming

**Issue**: Repository names might come in different formats.

**Solution**:

- Parse the repository name to extract owner and repo parts
- Support both combined format (`owner/repo`) and separate fields
- Implement validation and fallbacks

### Docker Logs Validation

**Issue**: Empty logs can be valid but might be treated as failures.

**Solution**:

- Check for operation success, not content presence
- Consider empty logs as valid output
- Provide clear indication in reports for empty logs
- Add explanatory messages to empty log reports

### Circular Dependencies

**Issue**: Importing the mastra instance in tools can create circular dependencies.

**Solution**:

- Access the mastra instance through tool execution parameters
- Define a clear import hierarchy
- In agent tests, retrieve agent instances from mastra instead of direct imports

## Future Enhancements

Potential areas for improvement:

1. **Authentication Support**: Add GitHub token support for private repos
2. **Branch Selection**: Allow specifying branches to check out
3. **Depth Control**: Support shallow clones for large repositories
4. **Progress Reporting**: Better progress indicators for long-running operations
5. **Workspace Isolation**: Clone repos to isolated workspaces to prevent conflicts
6. **Improved Log Analysis**: Add pattern matching for common Docker errors in logs
7. **Enhanced Agent Debugging**: Log full agent thought processes for troubleshooting

## Conclusion

These conventions should guide future development on the Worker Maintainer project. They represent
lessons learned through practical implementation and should evolve as the project grows.

Remember that these conventions are not fixed rules - they should be continuously improved as new
patterns and better practices emerge.

**IMPORTANT**: When creating new tools, always follow the direct tool integration approach using
`createTool` unless you have a specific reason to use MCP servers. Consistency in implementation
patterns is critical for maintainability.

**REQUIRED**: For agent-to-agent communication, always follow the agent-as-tool pattern where tools
directly create and use agent instances rather than calling functions that internally create and use
agents. This ensures clear separation of concerns and better maintainability.
