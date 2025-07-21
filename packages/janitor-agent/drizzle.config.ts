import { config } from "dotenv";
import type { Config } from "drizzle-kit";
import path from "path";

// Load .env from project root, not from current directory
config({ path: path.resolve(process.cwd(), "../../.env") });

// Extract project ID from Supabase URL and create proper DB connection string
const getSupabaseConnectionString = () => {
	const supabaseUrl = process.env.SUPABASE_URL;
	const dbPassword = process.env.SUPABASE_DB_PASSWORD;

	if (!supabaseUrl || !dbPassword) {
		throw new Error("SUPABASE_URL and SUPABASE_DB_PASSWORD must be set");
	}

	// Extract project ID from URL like https://abcdefg.supabase.co
	const projectId = supabaseUrl.replace("https://", "").replace(".supabase.co", "");

	// Use direct connection (not pooler) for migrations
	return `postgresql://postgres:${dbPassword}@db.${projectId}.supabase.co:5432/postgres`;
};

export default {
	schema: "./src/db/schema.ts",
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL || getSupabaseConnectionString(),
	},
} satisfies Config;
