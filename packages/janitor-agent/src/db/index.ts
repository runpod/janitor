import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "dotenv";
import * as schema from "./schema.js";

config();

// Create PostgreSQL connection
const connectionString =
	process.env.DATABASE_URL ||
	`postgresql://postgres:${process.env.SUPABASE_SERVICE_ROLE_KEY}@db.${process.env.SUPABASE_URL?.replace("https://", "").replace(".supabase.co", "")}.supabase.co:5432/postgres`;

const client = postgres(connectionString);
export const db = drizzle(client, { schema });

export { validationResults } from "./schema.js";
