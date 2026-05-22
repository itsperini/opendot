import "dotenv/config";

import { defineConfig } from "drizzle-kit";

const postgresUri =
  process.env.POSTGRES_URI || "postgres://opendot:opendot@localhost:5432/opendot";

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: postgresUri,
    ssl: process.env.POSTGRES_SSL === "true" ? "require" : false,
  },
});
