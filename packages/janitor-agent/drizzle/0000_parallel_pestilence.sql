CREATE TABLE "validation_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"repository_name" text NOT NULL,
	"organization" text NOT NULL,
	"validation_status" text NOT NULL,
	"results_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_validation_results_repo" ON "validation_results" USING btree ("repository_name");--> statement-breakpoint
CREATE INDEX "idx_validation_results_run_id" ON "validation_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_validation_results_status" ON "validation_results" USING btree ("validation_status");--> statement-breakpoint
CREATE INDEX "idx_validation_results_created_at" ON "validation_results" USING btree ("created_at");