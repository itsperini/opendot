import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

let loaded = false;

export function loadOpenDotEnv() {
  if (loaded) {
    return;
  }

  loaded = true;

  const envPath = process.env.OPENDOT_ENV_FILE
    ? path.resolve(process.cwd(), process.env.OPENDOT_ENV_FILE)
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..", ".env");

  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

loadOpenDotEnv();
