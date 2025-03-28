import { Mastra } from "@mastra/core";
import { createLogger } from "@mastra/core/logger";

import { dev } from "./agents/dev";
import { janitor } from "./agents/janitor";
import { prCreatorAgent } from "./agents/pr-creator";
import { createPlaceholderAgent } from "./utils/agents";
import { setMastraInstance } from "./utils/mastra";
import { dockerValidationWorkflow } from "./workflows/docker-validation-workflow";

// Initialize the Mastra instance with proper configuration
export const mastra = new Mastra({
	workflows: {
		dockerValidationWorkflow,
	},
	agents: {
		janitor: janitor ?? createPlaceholderAgent("janitor"),
		dev: dev ?? createPlaceholderAgent("dev"),
		prCreatorAgent: prCreatorAgent ?? createPlaceholderAgent("pr creator"),
	},
	logger: createLogger({
		name: "Mastra",
		level: "info",
	}),
});

// Register the mastra instance with our singleton utility
setMastraInstance(mastra);
