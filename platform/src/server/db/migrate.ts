import "dotenv/config";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./client.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(dirname, "../../../drizzle");

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query(`
      create table if not exists _opendot_migrations (
        id text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const applied = new Set(
      (
        await client.query<{ id: string }>(
          "select id from _opendot_migrations order by id asc",
        )
      ).rows.map((row) => row.id),
    );
    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }

      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into _opendot_migrations (id) values ($1)", [file]);
        await client.query("commit");
        console.log(`Applied migration ${file}`);
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }

    if (files.length === applied.size) {
      console.log("Database schema is up to date.");
    }
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});
