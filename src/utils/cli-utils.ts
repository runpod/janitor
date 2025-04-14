/**
 * Gets the value of a command-line argument.
 *
 * @param argName The name of the argument to look for (e.g., "--repo").
 * @param defaultValue The default value to return if the argument is not found.
 * @returns The value of the argument or the default value.
 */
export function getCliArg(argName: string, defaultValue: string): string {
	const args = process.argv.slice(2); // Remove node executable and script path
	const argIndex = args.indexOf(argName);

	// Scenario 1: Standard "--flag value" format found (works with npx tsx ...)
	if (argIndex !== -1 && args[argIndex + 1]) {
		const value = args[argIndex + 1];
		console.log(`Using ${argName} from CLI argument (standard format): ${value}`);
		return value;
	}

	// Scenario 2: Fallback specifically for "--repo" when potentially run via "npm run ... -- value"
	// Check if we're looking for "--repo", there's at least one arg, and the first arg looks like "org/repo"
	if (argName === "--repo" && args.length > 0 && /^[\w-]+\/[\w-]+$/.test(args[0])) {
		const value = args[0];
		console.log(`Using ${argName} from CLI argument (inferred format for npm run): ${value}`);
		return value;
	}

	// Scenario 3: Argument not found in either format, use default
	console.log(`Using default ${argName}: ${defaultValue}`);
	return defaultValue;
}
