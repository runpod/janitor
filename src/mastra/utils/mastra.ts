/**
 * Mastra Singleton
 *
 * This module provides a global singleton approach to access the mastra instance
 * to avoid circular dependencies.
 */

import { Mastra } from "@mastra/core";

// Store the singleton instance
let mastraInstance: Mastra | null = null;

/**
 * Sets the global mastra instance
 */
export function setMastraInstance(instance: Mastra): void {
	mastraInstance = instance;
}

/**
 * Gets the global mastra instance
 * Throws an error if not initialized
 */
export function getMastraInstance(): Mastra {
	if (!mastraInstance) {
		throw new Error("Mastra instance not initialized. Call setMastraInstance first.");
	}
	return mastraInstance;
}

// Export a function to check if the instance exists
export function hasMastraInstance(): boolean {
	return !!mastraInstance;
}
