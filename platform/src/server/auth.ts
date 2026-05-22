import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
} from "jose";
import { createSecretKey } from "node:crypto";

export type AuthIdentity = {
  id: string;
  authProvider: "dev" | "supabase";
  authSubject: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
};

export class AuthError extends Error {
  statusCode = 401;
}

const DEV_USER_ID =
  process.env.OPENDOT_DEV_USER_ID || "00000000-0000-4000-8000-000000000001";
const DEV_USER_EMAIL = process.env.OPENDOT_DEV_USER_EMAIL || "";
const DEV_USER_NAME = process.env.OPENDOT_DEV_USER_NAME || "Marco";

let cachedRemoteJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedRemoteJwksUrl: string | null = null;

function isEnabled(value: string | undefined) {
  return ["1", "true", "yes", "required"].includes(String(value || "").toLowerCase());
}

function getBearerToken(authorization: string | string[] | undefined) {
  const header = Array.isArray(authorization) ? authorization[0] : authorization;
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function normalizeSupabaseUrl(value: string | undefined) {
  if (!value) {
    return null;
  }

  return value.replace(/\/+$/, "");
}

function getRemoteJwks(supabaseUrl: string) {
  const jwksUrl = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;

  if (!cachedRemoteJwks || cachedRemoteJwksUrl !== jwksUrl) {
    cachedRemoteJwks = createRemoteJWKSet(new URL(jwksUrl));
    cachedRemoteJwksUrl = jwksUrl;
  }

  return cachedRemoteJwks;
}

function assertUuid(value: string | undefined, context: string) {
  if (
    !value ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new AuthError(`${context} must be a UUID.`);
  }

  return value;
}

function stringClaim(value: unknown) {
  return typeof value === "string" ? value : "";
}

function metadataClaim(payload: JWTPayload, key: string) {
  const metadata = payload.user_metadata;

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "";
  }

  return stringClaim((metadata as Record<string, unknown>)[key]);
}

async function verifyWithSupabase(token: string) {
  const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL);
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  const errors: unknown[] = [];

  if (supabaseUrl) {
    try {
      const result = await jwtVerify(token, getRemoteJwks(supabaseUrl), {
        issuer: `${supabaseUrl}/auth/v1`,
      });
      return result.payload;
    } catch (error) {
      errors.push(error);
    }
  }

  if (jwtSecret) {
    try {
      const secret = createSecretKey(Buffer.from(jwtSecret, "utf8"));
      const result = await jwtVerify(token, secret);
      return result.payload;
    } catch (error) {
      errors.push(error);
    }
  }

  if (!supabaseUrl && !jwtSecret) {
    throw new AuthError(
      "Bearer token received, but SUPABASE_URL or SUPABASE_JWT_SECRET is not configured.",
    );
  }

  throw new AuthError(
    `Supabase JWT verification failed.${errors.length ? " Check signing keys and issuer." : ""}`,
  );
}

function identityFromClaims(payload: JWTPayload): AuthIdentity {
  const id = assertUuid(payload.sub, "Supabase JWT subject");
  const email = stringClaim(payload.email);
  const displayName =
    metadataClaim(payload, "full_name") ||
    metadataClaim(payload, "name") ||
    stringClaim(payload.name) ||
    email ||
    "OpenDot user";

  return {
    id,
    authProvider: "supabase",
    authSubject: id,
    email,
    displayName,
    avatarUrl: metadataClaim(payload, "avatar_url") || null,
  };
}

export async function resolveAuthIdentity(
  authorization: string | string[] | undefined,
): Promise<AuthIdentity> {
  const token = getBearerToken(authorization);

  if (token) {
    return identityFromClaims(await verifyWithSupabase(token));
  }

  if (isEnabled(process.env.PLATFORM_AUTH_REQUIRED)) {
    throw new AuthError("A Supabase bearer token is required.");
  }

  const id = assertUuid(DEV_USER_ID, "OPENDOT_DEV_USER_ID");
  return {
    id,
    authProvider: "dev",
    authSubject: id,
    email: DEV_USER_EMAIL,
    displayName: DEV_USER_NAME,
    avatarUrl: null,
  };
}
