# Repository Repair Agent

## User Story

As a repository maintainer, I want an agent that can automatically diagnose and fix common issues in worker repositories that fail validation, so that I can efficiently maintain multiple repositories without manually debugging each one.

## Description

Create a Mastra.ai agent that:

1. Implements direct tool integration for file operations using Mastra's `createTool` function
2. Works in conjunction with the Repository Build Validator, targeting repositories that failed validation
3. Provides core file system tools for diagnosing and repairing repository issues:
    - **Read File**: Reads the content of specific files to analyze configuration issues
    - **List Directory**: Navigates repository structure to identify missing or misplaced files
    - **File Search**: Locates configuration patterns, dependencies, or error-prone code
    - **Edit File**: Makes targeted repairs to Dockerfiles, configuration files, and source code
4. Uses Claude-Sonnet-3.7 as the underlying model for all repository analysis and repair operations
5. Can interpret error reports from the Repository Build Validator and apply appropriate fixes
6. Follows the project conventions for tool implementation
7. Includes proper error handling and reporting for all operations

## Acceptance Criteria

-   The system receives build validation failure reports from the Repository Build Validator
-   The agent uses its reasoning capabilities and file operation tools to analyze and fix issues
-   Each file operation tool exposes a core function that can be used independently of the Mastra framework
-   Tools can be registered with a Mastra agent for interactive repository repair
-   The agent is configured to use Claude-Sonnet-3.7 for optimal code understanding and generation
-   The Read File tool:
    -   Can read files with proper UTF-8 encoding
    -   Handles large files by supporting offset and limit parameters
    -   Reports meaningful errors for missing files or permission issues
-   The List Directory tool:
    -   Lists files and directories with basic metadata (type, size, modification time)
    -   Handles both absolute and relative paths
    -   Supports recursive listing with a configurable depth
-   The File Search tool:
    -   Searches for files using glob patterns
    -   Supports exclusion patterns
    -   Can filter by file type, size, or modification time
-   The Edit File tool:
    -   Can create, modify, or delete files
    -   Validates file contents when appropriate
    -   Includes safety checks to prevent destructive operations
-   All tools have comprehensive error handling with structured error responses
-   The agent provides clear reporting on:
    -   Issues detected
    -   Fixes applied
    -   Verification of fix success
    -   Remaining issues that require manual intervention
-   Before/after comparisons are generated for each repair operation
-   The agent is capable of handling common Docker build failures including:
    -   Missing dependencies
    -   Incorrect base images
    -   Path configuration issues
    -   Environment variable problems
    -   Resource limit issues

## Technical Notes

-   Implement using Mastra.ai's direct tool integration approach in TypeScript
-   Follow the project conventions from `docs/conventions.md`
-   Configure the agent to use Claude-Sonnet-3.7:

    ```typescript
    import { anthropic } from "@ai-sdk/anthropic";

    const agent = new Agent({
        name: "Repository Repair Agent",
        instructions: "You are an expert at diagnosing and fixing Docker build failures...",
        model: anthropic("claude-3-7-sonnet-latest"),
        tools: {
            fileReadTool,
            listDirectoryTool,
            fileSearchTool,
            editFileTool,
        },
    });
    ```

-   Use Node.js fs/promises API for file operations:
    ```typescript
    import { promises as fs } from "fs";
    ```
-   Implement core functionality as standalone functions:
    ```typescript
    export const readFileContent = async (filePath: string, offset = 0, limit = -1) => {
        // Implementation...
    };
    ```
-   Create tools using `createTool` from @mastra/core/tools:
    ```typescript
    export const fileReadTool = createTool({
        id: "File Reader",
        inputSchema: z.object({
            // Schema definition...
        }),
        description: "Reads file content with optional offset and limit",
        execute: async ({ context }) => {
            // Call the core function with context parameters
            return await readFileContent(context.filePath, context.offset, context.limit);
        },
    });
    ```
-   Support both Windows and Linux environments with platform-specific handling
-   Include comprehensive testing for all operations
-   Integrate with the output format from the Repository Build Validator to ensure seamless handoff
