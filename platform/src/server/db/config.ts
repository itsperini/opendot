import "../env.js";

function encodeUriPart(value: string) {
  return encodeURIComponent(value);
}

export function getPostgresUri() {
  if (process.env.POSTGRES_URI) {
    return process.env.POSTGRES_URI;
  }

  const user = process.env.POSTGRES_USER || "opendot";
  const password = process.env.POSTGRES_PASSWORD || "opendot";
  const host = process.env.POSTGRES_HOST || "localhost";
  const port = process.env.POSTGRES_PORT || "5432";
  const database = process.env.POSTGRES_DB || "opendot";

  return `postgres://${encodeUriPart(user)}:${encodeUriPart(password)}@${host}:${port}/${encodeUriPart(
    database,
  )}`;
}

export function shouldUsePostgresSsl() {
  return ["1", "true", "require"].includes(
    String(process.env.POSTGRES_SSL || "").toLowerCase(),
  );
}
