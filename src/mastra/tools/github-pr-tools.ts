import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { MCPConfiguration } from "@mastra/mcp";

// MCP Configuration for GitHub server
const githubMCP = new MCPConfiguration({
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

// Create a new branch in a repository
export const createBranch = async (
  owner: string,
  repo: string,
  branch: string,
  fromBranch: string = "main"
) => {
  try {
    const result = await githubMCP.invoke({
      server: "github",
      tool: "create_branch",
      params: {
        owner,
        repo,
        branch,
        from_branch: fromBranch,
      },
    });

    return {
      success: true,
      branch,
      message: `Successfully created branch ${branch} from ${fromBranch}`,
      data: result,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      branch,
      message: `Failed to create branch: ${errorMessage}`,
      error: String(error),
    };
  }
};

// Push multiple files in a single commit
export const pushFiles = async (
  owner: string,
  repo: string,
  branch: string,
  files: Array<{ path: string; content: string }>,
  message: string
) => {
  try {
    const result = await githubMCP.invoke({
      server: "github",
      tool: "push_files",
      params: {
        owner,
        repo,
        branch,
        files,
        message,
      },
    });

    return {
      success: true,
      message: `Successfully pushed ${files.length} files to ${branch}`,
      data: result,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to push files: ${errorMessage}`,
      error: String(error),
    };
  }
};

// Create a new pull request
export const createPullRequest = async (
  owner: string,
  repo: string,
  title: string,
  body: string,
  head: string,
  base: string = "main",
  draft: boolean = false
) => {
  try {
    const result = await githubMCP.invoke({
      server: "github",
      tool: "create_pull_request",
      params: {
        owner,
        repo,
        title,
        body,
        head,
        base,
        draft,
      },
    });

    return {
      success: true,
      pullRequestUrl: result.html_url,
      pullRequestNumber: result.number,
      message: `Successfully created pull request #${result.number}`,
      data: result,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to create pull request: ${errorMessage}`,
      error: String(error),
    };
  }
};

// List pull requests
export const listPullRequests = async (
  owner: string,
  repo: string,
  state: string = "open",
  head?: string,
  base?: string
) => {
  try {
    const result = await githubMCP.invoke({
      server: "github",
      tool: "list_pull_requests",
      params: {
        owner,
        repo,
        state,
        head,
        base,
      },
    });

    return {
      success: true,
      count: result.length,
      pullRequests: result,
      message: `Found ${result.length} pull requests`,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to list pull requests: ${errorMessage}`,
      error: String(error),
    };
  }
};

// Update an existing pull request
export const updatePullRequest = async (
  owner: string,
  repo: string,
  pullNumber: number,
  options: {
    title?: string;
    body?: string;
    state?: string;
    base?: string;
  }
) => {
  try {
    const result = await githubMCP.invoke({
      server: "github",
      tool: "update_pull_request",
      params: {
        owner,
        repo,
        pull_number: pullNumber,
        ...options,
      },
    });

    return {
      success: true,
      pullRequestUrl: result.html_url,
      message: `Successfully updated pull request #${pullNumber}`,
      data: result,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to update pull request: ${errorMessage}`,
      error: String(error),
    };
  }
};

// Mastra tools for GitHub PR operations
export const createBranchTool = createTool({
  id: "Create GitHub Branch",
  description: "Creates a new branch in a GitHub repository",
  inputSchema: z.object({
    owner: z.string().describe("Repository owner (username or organization)"),
    repo: z.string().describe("Repository name"),
    branch: z.string().describe("Name for the new branch"),
    fromBranch: z
      .string()
      .optional()
      .describe("Source branch (defaults to 'main')"),
  }),
  execute: async ({ context }) => {
    return await createBranch(
      context.owner,
      context.repo,
      context.branch,
      context.fromBranch
    );
  },
});

export const pushFilesTool = createTool({
  id: "Push Files to GitHub",
  description:
    "Pushes multiple files in a single commit to a GitHub repository",
  inputSchema: z.object({
    owner: z.string().describe("Repository owner (username or organization)"),
    repo: z.string().describe("Repository name"),
    branch: z.string().describe("Branch to push to"),
    files: z
      .array(
        z.object({
          path: z.string().describe("File path in the repository"),
          content: z.string().describe("Content of the file"),
        })
      )
      .describe("Files to push"),
    message: z.string().describe("Commit message"),
  }),
  execute: async ({ context }) => {
    return await pushFiles(
      context.owner,
      context.repo,
      context.branch,
      context.files,
      context.message
    );
  },
});

export const createPullRequestTool = createTool({
  id: "Create GitHub Pull Request",
  description: "Creates a new pull request in a GitHub repository",
  inputSchema: z.object({
    owner: z.string().describe("Repository owner (username or organization)"),
    repo: z.string().describe("Repository name"),
    title: z.string().describe("Title of the pull request"),
    body: z.string().describe("Description of the pull request"),
    head: z
      .string()
      .describe("The name of the branch where your changes are implemented"),
    base: z
      .string()
      .optional()
      .describe(
        "The branch you want the changes pulled into (defaults to 'main')"
      ),
    draft: z
      .boolean()
      .optional()
      .describe("Create as draft PR (defaults to false)"),
  }),
  execute: async ({ context }) => {
    return await createPullRequest(
      context.owner,
      context.repo,
      context.title,
      context.body,
      context.head,
      context.base,
      context.draft
    );
  },
});

export const listPullRequestsTool = createTool({
  id: "List GitHub Pull Requests",
  description: "Lists pull requests in a GitHub repository",
  inputSchema: z.object({
    owner: z.string().describe("Repository owner (username or organization)"),
    repo: z.string().describe("Repository name"),
    state: z
      .string()
      .optional()
      .describe(
        "State of the pull requests: 'open', 'closed', or 'all' (defaults to 'open')"
      ),
    head: z.string().optional().describe("Filter by head branch"),
    base: z.string().optional().describe("Filter by base branch"),
  }),
  execute: async ({ context }) => {
    return await listPullRequests(
      context.owner,
      context.repo,
      context.state,
      context.head,
      context.base
    );
  },
});

export const updatePullRequestTool = createTool({
  id: "Update GitHub Pull Request",
  description: "Updates an existing pull request in a GitHub repository",
  inputSchema: z.object({
    owner: z.string().describe("Repository owner (username or organization)"),
    repo: z.string().describe("Repository name"),
    pullNumber: z.number().describe("Pull request number to update"),
    title: z.string().optional().describe("New title for the pull request"),
    body: z
      .string()
      .optional()
      .describe("New description for the pull request"),
    state: z
      .string()
      .optional()
      .describe("New state for the pull request: 'open' or 'closed'"),
    base: z
      .string()
      .optional()
      .describe("New base branch for the pull request"),
  }),
  execute: async ({ context }) => {
    return await updatePullRequest(
      context.owner,
      context.repo,
      context.pullNumber,
      {
        title: context.title,
        body: context.body,
        state: context.state,
        base: context.base,
      }
    );
  },
});
