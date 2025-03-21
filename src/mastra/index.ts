import { Mastra } from "@mastra/core";
import { createLogger } from "@mastra/core/logger";

import { repositoryRepairAgent, repositoryValidatorAgent } from "./agents";
import { repositoryRepairWorkflow } from "./workflows";
import { dockerValidationWorkflow } from "./workflows/docker-validation-workflow";
import { githubCheckoutWorkflow } from "./workflows/github-checkout";
import { repositoryPRWorkflow } from "./workflows/repository-pr-workflow";
import { repositoryValidatorWorkflow } from "./workflows/repository-validator-workflow";

// Initialize the Mastra instance with proper configuration
export const mastra = new Mastra({
	workflows: {
		repositoryValidatorWorkflow,
		githubCheckoutWorkflow,
		dockerValidationWorkflow,
		repositoryRepairWorkflow,
		repositoryPRWorkflow,
	},
	agents: {
		repositoryValidatorAgent,
		repositoryRepairAgent,
	},
	logger: createLogger({
		name: "Mastra",
		level: "info",
	}),
});
