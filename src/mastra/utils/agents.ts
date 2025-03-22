import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";

/**
 * Creates a placeholder agent when the original agent couldn't be initialized
 * This prevents null/undefined errors in the Mastra configuration
 */
export function createPlaceholderAgent(name: string): Agent {
	return new Agent({
		name: `${name} (Placeholder)`,
		instructions: "This is a placeholder agent. The original agent couldn't be initialized.",
		model: openai("gpt-3.5-turbo"),
	});
}
