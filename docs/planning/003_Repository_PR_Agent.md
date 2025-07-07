# Repository Pull Request Agent

## User Story

As a repository maintainer, I want an agent that can automatically create pull requests for fixed repositories, so that my repository repairs can be tracked, reviewed, and merged in a standardized way.

## Description

Create a Mastra.ai agent that:

1. Integrates with the GitHub MCP server to handle pull request operations
2. Works in conjunction with the Repository Build Validator and Repository Repair Agent
3. After validation and repair operations are complete, creates or updates pull requests with the changes
4. Implements the following workflow:
    - **Step 1**: Create a new branch for the fixed repository
    - **Step 2**: Commit the changes to the new branch
    - **Step 3**: Push the changes to GitHub
    - **Step 4**: Create a new pull request or update an existing one with the changes
    - **Step 5**: Provide a detailed description of the fixes in the PR
5. Follows proper PR conventions including:
    - Clear PR titles that describe the fix
    - Detailed descriptions with validation results before and after the fix
    - Reference to the validation report and repair operations
6. Uses the GitHub MCP server for all GitHub operations

## Acceptance Criteria

-   The agent integrates with the GitHub MCP server for all Git operations
-   After successful repair operations, a new branch is created with a standardized naming convention (e.g., `fix/repository-name-YYYYMMDD`)
-   Changes are properly committed to the new branch with descriptive commit messages
-   The agent verifies if a PR already exists for these changes before creating a new one
-   If a PR exists, the agent updates the existing PR with new changes
-   If no PR exists, the agent creates a new PR from the branch to the main branch
-   The PR description includes:
    -   A summary of the fixes applied
    -   Validation results before and after the fix
    -   Any remaining issues that couldn't be fixed automatically
-   The agent provides feedback to the user with PR URLs and status information
-   All operations include proper error handling and reporting
-   The agent maintains its state to track which repositories have pending PRs

## Technical Notes

-   Configure the Mastra MCPConfiguration to connect to the GitHub MCP server:
    ```typescript
    const mcp = new MCPConfiguration({
        servers: {
            github: {
                command: "npx",
                args: ["-y", "@modelcontextprotocol/server-github"],
                env: {
                    GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
                },
            },
        },
    });
    ```
-   Use the GitHub MCP server's tools for branch management, commits, and PR operations:
    -   Create Branch: Create a new branch for fixes
    -   Commit Changes: Commit the fixed files
    -   Create Pull Request: Create a new PR or update existing one
    -   Get Pull Request: Check if a PR already exists
-   Implement a workflow that coordinates with the Repository Repair Agent:
    -   Take the repair results as input
    -   Create appropriate branches and PRs based on the changes
    -   Track PR status for future updates
-   Provide detailed reporting on the PR creation process
-   Configure the agent to use Claude-Sonnet-3.7 for optimal explanation generation
