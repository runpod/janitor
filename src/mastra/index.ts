import { Mastra } from "@mastra/core";
import { createLogger } from "@mastra/core/logger";

import { dev } from "./agents/dev";
import { prCreatorAgent } from "./agents/pr-creator";
import { workerMaintainer } from "./agents/worker-maintainer";
import { createPlaceholderAgent } from "./utils/agents";
import { setMastraInstance } from "./utils/mastra";
import { repositoryRepairWorkflow } from "./workflows/repository-repair-workflow";
import { dockerValidationWorkflow } from "./workflows/docker-validation-workflow";
import { repositoryValidatorWorkflow } from "./workflows/repository-validator-workflow";

// Initialize the Mastra instance with proper configuration
export const mastra = new Mastra({
	workflows: {
		repositoryValidatorWorkflow,
		dockerValidationWorkflow,
		repositoryRepairWorkflow,
	},
	agents: {
		workerMaintainer: workerMaintainer ?? createPlaceholderAgent("worker maintainer"),
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
