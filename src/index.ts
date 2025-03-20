import { mastra } from "./mastra/index.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: ".env.development" });

// Export the Mastra instance and its components
export { mastra };

// Add file system tools from Mastra
export {
  fileReadTool,
  listDirectoryTool,
  fileSearchTool,
  editFileTool,
} from "./mastra/tools/file-system-tools.js";

// Add repository repair agent from Mastra
export {
  createRepositoryRepairAgent,
  repairRepository,
} from "./mastra/agents/repository-repair-agent.js";

async function main() {
  try {
    console.log("Worker Maintainer Service");
    console.log("------------------------");
    console.log("Available file tools:");
    console.log(" - File Reader");
    console.log(" - Directory Lister");
    console.log(" - File Searcher");
    console.log(" - File Editor");
    console.log("");
    console.log("Available workflows:");
    console.log(" - Docker Repository Validator");
    console.log(" - Docker Repository Repair");
    console.log("");
    console.log("Use the specific test scripts to run functionality.");
    console.log("For example: npm run test:mastra-repair");
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
