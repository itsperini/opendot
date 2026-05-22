import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { getPostgresUri, shouldUsePostgresSsl } from "./config.js";
import * as schema from "./schema.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: getPostgresUri(),
  ssl: shouldUsePostgresSsl() ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });
