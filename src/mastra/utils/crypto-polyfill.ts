/**
 * Crypto Polyfill Utility
 *
 * This module provides a function to ensure crypto is properly initialized
 * for Node.js environments, particularly with ESM modules, where crypto
 * may not be automatically available on the global object.
 */
import { webcrypto } from "node:crypto";

/**
 * Ensures the Node.js crypto module is properly initialized and available globally
 * This is needed for Mastra workflows and other features that rely on crypto for ID generation
 *
 * Call this function at the top of files that use Mastra's workflow functionality
 */
export function ensureCrypto(): void {
	if (typeof global.crypto === "undefined") {
		// @ts-ignore
		global.crypto = webcrypto;
	}
}

// Auto-initialize when the module is imported
ensureCrypto();
