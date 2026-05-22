import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const { Pool } = pg;

const postgresUri =
  process.env.POSTGRES_URI || "postgres://opendot:opendot@localhost:5432/opendot";

function shouldUseSsl() {
  return ["1", "true", "require"].includes(
    String(process.env.POSTGRES_SSL || "").toLowerCase(),
  );
}

export const pool = new Pool({
  connectionString: postgresUri,
  ssl: shouldUseSsl() ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });
