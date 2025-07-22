import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const validationResults = pgTable(
	"validation_results",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		run_id: uuid("run_id").notNull(),
		repository_name: text("repository_name").notNull(),
		organization: text("organization").notNull(),
		validation_status: text("validation_status").notNull(),
		results_json: jsonb("results_json").notNull(),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		original_prompt: text("original_prompt"),
		repository_prompt: text("repository_prompt"),
	},
	table => {
		return {
			repoIdx: index("idx_validation_results_repo").on(table.repository_name),
			runIdIdx: index("idx_validation_results_run_id").on(table.run_id),
			statusIdx: index("idx_validation_results_status").on(table.validation_status),
			createdAtIdx: index("idx_validation_results_created_at").on(table.created_at),
		};
	}
);
