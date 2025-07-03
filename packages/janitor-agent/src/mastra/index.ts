import { Mastra } from "@mastra/core";
import { ConsoleLogger } from "@mastra/core/logger";
import { LibSQLStore } from "@mastra/libsql";

import { dev } from "./agents/dev";
import { janitor } from "./agents/janitor";
import { prCreator } from "./agents/pr-creator";
import { setMastraInstance } from "./utils/mastra";
import { dockerValidationWorkflow } from "./workflows/docker-validation-workflow";

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
		url: "file:./mastra.db",
	}),
	logger: new ConsoleLogger({
		name: "Mastra",
		level: "info",
	}),
});

setMastraInstance(mastra);
