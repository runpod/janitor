import { createRepositoryPRAgent } from "./repository-pr-agent.js";
import { createRepositoryRepairAgent } from "./repository-repair-agent.js";
import { repositoryValidatorAgent } from "./repository-validator-agent.js";

// Create the repository repair agent
const repositoryRepairAgent = createRepositoryRepairAgent();

// Create the repository PR agent
const repositoryPRAgent = createRepositoryPRAgent();

// Export all agents
export { repositoryPRAgent, repositoryRepairAgent, repositoryValidatorAgent };
