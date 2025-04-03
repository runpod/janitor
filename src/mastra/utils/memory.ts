import { Memory } from "@mastra/memory";

/**
 * Creates a simple memory instance with no custom configuration
 * Relies entirely on Mastra's default memory settings
 */
export function createBasicMemory() {
	return new Memory();
}
