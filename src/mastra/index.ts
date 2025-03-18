import { Mastra } from "@mastra/core";
import { createLogger } from "@mastra/core/logger";
import { weatherWorkflow } from "./workflows";
import { weatherAgent } from "./agents";
import { repoValidatorWorkflow } from "./workflows/repoValidator";
import { repoValidatorAgent } from "./agents/repoValidatorAgent";
import { simpleTestWorkflow } from "./workflows/simple-test";
import { githubCheckoutWorkflow } from "./workflows/github-checkout";

export const mastra = new Mastra({
  workflows: {
    weatherWorkflow,
    repoValidatorWorkflow,
    simpleTestWorkflow,
    githubCheckoutWorkflow,
  },
  agents: {
    weatherAgent,
    repoValidatorAgent,
  },
  logger: createLogger({
    name: "Mastra",
    level: "info",
  }),
});
