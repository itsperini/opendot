import { defineConfig } from "drizzle-kit";
import { getPostgresUri, shouldUsePostgresSsl } from "./src/server/db/config.js";

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: getPostgresUri(),
    ssl: shouldUsePostgresSsl() ? "require" : false,
  },
});
