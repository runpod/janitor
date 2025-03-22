import { Memory } from "@mastra/memory";

/**
 * Creates a simple memory instance with no custom configuration
 * Relies entirely on Mastra's default memory settings
 */
export function createBasicMemory() {
	// Create a memory instance with default settings
	return new Memory();
}

/**
 * Creates a slightly more advanced memory configuration.
 * This simply adds a few configuration options but is still very basic.
 */
export function createAdvancedMemory() {
	return new Memory();
}
