import { Mastra } from "@mastra/core";
import { createLogger } from "@mastra/core/logger";
import { weatherWorkflow, repositoryRepairWorkflow } from "./workflows";
import {
  weatherAgent,
  repoValidatorAgent,
  repositoryRepairAgent,
} from "./agents";
import { repoValidatorWorkflow } from "./workflows/repoValidator";
import { simpleTestWorkflow } from "./workflows/simple-test";
import { githubCheckoutWorkflow } from "./workflows/github-checkout";
import { dockerValidationWorkflow } from "./workflows/docker-validation-workflow";

export const mastra = new Mastra({
  workflows: {
    weatherWorkflow,
    repoValidatorWorkflow,
    simpleTestWorkflow,
    githubCheckoutWorkflow,
    dockerValidationWorkflow,
    repositoryRepairWorkflow,
  },
  agents: {
    weatherAgent,
    repoValidatorAgent,
    repositoryRepairAgent,
  },
  logger: createLogger({
    name: "Mastra",
    level: "info",
  }),
});
