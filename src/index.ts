import dotenv from "dotenv";

import { mastra } from "./mastra/index";

// Load environment variables
dotenv.config({ path: ".env" });

// Export the Mastra instance and its components
export { mastra };

async function main() {
	try {
		console.log("worker maintainer is here to help you maintain your worker 🫡");
	} catch (error) {
		console.error("Error:", error);
	}
}

main();
