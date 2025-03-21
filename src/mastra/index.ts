import { Mastra } from "@mastra/core";
import { createLogger } from "@mastra/core/logger";

import { repositoryPRAgent, repositoryRepairAgent, repositoryValidatorAgent } from "./agents";
import { repositoryRepairWorkflow } from "./workflows";
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
		repositoryValidatorAgent,
		repositoryRepairAgent,
		repositoryPRAgent,
	},
	logger: createLogger({
		name: "Mastra",
		level: "info",
	}),
});
