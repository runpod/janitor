import dotenv from "dotenv";

import { mastra } from "./mastra/index";

// Load environment variables
dotenv.config({ path: ".env.development" });

// Export the Mastra instance and its components
export { mastra };

// Add file system tools from Mastra
export {
	editFileTool,
	fileReadTool,
	fileSearchTool,
	listDirectoryTool,
} from "./mastra/tools/file-system-tools";

// Add repository repair agent from Mastra
export { create_dev, fixSchema, repairOutputSchema } from "./mastra/agents/dev";

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
