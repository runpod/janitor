import { Step, Workflow } from "@mastra/core/workflows";
import { z } from "zod";
import path from "path";
import { repairRepository } from "../agents/repository-repair-agent.js";

// Define the validation result type
interface ValidationResult {
  repository: string;
  buildStatus: "success" | "failure";
  containerStatus: "success" | "failure";
  errors: string[];
  logs: string;
}

// Step 1: Analyze validation results
const analyzeValidationStep = new Step({
  id: "analyze",
  description: "Analyzes validation results to find failing repositories",
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    failedRepositories: z.array(z.any()).optional(),
  }),
  execute: async ({ context }) => {
    console.log("Analyzing validation results...");
    const { validationResults } = context.triggerData;

    // Filter repositories that failed validation
    const failedRepos = validationResults.filter(
      (result: ValidationResult) =>
        result.buildStatus === "failure" || result.containerStatus === "failure"
    );

    if (failedRepos.length === 0) {
      return {
        success: true,
        message: "No failed repositories to repair.",
        failedRepositories: [],
      };
    }

    return {
      success: true,
      failedRepositories: failedRepos,
      message: `Found ${failedRepos.length} repositories that need repair.`,
    };
  },
});

// Step 2: Repair failed repositories
const repairRepositoriesStep = new Step({
  id: "repair",
  description: "Attempts to repair failing repositories",
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    repairResults: z.array(z.any()).optional(),
  }),
  execute: async ({ context }) => {
    // Get failed repositories from previous step
    const analyzeStepResult = context.getStepResult(analyzeValidationStep);
    if (
      !analyzeStepResult?.success ||
      !analyzeStepResult?.failedRepositories ||
      analyzeStepResult.failedRepositories.length === 0
    ) {
      return {
        success: true,
        message: "No repositories to repair.",
        repairResults: [],
      };
    }

    const failedRepositories = analyzeStepResult.failedRepositories;

    // Process each failed repository
    const repairResults = await Promise.all(
      failedRepositories.map(async (repo) => {
        const repoPath = path.join(
          process.cwd(),
          "repos",
          repo.repository.replace("/", "-")
        );

        console.log(`Repairing repository: ${repo.repository} at ${repoPath}`);

        try {
          const repairResult = await repairRepository(repoPath, repo);

          return {
            repository: repo.repository,
            repaired: repairResult.success,
            fixes: repairResult.fixes || [],
            response: repairResult.response || repairResult.error,
          };
        } catch (error) {
          console.error(`Error repairing ${repo.repository}:`, error);
          return {
            repository: repo.repository,
            repaired: false,
            fixes: [],
            response: `Failed to repair: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      })
    );

    const successCount = repairResults.filter((r) => r.repaired).length;

    return {
      success: true,
      repairResults,
      message: `Repaired ${successCount} out of ${repairResults.length} repositories.`,
    };
  },
});

// Step 3: Generate summary report
const generateReportStep = new Step({
  id: "report",
  description: "Generates a report of the repair results",
  outputSchema: z.object({
    success: z.boolean(),
    report: z.object({
      summary: z.string(),
      details: z.array(z.any()),
    }),
  }),
  execute: async ({ context }) => {
    // Get repair results from previous step
    const repairStepResult = context.getStepResult(repairRepositoriesStep);
    if (
      !repairStepResult?.success ||
      !repairStepResult?.repairResults ||
      repairStepResult.repairResults.length === 0
    ) {
      return {
        success: true,
        report: {
          summary: "No repositories were repaired.",
          details: [],
        },
      };
    }

    const repairResults = repairStepResult.repairResults;

    // Generate detailed report
    const reportDetails = repairResults.map((result) => ({
      repository: result.repository,
      status: result.repaired ? "REPAIRED" : "FAILED",
      fixes: result.fixes,
      details: result.response,
    }));

    const successCount = repairResults.filter((r) => r.repaired).length;

    return {
      success: true,
      report: {
        summary: `Repaired ${successCount} out of ${repairResults.length} repositories.`,
        details: reportDetails,
      },
    };
  },
});

// Create the workflow
export const repositoryRepairWorkflow = new Workflow({
  name: "repository-repair",
  triggerSchema: z.object({
    validationResults: z
      .array(
        z.object({
          repository: z.string().describe("Repository name (owner/repo)"),
          buildStatus: z.enum(["success", "failure"]),
          containerStatus: z.enum(["success", "failure"]),
          errors: z.array(z.string()),
          logs: z.string(),
        })
      )
      .describe("Results from the repository validation process"),
  }),
});

// Build workflow with sequential steps
repositoryRepairWorkflow
  .step(analyzeValidationStep)
  .then(repairRepositoriesStep)
  .then(generateReportStep)
  .commit();
