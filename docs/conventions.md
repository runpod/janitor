# Worker Maintainer Project Conventions

This document outlines the conventions, patterns, and lessons learned during the development of the Worker Maintainer project. Use this as a reference for future development and to onboard new contributors.

## Tool Implementation Approaches

### Direct Tool Integration (PREFERRED)

**ALWAYS use this approach unless you have a specific reason to use MCP servers.**

Tools should be implemented directly as Mastra tools using the `createTool` function from `@mastra/core/tools`. This is the simplest and most efficient approach that should be used for most use cases.

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
    return await buildDockerImage(
      context.dockerfilePath,
      context.imageName,
      context.platform
    );
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

**DO NOT use this approach unless you need to run tools in a separate process or integrate with external MCP servers.**

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

## Git Operations

### Repository Checkout Implementation

We've created a robust Git checkout system with the following features:

- **Direct Git Command Execution**: We use Node.js's `execSync` with proper error handling, timeouts, and output capturing.
- **Auto-retry with Organization Fallback**: If a repository is not found in the specified organization, we automatically try with the "runpod-workers" organization as fallback.
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

## Mastra Integration

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

## Core Project Guidelines

### Code Structure

- **Modular Design**: Each capability should be in its own file
- **Shared Utilities**: Common functions should be shared across workflows
- **Typed Interfaces**: Use TypeScript interfaces for consistent data structures
- **Clear Naming**: Use descriptive names that indicate purpose

### Error Handling

- Always use structured error responses
- Include both success indicators and error messages
- Log detailed information for debugging
- Return errors rather than throwing exceptions when possible

### Testing

- Create dedicated test files (like `test-git-checkout.ts`, `test-docker-tools.ts`)
- Test with both valid and invalid inputs
- Include error handling in tests
- Verify outputs against expectations

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

### Mastra Tool Integration

**Issue**: Inconsistent implementation approaches leading to unnecessary complexity.

**Solution**:

- Prefer direct tool implementation using `createTool` from `@mastra/core/tools`
- Only use MCP servers when specifically required for external integrations
- Follow consistent patterns across all tools in the project
- Document the reasoning when deviating from standard patterns

## Future Enhancements

Potential areas for improvement:

1. **Authentication Support**: Add GitHub token support for private repos
2. **Branch Selection**: Allow specifying branches to check out
3. **Depth Control**: Support shallow clones for large repositories
4. **Progress Reporting**: Better progress indicators for long-running operations
5. **Workspace Isolation**: Clone repos to isolated workspaces to prevent conflicts

## Conclusion

These conventions should guide future development on the Worker Maintainer project. They represent lessons learned through practical implementation and should evolve as the project grows.

Remember that these conventions are not fixed rules - they should be continuously improved as new patterns and better practices emerge.

**IMPORTANT**: When creating new tools, always follow the direct tool integration approach using `createTool` unless you have a specific reason to use MCP servers. Consistency in implementation patterns is critical for maintainability.
