import { Mastra } from "@mastra/core";
import { ConsoleLogger } from "@mastra/core/logger";
import { LibSQLStore } from "@mastra/libsql";

import { dev } from "./agents/dev.js";
import { janitor } from "./agents/janitor.js";
import { prCreator } from "./agents/pr-creator.js";
import { setMastraInstance } from "./utils/mastra.js";
import { dockerValidationWorkflow } from "./workflows/docker-validation-workflow.js";

export const mastra = new Mastra({
	workflows: {
		dockerValidationWorkflow,
	},
	agents: {
		janitor,
		dev,
		prCreator,
	},
	storage: new LibSQLStore({
		url: "file:/tmp/mastra.db",
	}),
	logger: new ConsoleLogger({
		name: "Mastra",
		level: "info",
	}),
});

setMastraInstance(mastra);
