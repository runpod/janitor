import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const validationResults = pgTable(
	"validation_results",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		runId: uuid("run_id").notNull(),
		repositoryName: text("repository_name").notNull(),
		organization: text("organization").notNull(),
		validationStatus: text("validation_status", {
			enum: ["success", "failed", "running"],
		}).notNull(),
		resultsJson: jsonb("results_json").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		repoIdx: index("idx_validation_results_repo").on(table.repositoryName),
		runIdIdx: index("idx_validation_results_run_id").on(table.runId),
		statusIdx: index("idx_validation_results_status").on(table.validationStatus),
		createdAtIdx: index("idx_validation_results_created_at").on(table.createdAt),
	}),
);
