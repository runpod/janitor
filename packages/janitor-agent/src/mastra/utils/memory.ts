import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";

/**
 * Creates a memory instance with LibSQL storage configuration
 * Uses the same storage configuration as the main Mastra instance
 */
export function createBasicMemory() {
	return new Memory({
		storage: new LibSQLStore({
			url: "file:./mastra.db",
		}),
		options: {
			lastMessages: 10,
		},
	});
}
