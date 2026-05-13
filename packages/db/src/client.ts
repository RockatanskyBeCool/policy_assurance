import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const { Pool } = pg;

export const defaultLocalDatabaseUrl = "postgres://postgres:postgres@127.0.0.1:54322/postgres";

export function createDb(databaseUrl = process.env.DATABASE_URL ?? defaultLocalDatabaseUrl) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  return drizzle(pool, { schema });
}

export type Database = ReturnType<typeof createDb>;
