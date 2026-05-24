import "./env.js";

import cors from "@fastify/cors";
import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import Fastify from "fastify";
import {
  createHash,
  randomBytes,
  randomUUID,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import {
  createLocalSessionToken,
  isLocalAuthEnabled,
  resolveAuthIdentity,
  type AuthIdentity,
} from "./auth.js";
import { db, pool } from "./db/client.js";
import {
  agentVersions,
  agents,
  apiKeys,
  appUsers,
  deploymentDeviceTargets,
  deployments,
  deviceActivationRequests,
  deviceCredentials,
  deviceState,
  devices,
  localAuthCredentials,
  pipelineVersions,
  pipelines,
  runtimeSessionTokens,
  userPreferences,
  type AgentRow,
  type AgentVersionRow,
  type ApiKeyRow,
  type AppUserRow,
  type DeploymentDeviceTargetRow,
  type DeploymentRow,
  type DeviceActivationRequestRow,
  type DeviceRow,
  type DeviceStateRow,
  type LocalAuthCredentialRow,
  type PipelineVersionRow,
  type UserPreferenceRow,
} from "./db/schema.js";
import { createDefaultPipeline, normalizeVoiceAgent } from "../lib/pipeline.js";
import type {
  CreateAgentInput,
  CreateDotDeviceInput,
  DotDevice,
  DotDeviceAvailability,
  DotDeviceUpdateMode,
  PipelineStage,
  UserApiKey,
  UserSettings,
  VoiceAgent,
} from "../types.js";

const defaultUserSettings: UserSettings = {
  displayName: "Marco",
  email: "",
  workspaceName: "OpenDot Lab",
  timezone: "Europe/Zurich",
  compactMode: false,
};

const config = {
  host: process.env.PLATFORM_API_HOST || "0.0.0.0",
  port: Number(process.env.PORT || process.env.PLATFORM_API_PORT || 8788),
  runtimeInternalSecret:
    process.env.OPENDOT_RUNTIME_INTERNAL_SECRET ||
    "opendot-local-runtime-internal-secret-change-me",
  runtimePublicHttpUrl:
    process.env.OPENDOT_RUNTIME_PUBLIC_HTTP_URL || "http://localhost:8787",
  runtimePublicVoiceUrl:
    process.env.OPENDOT_RUNTIME_PUBLIC_WS_URL || "ws://localhost:8787/voice",
};

type UserContext = {
  identity: AuthIdentity;
  user: AppUserRow;
  preferences: UserPreferenceRow;
};

type AuthSessionUser = {
  id: string;
  authProvider: AuthIdentity["authProvider"];
  email: string;
  displayName: string;
  avatarUrl: string | null;
};

type DeviceBinding = {
  target: DeploymentDeviceTargetRow;
  deployment: DeploymentRow;
  agent: AgentRow;
};

type RuntimeDeviceIdentity = {
  deviceIdentifier: string;
  clientId: string;
  serialNumber: string | null;
  userAgent: string;
  ipAddress: string;
};

type DeviceActivationClaimInput = {
  code?: string;
};

type RuntimeVoiceSessionInput = {
  agentId?: string;
};

function nowDate() {
  return new Date();
}

function nowIso() {
  return nowDate().toISOString();
}

function dateIso(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function requiredDateIso(value: Date | string) {
  return dateIso(value) ?? nowIso();
}

function isUuid(value: string | null | undefined) {
  return Boolean(
    value?.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    ),
  );
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function httpError(message: string, statusCode: number) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

function trimRequired(value: unknown, field: string) {
  const trimmed = stringValue(value).trim();
  if (!trimmed) {
    throw new Error(`${field} is required.`);
  }
  return trimmed;
}

function optionalTrimmed(value: unknown) {
  return stringValue(value).trim();
}

function normalizeEmail(value: unknown) {
  const email = optionalTrimmed(value).toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw httpError("A valid email is required.", 400);
  }

  return email;
}

function normalizePassword(value: unknown) {
  const password = stringValue(value);

  if (password.length < 8) {
    throw httpError("Password must be at least 8 characters.", 400);
  }

  return password;
}

function displayNameFromInput(value: unknown, email: string) {
  return optionalTrimmed(value) || email.split("@")[0] || "OpenDot user";
}

function availability(value: unknown): DotDeviceAvailability {
  return value === "available" || value === "offline" || value === "unknown"
    ? value
    : "unknown";
}

function updateMode(value: unknown): DotDeviceUpdateMode {
  return value === "checking" || value === "binding" || value === "idle" ? value : "idle";
}

function slugify(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);

  return slug || fallback;
}

function createScopedSlug(value: string, fallback: string, id: string) {
  return `${slugify(value, fallback)}-${id.slice(0, 8)}`;
}

function createApiToken() {
  return `od_sk_${randomBytes(24).toString("hex")}`;
}

function createDeviceToken() {
  return `od_dt_${randomBytes(32).toString("base64url")}`;
}

function createRuntimeSessionToken() {
  return `od_vt_${randomBytes(32).toString("base64url")}`;
}

function createActivationCode() {
  return String(randomInt(100_000, 1_000_000));
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 64).toString("base64url");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, hash] = storedHash.split(":");

  if (algorithm !== "scrypt" || !salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(password, salt, expected.length);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function pipelineLatencyBudget(pipeline: PipelineStage[]) {
  const total = pipeline.reduce((sum, stage) => sum + stage.latencyTargetMs, 0);
  return Number.isFinite(total) ? total : null;
}

function normalizePipeline(value: unknown) {
  return normalizeVoiceAgent({
    id: randomUUID(),
    name: "Pipeline",
    description: "",
    status: "draft",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    pipeline: Array.isArray(value) ? value : createDefaultPipeline(),
  }).pipeline;
}

function apiKeyFromRow(row: ApiKeyRow, token: string | null = null): UserApiKey {
  return {
    id: row.id,
    name: row.name,
    token,
    prefix: row.prefix,
    createdAt: requiredDateIso(row.createdAt),
    lastUsedAt: dateIso(row.lastUsedAt),
    status: row.status === "revoked" || row.revokedAt ? "revoked" : "active",
  };
}

function settingsFromRows(
  user: AppUserRow,
  preferences: UserPreferenceRow,
): UserSettings {
  return {
    displayName: user.displayName || defaultUserSettings.displayName,
    email: user.email || defaultUserSettings.email,
    workspaceName: preferences.workspaceName || defaultUserSettings.workspaceName,
    timezone: preferences.timezone || defaultUserSettings.timezone,
    compactMode: preferences.compactMode,
  };
}

function authUserFromContext(context: UserContext): AuthSessionUser {
  return {
    id: context.user.id,
    authProvider: context.identity.authProvider,
    email: context.user.email,
    displayName: context.user.displayName,
    avatarUrl: context.user.avatarUrl,
  };
}

function localIdentityFromRows(
  user: AppUserRow,
  credential: LocalAuthCredentialRow,
): AuthIdentity {
  return {
    id: user.id,
    authProvider: "local",
    authSubject: credential.emailNormalized,
    email: user.email || credential.email,
    displayName: user.displayName || displayNameFromInput("", credential.email),
    avatarUrl: user.avatarUrl,
  };
}

async function createAuthSession(identity: AuthIdentity) {
  const accessToken = await createLocalSessionToken(identity);
  const context = await ensureUserContext(identity);

  return {
    accessToken,
    user: authUserFromContext(context),
  };
}

function agentFromRows(
  agent: AgentRow,
  agentVersion: AgentVersionRow | null,
  pipelineVersion: PipelineVersionRow | null,
): VoiceAgent {
  const pipeline = Array.isArray(pipelineVersion?.manifestJson?.stages)
    ? pipelineVersion.manifestJson.stages
    : createDefaultPipeline();

  return normalizeVoiceAgent({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    status: "draft",
    createdAt: requiredDateIso(agent.createdAt),
    updatedAt: requiredDateIso(agent.updatedAt),
    pipeline,
  });
}

function deviceFromRows(
  device: DeviceRow,
  state: DeviceStateRow | undefined,
  binding: DeviceBinding | undefined,
): DotDevice {
  const boundAt = binding?.target.appliedAt ?? binding?.deployment.activatedAt ?? null;

  return {
    id: device.id,
    name: device.displayName,
    model: device.model,
    serialNumber: device.serialNumber,
    availability: availability(state?.availability),
    ipAddress: state?.ipAddress ?? "",
    deviceEndpoint: device.deviceEndpoint,
    lastSeenAt: dateIso(state?.lastSeenAt),
    boundAgentId: binding?.agent.id ?? null,
    boundAgentName: binding?.agent.name ?? null,
    boundConfigVersion: binding
      ? requiredDateIso(binding.deployment.activatedAt ?? binding.deployment.createdAt)
      : null,
    boundAt: dateIso(boundAt),
    updateMode: updateMode(state?.updateMode),
    updatedAt: requiredDateIso(state?.updatedAt ?? device.updatedAt),
  };
}

async function signupWithLocalPassword(body: unknown) {
  if (!isLocalAuthEnabled()) {
    throw httpError("Local email/password auth is disabled.", 403);
  }

  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const email = normalizeEmail(input.email);
  const password = normalizePassword(input.password);
  const displayName = displayNameFromInput(input.displayName, email);
  const timestamp = nowDate();

  const [existingCredential] = await db
    .select()
    .from(localAuthCredentials)
    .where(eq(localAuthCredentials.emailNormalized, email))
    .limit(1);

  if (existingCredential) {
    throw httpError("An account already exists for this email.", 409);
  }

  const identity: AuthIdentity = {
    id: randomUUID(),
    authProvider: "local",
    authSubject: email,
    email,
    displayName,
    avatarUrl: null,
  };

  await db.transaction(async (tx) => {
    await tx.insert(appUsers).values({
      id: identity.id,
      authProvider: identity.authProvider,
      authSubject: identity.authSubject,
      email,
      displayName,
      avatarUrl: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await tx.insert(localAuthCredentials).values({
      id: randomUUID(),
      userId: identity.id,
      email,
      emailNormalized: email,
      passwordHash: hashPassword(password),
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
      lastUsedAt: timestamp,
    });
  });

  return createAuthSession(identity);
}

async function loginWithLocalPassword(body: unknown) {
  if (!isLocalAuthEnabled()) {
    throw httpError("Local email/password auth is disabled.", 403);
  }

  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const email = normalizeEmail(input.email);
  const password = stringValue(input.password);
  const invalidError = () => httpError("Invalid email or password.", 401);

  const [credential] = await db
    .select()
    .from(localAuthCredentials)
    .where(
      and(
        eq(localAuthCredentials.emailNormalized, email),
        eq(localAuthCredentials.status, "active"),
      ),
    )
    .limit(1);

  if (!credential || !verifyPassword(password, credential.passwordHash)) {
    throw invalidError();
  }

  const [user] = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.id, credential.userId))
    .limit(1);

  if (!user) {
    throw invalidError();
  }

  await db
    .update(localAuthCredentials)
    .set({ lastUsedAt: nowDate(), updatedAt: nowDate() })
    .where(eq(localAuthCredentials.id, credential.id));

  return createAuthSession(localIdentityFromRows(user, credential));
}

async function ensureUserContext(identity: AuthIdentity): Promise<UserContext> {
  const timestamp = nowDate();

  await db
    .insert(appUsers)
    .values({
      id: identity.id,
      authProvider: identity.authProvider,
      authSubject: identity.authSubject,
      email: identity.email,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: appUsers.id,
      set: {
        authProvider: identity.authProvider,
        authSubject: identity.authSubject,
        email: identity.email,
        displayName: identity.displayName,
        avatarUrl: identity.avatarUrl,
        updatedAt: timestamp,
      },
    });

  const [preferences] = await db
    .insert(userPreferences)
    .values({
      userId: identity.id,
      workspaceName: defaultUserSettings.workspaceName,
      timezone: defaultUserSettings.timezone,
      compactMode: defaultUserSettings.compactMode,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: {
        updatedAt: timestamp,
      },
    })
    .returning();

  const [user] = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.id, identity.id))
    .limit(1);

  return {
    identity,
    user,
    preferences,
  };
}

async function contextFromRequest(authorization: string | string[] | undefined) {
  return ensureUserContext(await resolveAuthIdentity(authorization));
}

function hasBearerToken(authorization: string | string[] | undefined) {
  const header = Array.isArray(authorization) ? authorization[0] : authorization;
  return Boolean(header?.match(/^Bearer\s+.+$/i));
}

function bearerToken(authorization: string | string[] | undefined) {
  const header = Array.isArray(authorization) ? authorization[0] : authorization;
  return header?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function timingSafeStringEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function ensureRuntimeInternalRequest(secret: string | string[] | undefined) {
  const providedSecret = headerValue(secret) || "";

  if (
    !providedSecret ||
    !timingSafeStringEqual(providedSecret, config.runtimeInternalSecret)
  ) {
    throw httpError("Runtime internal authentication failed.", 401);
  }
}

async function authSessionFromRequest(authorization: string | string[] | undefined) {
  if (!hasBearerToken(authorization)) {
    throw httpError("An active session is required.", 401);
  }

  const context = await contextFromRequest(authorization);
  return { user: authUserFromContext(context) };
}

async function latestAgentVersions(agentIds: string[]) {
  if (agentIds.length === 0) {
    return new Map<string, AgentVersionRow>();
  }

  const rows = await db
    .select()
    .from(agentVersions)
    .where(inArray(agentVersions.agentId, agentIds))
    .orderBy(desc(agentVersions.versionNumber));
  const latest = new Map<string, AgentVersionRow>();

  for (const row of rows) {
    if (!latest.has(row.agentId)) {
      latest.set(row.agentId, row);
    }
  }

  return latest;
}

async function readAgents(context: UserContext) {
  const agentRows = await db
    .select()
    .from(agents)
    .where(and(eq(agents.userId, context.user.id), isNull(agents.deletedAt)))
    .orderBy(desc(agents.updatedAt));

  const latestAgentVersionByAgent = await latestAgentVersions(
    agentRows.map((row) => row.id),
  );
  const pipelineVersionIds = Array.from(latestAgentVersionByAgent.values())
    .map((row) => row.pipelineVersionId)
    .filter((id): id is string => Boolean(id));
  const pipelineVersionRows = pipelineVersionIds.length
    ? await db
        .select()
        .from(pipelineVersions)
        .where(inArray(pipelineVersions.id, pipelineVersionIds))
    : [];
  const pipelineVersionById = new Map(pipelineVersionRows.map((row) => [row.id, row]));

  return agentRows.map((agent) => {
    const agentVersion = latestAgentVersionByAgent.get(agent.id) ?? null;
    const pipelineVersion = agentVersion?.pipelineVersionId
      ? (pipelineVersionById.get(agentVersion.pipelineVersionId) ?? null)
      : null;
    return agentFromRows(agent, agentVersion, pipelineVersion);
  });
}

async function readAgentForUser(userId: string, agentId: string) {
  if (!isUuid(agentId)) {
    return null;
  }

  const [agent] = await db
    .select()
    .from(agents)
    .where(
      and(eq(agents.id, agentId), eq(agents.userId, userId), isNull(agents.deletedAt)),
    )
    .limit(1);

  if (!agent) {
    return null;
  }

  const [agentVersion] = await db
    .select()
    .from(agentVersions)
    .where(eq(agentVersions.agentId, agent.id))
    .orderBy(desc(agentVersions.versionNumber))
    .limit(1);

  const [pipelineVersion] = agentVersion?.pipelineVersionId
    ? await db
        .select()
        .from(pipelineVersions)
        .where(eq(pipelineVersions.id, agentVersion.pipelineVersionId))
        .limit(1)
    : [];

  return agentFromRows(agent, agentVersion ?? null, pipelineVersion ?? null);
}

async function readDevices(context: UserContext) {
  const deviceRows = await db
    .select()
    .from(devices)
    .where(and(eq(devices.userId, context.user.id), isNull(devices.deletedAt)))
    .orderBy(desc(devices.updatedAt));

  if (deviceRows.length === 0) {
    return [];
  }

  const deviceIds = deviceRows.map((row) => row.id);
  const [stateRows, targetRows] = await Promise.all([
    db.select().from(deviceState).where(inArray(deviceState.deviceId, deviceIds)),
    db
      .select()
      .from(deploymentDeviceTargets)
      .where(
        and(
          inArray(deploymentDeviceTargets.deviceId, deviceIds),
          eq(deploymentDeviceTargets.status, "active"),
        ),
      )
      .orderBy(desc(deploymentDeviceTargets.updatedAt)),
  ]);

  const stateByDevice = new Map(stateRows.map((row) => [row.deviceId, row]));
  const targetByDevice = new Map<string, DeploymentDeviceTargetRow>();

  for (const target of targetRows) {
    if (!targetByDevice.has(target.deviceId)) {
      targetByDevice.set(target.deviceId, target);
    }
  }

  const deploymentIds = Array.from(targetByDevice.values()).map(
    (row) => row.deploymentId,
  );
  const deploymentRows = deploymentIds.length
    ? await db.select().from(deployments).where(inArray(deployments.id, deploymentIds))
    : [];
  const deploymentById = new Map(deploymentRows.map((row) => [row.id, row]));
  const agentVersionIds = deploymentRows.map((row) => row.agentVersionId);
  const boundAgentVersionRows = agentVersionIds.length
    ? await db
        .select()
        .from(agentVersions)
        .where(inArray(agentVersions.id, agentVersionIds))
    : [];
  const boundAgentVersionById = new Map(
    boundAgentVersionRows.map((row) => [row.id, row]),
  );
  const boundAgentIds = boundAgentVersionRows.map((row) => row.agentId);
  const boundAgentRows = boundAgentIds.length
    ? await db.select().from(agents).where(inArray(agents.id, boundAgentIds))
    : [];
  const boundAgentById = new Map(boundAgentRows.map((row) => [row.id, row]));

  return deviceRows.map((device) => {
    const target = targetByDevice.get(device.id);
    const deployment = target ? deploymentById.get(target.deploymentId) : undefined;
    const agentVersion = deployment
      ? boundAgentVersionById.get(deployment.agentVersionId)
      : undefined;
    const agent = agentVersion ? boundAgentById.get(agentVersion.agentId) : undefined;
    const binding =
      target && deployment && agent
        ? {
            target,
            deployment,
            agent,
          }
        : undefined;

    return deviceFromRows(device, stateByDevice.get(device.id), binding);
  });
}

async function readPlatformState(context: UserContext) {
  const [agentRows, deviceRows, apiKeyRows] = await Promise.all([
    readAgents(context),
    readDevices(context),
    db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.userId, context.user.id))
      .orderBy(desc(apiKeys.createdAt)),
  ]);

  return {
    agents: agentRows,
    devices: deviceRows,
    userSettings: settingsFromRows(context.user, context.preferences),
    apiKeys: apiKeyRows.map((row) => apiKeyFromRow(row)),
  };
}

async function createAgent(context: UserContext, input: CreateAgentInput) {
  const timestamp = nowDate();
  const agentId = randomUUID();
  const pipelineId = randomUUID();
  const agentVersionId = randomUUID();
  const pipelineVersionId = randomUUID();
  const name = trimRequired(input.name, "Agent name");
  const description = trimRequired(input.description, "Agent description");
  const pipeline = createDefaultPipeline();
  const agentSlug = createScopedSlug(name, "agent", agentId);

  await db.transaction(async (tx) => {
    await tx.insert(pipelines).values({
      id: pipelineId,
      userId: context.user.id,
      slug: `${agentSlug}-pipeline`,
      name: `${name} pipeline`,
      description: "",
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    });

    await tx.insert(pipelineVersions).values({
      id: pipelineVersionId,
      pipelineId,
      versionNumber: 1,
      status: "draft",
      manifestJson: { stages: pipeline },
      latencyBudgetMs: pipelineLatencyBudget(pipeline),
      createdByUserId: context.user.id,
      createdAt: timestamp,
      publishedAt: null,
    });

    await tx.insert(agents).values({
      id: agentId,
      userId: context.user.id,
      pipelineId,
      slug: agentSlug,
      name,
      description,
      status: "draft",
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    });

    await tx.insert(agentVersions).values({
      id: agentVersionId,
      agentId,
      pipelineVersionId,
      versionNumber: 1,
      status: "draft",
      manifestJson: { name, description, status: "draft" },
      createdByUserId: context.user.id,
      createdAt: timestamp,
      publishedAt: null,
    });
  });

  return normalizeVoiceAgent({
    id: agentId,
    name,
    description,
    status: "draft",
    createdAt: timestamp.toISOString(),
    updatedAt: timestamp.toISOString(),
    pipeline,
  });
}

async function updateAgent(
  context: UserContext,
  agentId: string,
  body: Partial<VoiceAgent>,
) {
  if (!isUuid(agentId)) {
    return null;
  }

  const [row] = await db
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.id, agentId),
        eq(agents.userId, context.user.id),
        isNull(agents.deletedAt),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  const [latestAgentVersion] = await db
    .select()
    .from(agentVersions)
    .where(eq(agentVersions.agentId, row.id))
    .orderBy(desc(agentVersions.versionNumber))
    .limit(1);

  const [latestPipelineVersion] = row.pipelineId
    ? await db
        .select()
        .from(pipelineVersions)
        .where(eq(pipelineVersions.pipelineId, row.pipelineId))
        .orderBy(desc(pipelineVersions.versionNumber))
        .limit(1)
    : [];

  const pipeline = normalizePipeline(
    Array.isArray(body.pipeline)
      ? body.pipeline
      : latestPipelineVersion?.manifestJson?.stages,
  );
  const timestamp = nowDate();
  const name = trimRequired(body.name ?? row.name, "Agent name");
  const description = trimRequired(
    body.description ?? row.description,
    "Agent description",
  );
  const pipelineId = row.pipelineId ?? randomUUID();
  const pipelineVersionId = randomUUID();
  const agentVersionId = randomUUID();
  const nextAgentVersion = (latestAgentVersion?.versionNumber ?? 0) + 1;
  const nextPipelineVersion = (latestPipelineVersion?.versionNumber ?? 0) + 1;

  await db.transaction(async (tx) => {
    if (!row.pipelineId) {
      await tx.insert(pipelines).values({
        id: pipelineId,
        userId: context.user.id,
        slug: `${row.slug}-pipeline`,
        name: `${name} pipeline`,
        description: "",
        createdAt: row.createdAt,
        updatedAt: timestamp,
        deletedAt: null,
      });
    } else {
      await tx
        .update(pipelines)
        .set({ name: `${name} pipeline`, updatedAt: timestamp })
        .where(eq(pipelines.id, pipelineId));
    }

    await tx.insert(pipelineVersions).values({
      id: pipelineVersionId,
      pipelineId,
      versionNumber: nextPipelineVersion,
      status: "draft",
      manifestJson: { stages: pipeline },
      latencyBudgetMs: pipelineLatencyBudget(pipeline),
      createdByUserId: context.user.id,
      createdAt: timestamp,
      publishedAt: null,
    });

    await tx
      .update(agents)
      .set({
        pipelineId,
        name,
        description,
        status: "draft",
        updatedAt: timestamp,
      })
      .where(eq(agents.id, row.id));

    await tx.insert(agentVersions).values({
      id: agentVersionId,
      agentId: row.id,
      pipelineVersionId,
      versionNumber: nextAgentVersion,
      status: "draft",
      manifestJson: { name, description, status: "draft" },
      createdByUserId: context.user.id,
      createdAt: timestamp,
      publishedAt: null,
    });
  });

  return normalizeVoiceAgent({
    id: row.id,
    name,
    description,
    status: "draft",
    createdAt: requiredDateIso(row.createdAt),
    updatedAt: timestamp.toISOString(),
    pipeline,
  });
}

async function deleteAgent(context: UserContext, agentId: string) {
  if (!isUuid(agentId)) {
    return false;
  }

  const [row] = await db
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.id, agentId),
        eq(agents.userId, context.user.id),
        isNull(agents.deletedAt),
      ),
    )
    .limit(1);

  if (!row) {
    return false;
  }

  const timestamp = nowDate();
  const versionRows = await db
    .select({ id: agentVersions.id })
    .from(agentVersions)
    .where(eq(agentVersions.agentId, row.id));
  const versionIds = versionRows.map((version) => version.id);
  const deploymentRows = versionIds.length
    ? await db
        .select({ id: deployments.id })
        .from(deployments)
        .where(inArray(deployments.agentVersionId, versionIds))
    : [];
  const deploymentIds = deploymentRows.map((deployment) => deployment.id);

  await db.transaction(async (tx) => {
    await tx
      .update(agents)
      .set({ status: "removed", deletedAt: timestamp, updatedAt: timestamp })
      .where(eq(agents.id, row.id));

    if (row.pipelineId) {
      await tx
        .update(pipelines)
        .set({ deletedAt: timestamp, updatedAt: timestamp })
        .where(eq(pipelines.id, row.pipelineId));
    }

    await tx
      .update(runtimeSessionTokens)
      .set({ status: "revoked" })
      .where(eq(runtimeSessionTokens.agentId, row.id));

    if (deploymentIds.length > 0) {
      await tx
        .update(deploymentDeviceTargets)
        .set({ status: "removed", updatedAt: timestamp })
        .where(inArray(deploymentDeviceTargets.deploymentId, deploymentIds));
      await tx
        .update(deployments)
        .set({ status: "removed", supersededAt: timestamp })
        .where(inArray(deployments.id, deploymentIds));
    }
  });

  return true;
}

function createDevice(input: CreateDotDeviceInput): DotDevice {
  const updatedAt = nowIso();
  const serialNumber = trimRequired(input.serialNumber, "Serial number");

  return {
    id: randomUUID(),
    name: trimRequired(input.name, "Device name"),
    model: stringValue(input.model, "Dot S3").trim() || "Dot S3",
    serialNumber,
    availability: "unknown",
    ipAddress: stringValue(input.ipAddress),
    deviceEndpoint:
      stringValue(input.deviceEndpoint, "demo://custom-dot").trim() ||
      "demo://custom-dot",
    lastSeenAt: null,
    boundAgentId: null,
    boundAgentName: null,
    boundConfigVersion: null,
    boundAt: null,
    updateMode: "idle",
    updatedAt,
  };
}

function mergeDevice(
  id: string,
  existing: DotDevice | null,
  body: Partial<DotDevice>,
): DotDevice {
  const updatedAt = nowIso();
  return {
    id,
    name: trimRequired(body.name ?? existing?.name, "Device name"),
    model: stringValue(body.model ?? existing?.model, "Dot S3").trim() || "Dot S3",
    serialNumber: trimRequired(
      body.serialNumber ?? existing?.serialNumber,
      "Serial number",
    ),
    availability: availability(body.availability ?? existing?.availability),
    ipAddress: stringValue(body.ipAddress ?? existing?.ipAddress),
    deviceEndpoint:
      stringValue(
        body.deviceEndpoint ?? existing?.deviceEndpoint,
        "demo://custom-dot",
      ).trim() || "demo://custom-dot",
    lastSeenAt: body.lastSeenAt ?? existing?.lastSeenAt ?? null,
    boundAgentId: body.boundAgentId ?? existing?.boundAgentId ?? null,
    boundAgentName: body.boundAgentName ?? existing?.boundAgentName ?? null,
    boundConfigVersion: body.boundConfigVersion ?? existing?.boundConfigVersion ?? null,
    boundAt: body.boundAt ?? existing?.boundAt ?? null,
    updateMode: updateMode(body.updateMode ?? existing?.updateMode),
    updatedAt,
  };
}

async function findDeviceByExternalId(
  context: UserContext,
  id: string,
  serialNumber: string | null = null,
) {
  if (isUuid(id)) {
    const [row] = await db
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.id, id),
          eq(devices.userId, context.user.id),
          isNull(devices.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  const serial = serialNumber || id.replace(/^runtime:/, "");
  const [row] = await db
    .select()
    .from(devices)
    .where(
      and(
        eq(devices.userId, context.user.id),
        eq(devices.serialNumber, serial),
        isNull(devices.deletedAt),
      ),
    )
    .limit(1);

  return row ?? null;
}

async function publicDeviceById(context: UserContext, deviceId: string) {
  const allDevices = await readDevices(context);
  return allDevices.find((device) => device.id === deviceId) ?? null;
}

async function publicDeviceByOwnerId(userId: string, deviceId: string) {
  const context: UserContext = {
    identity: {
      id: userId,
      authProvider: "dev",
      authSubject: userId,
      email: "",
      displayName: "OpenDot user",
      avatarUrl: null,
    },
    user: { id: userId } as AppUserRow,
    preferences: {} as UserPreferenceRow,
  };

  return publicDeviceById(context, deviceId);
}

async function readRuntimeAgentForDevice(deviceId: string) {
  const [target] = await db
    .select()
    .from(deploymentDeviceTargets)
    .where(
      and(
        eq(deploymentDeviceTargets.deviceId, deviceId),
        eq(deploymentDeviceTargets.status, "active"),
      ),
    )
    .orderBy(desc(deploymentDeviceTargets.updatedAt))
    .limit(1);

  if (!target) {
    return null;
  }

  const [deployment] = await db
    .select()
    .from(deployments)
    .where(eq(deployments.id, target.deploymentId))
    .limit(1);

  if (!deployment) {
    return null;
  }

  const [agentVersion] = await db
    .select()
    .from(agentVersions)
    .where(eq(agentVersions.id, deployment.agentVersionId))
    .limit(1);

  if (!agentVersion) {
    return null;
  }

  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentVersion.agentId), isNull(agents.deletedAt)))
    .limit(1);

  if (!agent) {
    return null;
  }

  const [pipelineVersion] = agentVersion.pipelineVersionId
    ? await db
        .select()
        .from(pipelineVersions)
        .where(eq(pipelineVersions.id, agentVersion.pipelineVersionId))
        .limit(1)
    : [];

  return agentFromRows(agent, agentVersion, pipelineVersion ?? null);
}

function deviceIdentifierFromBody(body: unknown): RuntimeDeviceIdentity {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const deviceIdentifier =
    optionalTrimmed(input.deviceId) || optionalTrimmed(input.clientId);

  if (!deviceIdentifier) {
    throw httpError("Device-Id or Client-Id is required.", 400);
  }

  return {
    deviceIdentifier,
    clientId: optionalTrimmed(input.clientId),
    serialNumber: optionalTrimmed(input.serialNumber) || null,
    userAgent: optionalTrimmed(input.userAgent),
    ipAddress: optionalTrimmed(input.ipAddress),
  };
}

function serverTimePayload() {
  return {
    timestamp: Date.now(),
    timezone_offset: -new Date().getTimezoneOffset(),
  };
}

function websocketUrlFromBody(body: unknown) {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (optionalTrimmed(input.websocketUrl)) {
    return optionalTrimmed(input.websocketUrl);
  }

  const runtimeUrl = new URL(config.runtimePublicHttpUrl);
  runtimeUrl.protocol = runtimeUrl.protocol === "https:" ? "wss:" : "ws:";
  runtimeUrl.pathname = "/ws";
  runtimeUrl.search = "";
  runtimeUrl.hash = "";
  return runtimeUrl.toString();
}

function activationMessage() {
  return "Enter this code in OpenDot to pair your Dot device.";
}

async function createDeviceActivation(body: unknown) {
  const identity = deviceIdentifierFromBody(body);
  const timestamp = nowDate();
  const expiresAt = new Date(timestamp.getTime() + 5 * 60 * 1000);
  const code = createActivationCode();
  const token = createDeviceToken();
  const challenge = randomBytes(24).toString("base64url");

  await db.transaction(async (tx) => {
    await tx
      .update(deviceActivationRequests)
      .set({ status: "expired", updatedAt: timestamp })
      .where(
        and(
          eq(deviceActivationRequests.deviceIdentifier, identity.deviceIdentifier),
          eq(deviceActivationRequests.status, "pending"),
        ),
      );

    await tx.insert(deviceActivationRequests).values({
      id: randomUUID(),
      deviceIdentifier: identity.deviceIdentifier,
      clientId: identity.clientId,
      serialNumber: identity.serialNumber,
      userAgent: identity.userAgent,
      ipAddress: identity.ipAddress,
      codeHash: hashToken(code),
      challenge,
      tokenPrefix: token.slice(0, 14),
      tokenHash: hashToken(token),
      status: "pending",
      claimedByUserId: null,
      deviceId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt,
      claimedAt: null,
      completedAt: null,
    });
  });

  return {
    activation: {
      message: activationMessage(),
      code,
      challenge,
      timeout_ms: expiresAt.getTime() - timestamp.getTime(),
    },
    websocket: {
      url: websocketUrlFromBody(body),
      token,
      version: 1,
    },
    server_time: serverTimePayload(),
  };
}

async function deviceCredentialFromToken(token: string) {
  const tokenHash = hashToken(token);
  const [credential] = await db
    .select()
    .from(deviceCredentials)
    .where(
      and(
        eq(deviceCredentials.tokenHash, tokenHash),
        eq(deviceCredentials.status, "active"),
      ),
    )
    .limit(1);

  return credential ?? null;
}

async function pairedDeviceFromIdentity(identity: RuntimeDeviceIdentity) {
  const serialNumber = identity.serialNumber || identity.deviceIdentifier;
  const [device] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.serialNumber, serialNumber), isNull(devices.deletedAt)))
    .limit(1);

  if (!device) {
    return null;
  }

  const [credential] = await db
    .select()
    .from(deviceCredentials)
    .where(
      and(
        eq(deviceCredentials.deviceId, device.id),
        eq(deviceCredentials.status, "active"),
      ),
    )
    .limit(1);

  return credential ? device : null;
}

async function deviceOtaBootstrap(body: unknown) {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const token = bearerToken(stringValue(input.authorization));

  if (!token) {
    const identity = deviceIdentifierFromBody(body);
    const pairedDevice = await pairedDeviceFromIdentity(identity);

    if (pairedDevice) {
      return {
        websocket: {
          url: websocketUrlFromBody(body),
          version: 1,
        },
        server_time: serverTimePayload(),
      };
    }

    return createDeviceActivation(body);
  }

  const credential = await deviceCredentialFromToken(token);
  if (!credential) {
    return createDeviceActivation(body);
  }

  const timestamp = nowDate();
  await db
    .update(deviceCredentials)
    .set({ lastUsedAt: timestamp, updatedAt: timestamp })
    .where(eq(deviceCredentials.id, credential.id));

  return {
    websocket: {
      url: websocketUrlFromBody(body),
      version: 1,
    },
    server_time: serverTimePayload(),
  };
}

async function completeDeviceActivation(body: unknown) {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const challenge = optionalTrimmed(input.challenge);
  const identity = deviceIdentifierFromBody(body);
  const [activation] = challenge
    ? await db
        .select()
        .from(deviceActivationRequests)
        .where(
          and(
            eq(deviceActivationRequests.challenge, challenge),
            gt(deviceActivationRequests.expiresAt, nowDate()),
          ),
        )
        .orderBy(desc(deviceActivationRequests.createdAt))
        .limit(1)
    : await db
        .select()
        .from(deviceActivationRequests)
        .where(
          and(
            eq(deviceActivationRequests.deviceIdentifier, identity.deviceIdentifier),
            gt(deviceActivationRequests.expiresAt, nowDate()),
          ),
        )
        .orderBy(desc(deviceActivationRequests.createdAt))
        .limit(1);

  if (!activation) {
    throw httpError("Activation request expired or was not found.", 404);
  }

  if (activation.status === "pending") {
    return {
      statusCode: 202,
      body: { ok: false, status: "pending" },
    };
  }

  if (activation.status !== "claimed") {
    throw httpError("Activation request is no longer active.", 409);
  }

  const timestamp = nowDate();
  await db
    .update(deviceActivationRequests)
    .set({ status: "completed", completedAt: timestamp, updatedAt: timestamp })
    .where(eq(deviceActivationRequests.id, activation.id));

  return {
    statusCode: 200,
    body: { ok: true, status: "completed" },
  };
}

function claimedDeviceInput(
  activation: DeviceActivationRequestRow,
): CreateDotDeviceInput {
  const serialNumber = activation.serialNumber || activation.deviceIdentifier;
  const compact = serialNumber.replace(/[^a-zA-Z0-9]/g, "");
  const suffix = compact.slice(-6).toUpperCase();

  return {
    name: suffix ? `Dot ${suffix}` : "Dot Device",
    model: "Dot S3",
    serialNumber,
    ipAddress: activation.ipAddress,
    deviceEndpoint: config.runtimePublicHttpUrl,
  };
}

async function claimDeviceActivation(
  context: UserContext,
  input: DeviceActivationClaimInput,
) {
  const code = trimRequired(input.code, "Activation code").replace(/\s+/g, "");
  const timestamp = nowDate();
  const [activation] = await db
    .select()
    .from(deviceActivationRequests)
    .where(
      and(
        eq(deviceActivationRequests.codeHash, hashToken(code)),
        eq(deviceActivationRequests.status, "pending"),
        gt(deviceActivationRequests.expiresAt, timestamp),
      ),
    )
    .orderBy(desc(deviceActivationRequests.createdAt))
    .limit(1);

  if (!activation) {
    throw httpError("Activation code was not found or expired.", 404);
  }

  const deviceInput = claimedDeviceInput(activation);
  const existingForUser = await findDeviceByExternalId(
    context,
    deviceInput.serialNumber,
    deviceInput.serialNumber,
  );
  const [existingForAnotherUser] = await db
    .select()
    .from(devices)
    .where(
      and(eq(devices.serialNumber, deviceInput.serialNumber), isNull(devices.deletedAt)),
    )
    .limit(1);

  if (existingForAnotherUser && existingForAnotherUser.userId !== context.user.id) {
    throw httpError("This device is already paired to another account.", 409);
  }

  const device = createDevice(deviceInput);
  const savedDevice = await saveDevice(context, {
    ...device,
    id: existingForUser?.id ?? device.id,
    availability: "available",
    lastSeenAt: timestamp.toISOString(),
    updatedAt: timestamp.toISOString(),
  });
  const deviceId = savedDevice?.id ?? existingForUser?.id ?? device.id;
  await db
    .update(devices)
    .set({ hardwareId: activation.deviceIdentifier, updatedAt: timestamp })
    .where(eq(devices.id, deviceId));

  await db.transaction(async (tx) => {
    await tx
      .update(deviceCredentials)
      .set({ status: "revoked", revokedAt: timestamp, updatedAt: timestamp })
      .where(
        and(
          eq(deviceCredentials.deviceId, deviceId),
          eq(deviceCredentials.status, "active"),
        ),
      );

    await tx.insert(deviceCredentials).values({
      id: randomUUID(),
      deviceId,
      prefix: activation.tokenPrefix,
      tokenHash: activation.tokenHash,
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
      lastUsedAt: null,
      revokedAt: null,
    });

    await tx
      .update(deviceActivationRequests)
      .set({
        status: "claimed",
        claimedByUserId: context.user.id,
        deviceId,
        claimedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(deviceActivationRequests.id, activation.id));
  });

  return publicDeviceById(context, deviceId);
}

async function verifyDeviceRuntimeToken(body: unknown) {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const token = trimRequired(input.token, "Device token");
  const credential = await deviceCredentialFromToken(token);

  if (!credential) {
    throw httpError("Device token is invalid.", 401);
  }

  const [device] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.id, credential.deviceId), isNull(devices.deletedAt)))
    .limit(1);

  if (!device) {
    throw httpError("Device is no longer paired.", 401);
  }

  const timestamp = nowDate();
  await db.transaction(async (tx) => {
    await tx
      .update(deviceCredentials)
      .set({ lastUsedAt: timestamp, updatedAt: timestamp })
      .where(eq(deviceCredentials.id, credential.id));

    await tx
      .insert(deviceState)
      .values({
        deviceId: device.id,
        availability: "available",
        lastSeenAt: timestamp,
        ipAddress: optionalTrimmed(input.ipAddress),
        firmwareVersion: null,
        runtimeVersion: null,
        reportedStateJson: {},
        desiredStateJson: {},
        updateMode: "idle",
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: deviceState.deviceId,
        set: {
          availability: "available",
          lastSeenAt: timestamp,
          ipAddress: optionalTrimmed(input.ipAddress),
          updatedAt: timestamp,
        },
      });
  });

  const publicDevice = await publicDeviceByOwnerId(device.userId, device.id);

  if (!publicDevice) {
    throw httpError("Device is no longer paired.", 401);
  }

  return {
    device: publicDevice,
    agent: await readRuntimeAgentForDevice(device.id),
  };
}

async function updateRuntimeDeviceState(body: unknown) {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const deviceId = trimRequired(input.deviceId, "Device id");
  const availabilityValue = availability(input.availability);
  const timestamp = nowDate();

  if (!isUuid(deviceId)) {
    throw httpError("Device id must be a UUID.", 400);
  }

  await db
    .update(deviceState)
    .set({
      availability: availabilityValue,
      lastSeenAt: timestamp,
      updatedAt: timestamp,
    })
    .where(eq(deviceState.deviceId, deviceId));

  return { ok: true };
}

async function createRuntimeVoiceSession(
  context: UserContext,
  input: RuntimeVoiceSessionInput,
) {
  const agentId = trimRequired(input.agentId, "Agent id");
  const agent = await readAgentForUser(context.user.id, agentId);

  if (!agent) {
    throw httpError("Agent not found.", 404);
  }

  const timestamp = nowDate();
  const expiresAt = new Date(timestamp.getTime() + 60 * 1000);
  const token = createRuntimeSessionToken();
  const url = new URL(config.runtimePublicVoiceUrl);
  url.searchParams.set("voice_token", token);

  await db.insert(runtimeSessionTokens).values({
    id: randomUUID(),
    userId: context.user.id,
    agentId,
    tokenHash: hashToken(token),
    status: "active",
    createdAt: timestamp,
    expiresAt,
    usedAt: null,
  });

  return {
    voiceSession: {
      url: url.toString(),
      expiresAt: expiresAt.toISOString(),
    },
  };
}

async function verifyRuntimeVoiceSession(body: unknown) {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const token = trimRequired(input.token, "Voice session token");
  const timestamp = nowDate();
  const [sessionToken] = await db
    .update(runtimeSessionTokens)
    .set({ status: "used", usedAt: timestamp })
    .where(
      and(
        eq(runtimeSessionTokens.tokenHash, hashToken(token)),
        eq(runtimeSessionTokens.status, "active"),
        gt(runtimeSessionTokens.expiresAt, timestamp),
      ),
    )
    .returning();

  if (!sessionToken) {
    throw httpError("Voice session token is invalid, expired, or already used.", 401);
  }

  const agent = await readAgentForUser(sessionToken.userId, sessionToken.agentId);

  if (!agent) {
    throw httpError("Agent not found.", 404);
  }

  return {
    userId: sessionToken.userId,
    agent,
  };
}

async function saveDevice(
  context: UserContext,
  device: DotDevice,
  existing: DotDevice | null = null,
) {
  const updatedAt = new Date(device.updatedAt);
  const lastSeenAt = device.lastSeenAt ? new Date(device.lastSeenAt) : null;

  await db.transaction(async (tx) => {
    await tx
      .insert(devices)
      .values({
        id: device.id,
        userId: context.user.id,
        serialNumber: device.serialNumber,
        hardwareId: null,
        model: device.model,
        displayName: device.name,
        deviceEndpoint: device.deviceEndpoint,
        status: "paired",
        createdAt: updatedAt,
        updatedAt,
        deletedAt: null,
      })
      .onConflictDoUpdate({
        target: devices.id,
        set: {
          serialNumber: device.serialNumber,
          model: device.model,
          displayName: device.name,
          deviceEndpoint: device.deviceEndpoint,
          status: "paired",
          updatedAt,
          deletedAt: null,
        },
      });

    await tx
      .insert(deviceState)
      .values({
        deviceId: device.id,
        availability: device.availability,
        lastSeenAt,
        ipAddress: device.ipAddress,
        firmwareVersion: null,
        runtimeVersion: null,
        reportedStateJson: {},
        desiredStateJson: {},
        updateMode: device.updateMode,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: deviceState.deviceId,
        set: {
          availability: device.availability,
          lastSeenAt,
          ipAddress: device.ipAddress,
          updateMode: device.updateMode,
          updatedAt,
        },
      });
  });

  const bindingChanged =
    device.boundAgentId !== existing?.boundAgentId ||
    device.boundConfigVersion !== existing?.boundConfigVersion ||
    device.boundAt !== existing?.boundAt;

  if (bindingChanged && device.boundAgentId) {
    await bindDeviceToAgent(context, device, device.boundAgentId);
  } else if (bindingChanged && existing?.boundAgentId && !device.boundAgentId) {
    await unbindDevice(device.id);
  }

  return publicDeviceById(context, device.id);
}

async function bindDeviceToAgent(
  context: UserContext,
  device: DotDevice,
  agentId: string,
) {
  if (!isUuid(agentId)) {
    throw new Error("Agent not found.");
  }

  const [agent] = await db
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.id, agentId),
        eq(agents.userId, context.user.id),
        isNull(agents.deletedAt),
      ),
    )
    .limit(1);

  if (!agent) {
    throw new Error("Agent not found.");
  }

  const [latestAgentVersion] = await db
    .select()
    .from(agentVersions)
    .where(eq(agentVersions.agentId, agent.id))
    .orderBy(desc(agentVersions.versionNumber))
    .limit(1);

  if (!latestAgentVersion?.pipelineVersionId) {
    throw new Error("Agent has no pipeline version.");
  }

  const pipelineVersionId = latestAgentVersion.pipelineVersionId;
  const timestamp = device.boundAt ? new Date(device.boundAt) : nowDate();
  const deploymentId = randomUUID();
  const targetId = randomUUID();

  await db.transaction(async (tx) => {
    await tx
      .update(deploymentDeviceTargets)
      .set({ status: "superseded", updatedAt: timestamp })
      .where(
        and(
          eq(deploymentDeviceTargets.deviceId, device.id),
          eq(deploymentDeviceTargets.status, "active"),
        ),
      );

    await tx.insert(deployments).values({
      id: deploymentId,
      userId: context.user.id,
      agentVersionId: latestAgentVersion.id,
      pipelineVersionId,
      name: `${agent.name} -> ${device.name}`,
      status: "active",
      rolloutStrategyJson: { kind: "single-device" },
      createdAt: timestamp,
      activatedAt: timestamp,
      supersededAt: null,
    });

    await tx.insert(deploymentDeviceTargets).values({
      id: targetId,
      deploymentId,
      deviceId: device.id,
      status: "active",
      desiredConfigVersion: device.boundConfigVersion,
      appliedConfigVersion: device.boundConfigVersion,
      appliedAt: timestamp,
      lastError: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });
}

async function unbindDevice(deviceId: string) {
  const timestamp = nowDate();
  await db
    .update(deploymentDeviceTargets)
    .set({ status: "removed", updatedAt: timestamp })
    .where(
      and(
        eq(deploymentDeviceTargets.deviceId, deviceId),
        eq(deploymentDeviceTargets.status, "active"),
      ),
    );
}

async function deleteDevice(context: UserContext, id: string) {
  const row = await findDeviceByExternalId(context, id);
  if (!row) {
    return;
  }

  const timestamp = nowDate();
  await db.transaction(async (tx) => {
    await tx
      .update(devices)
      .set({ status: "removed", deletedAt: timestamp, updatedAt: timestamp })
      .where(eq(devices.id, row.id));
    await tx
      .update(deploymentDeviceTargets)
      .set({ status: "removed", updatedAt: timestamp })
      .where(
        and(
          eq(deploymentDeviceTargets.deviceId, row.id),
          eq(deploymentDeviceTargets.status, "active"),
        ),
      );
  });
}

const server = Fastify({ logger: true });

await server.register(cors, {
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
});

server.get("/health", async () => {
  await pool.query("select 1");
  return { ok: true };
});

server.get("/api/health", async () => {
  await pool.query("select 1");
  return { ok: true };
});

server.get("/api/auth/config", async () => ({
  localAuthEnabled: isLocalAuthEnabled(),
  supabaseConfigured: Boolean(process.env.SUPABASE_URL),
}));

server.post("/api/internal/device-activations/bootstrap", async (request) => {
  ensureRuntimeInternalRequest(request.headers["x-opendot-runtime-secret"]);
  return deviceOtaBootstrap(request.body);
});

server.post("/api/internal/device-activations/activate", async (request, reply) => {
  ensureRuntimeInternalRequest(request.headers["x-opendot-runtime-secret"]);
  const result = await completeDeviceActivation(request.body);
  return reply.code(result.statusCode).send(result.body);
});

server.post("/api/internal/device-runtime/verify", async (request) => {
  ensureRuntimeInternalRequest(request.headers["x-opendot-runtime-secret"]);
  return verifyDeviceRuntimeToken(request.body);
});

server.post("/api/internal/device-runtime/state", async (request) => {
  ensureRuntimeInternalRequest(request.headers["x-opendot-runtime-secret"]);
  return updateRuntimeDeviceState(request.body);
});

server.post("/api/internal/runtime/voice-sessions/verify", async (request) => {
  ensureRuntimeInternalRequest(request.headers["x-opendot-runtime-secret"]);
  return verifyRuntimeVoiceSession(request.body);
});

server.post("/api/auth/signup", async (request, reply) => {
  const session = await signupWithLocalPassword(request.body);
  return reply.code(201).send(session);
});

server.post("/api/auth/login", async (request) => {
  return loginWithLocalPassword(request.body);
});

server.get("/api/auth/session", async (request) => {
  return authSessionFromRequest(request.headers.authorization);
});

server.post("/api/auth/logout", async () => ({ ok: true }));

server.get("/api/platform-state", async (request) => {
  const context = await contextFromRequest(request.headers.authorization);
  return readPlatformState(context);
});

server.post<{ Body: CreateAgentInput }>("/api/agents", async (request, reply) => {
  const context = await contextFromRequest(request.headers.authorization);
  const agent = await createAgent(context, request.body ?? ({} as CreateAgentInput));
  return reply.code(201).send({ agent });
});

server.put<{ Params: { id: string }; Body: Partial<VoiceAgent> }>(
  "/api/agents/:id",
  async (request, reply) => {
    const context = await contextFromRequest(request.headers.authorization);
    const agent = await updateAgent(context, request.params.id, request.body ?? {});

    if (!agent) {
      return reply.code(404).send({ error: "Agent not found." });
    }

    return { agent };
  },
);

server.delete<{ Params: { id: string } }>("/api/agents/:id", async (request) => {
  const context = await contextFromRequest(request.headers.authorization);
  await deleteAgent(context, request.params.id);
  return { ok: true };
});

server.get("/api/dot-devices", async (request) => {
  const context = await contextFromRequest(request.headers.authorization);
  return { devices: await readDevices(context) };
});

server.post<{ Body: CreateDotDeviceInput }>(
  "/api/dot-devices",
  async (request, reply) => {
    const context = await contextFromRequest(request.headers.authorization);
    const device = createDevice(request.body ?? ({} as CreateDotDeviceInput));
    const savedDevice = await saveDevice(context, device);
    return reply.code(201).send({ device: savedDevice ?? device });
  },
);

server.put<{ Params: { id: string }; Body: Partial<DotDevice> }>(
  "/api/dot-devices/:id",
  async (request) => {
    const context = await contextFromRequest(request.headers.authorization);
    const body = request.body ?? {};
    const existingRow = await findDeviceByExternalId(
      context,
      request.params.id,
      body.serialNumber ?? null,
    );
    const existing = existingRow ? await publicDeviceById(context, existingRow.id) : null;
    const deviceId =
      existing?.id ?? (isUuid(request.params.id) ? request.params.id : randomUUID());
    const device = mergeDevice(deviceId, existing, body);
    const savedDevice = await saveDevice(context, device, existing);

    return { device: savedDevice ?? device };
  },
);

server.delete<{ Params: { id: string } }>("/api/dot-devices/:id", async (request) => {
  const context = await contextFromRequest(request.headers.authorization);
  await deleteDevice(context, request.params.id);
  return { ok: true };
});

server.post<{ Body: DeviceActivationClaimInput }>(
  "/api/device-activations/claim",
  async (request, reply) => {
    const context = await contextFromRequest(request.headers.authorization);
    const device = await claimDeviceActivation(context, request.body ?? {});

    if (!device) {
      return reply.code(404).send({ error: "Claimed device was not found." });
    }

    return reply.code(201).send({ device });
  },
);

server.post<{ Body: RuntimeVoiceSessionInput }>(
  "/api/runtime/voice-sessions",
  async (request, reply) => {
    const context = await contextFromRequest(request.headers.authorization);
    return reply
      .code(201)
      .send(await createRuntimeVoiceSession(context, request.body ?? {}));
  },
);

server.put<{ Body: Partial<UserSettings> }>("/api/settings", async (request) => {
  const context = await contextFromRequest(request.headers.authorization);
  const current = settingsFromRows(context.user, context.preferences);
  const body = request.body ?? {};
  const timestamp = nowDate();
  const next: UserSettings = {
    displayName: stringValue(
      body.displayName ?? current.displayName,
      current.displayName,
    ),
    email: stringValue(body.email ?? current.email, current.email),
    workspaceName: stringValue(
      body.workspaceName ?? current.workspaceName,
      current.workspaceName,
    ),
    timezone: stringValue(body.timezone ?? current.timezone, current.timezone),
    compactMode: Boolean(body.compactMode ?? current.compactMode),
  };

  await db.transaction(async (tx) => {
    await tx
      .update(appUsers)
      .set({
        displayName: next.displayName,
        email: next.email,
        updatedAt: timestamp,
      })
      .where(eq(appUsers.id, context.user.id));
    await tx
      .insert(userPreferences)
      .values({
        userId: context.user.id,
        workspaceName: next.workspaceName,
        timezone: next.timezone,
        compactMode: next.compactMode,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          workspaceName: next.workspaceName,
          timezone: next.timezone,
          compactMode: next.compactMode,
          updatedAt: timestamp,
        },
      });
  });

  return { settings: next };
});

server.post<{ Body: { name?: string } }>("/api/api-keys", async (request, reply) => {
  const context = await contextFromRequest(request.headers.authorization);
  const token = createApiToken();
  const timestamp = nowDate();
  const row = {
    id: randomUUID(),
    userId: context.user.id,
    name: trimRequired(request.body?.name, "Key name"),
    tokenHash: hashToken(token),
    prefix: token.slice(0, 14),
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
  };

  await db.insert(apiKeys).values(row);
  return reply.code(201).send({ apiKey: apiKeyFromRow(row, token) });
});

server.post<{ Params: { id: string } }>("/api/api-keys/:id/revoke", async (request) => {
  const context = await contextFromRequest(request.headers.authorization);

  if (!isUuid(request.params.id)) {
    return { apiKey: null };
  }

  const timestamp = nowDate();
  await db
    .update(apiKeys)
    .set({ status: "revoked", revokedAt: timestamp, updatedAt: timestamp })
    .where(
      and(
        eq(apiKeys.id, request.params.id),
        eq(apiKeys.userId, context.user.id),
        eq(apiKeys.status, "active"),
      ),
    );
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.id, request.params.id), eq(apiKeys.userId, context.user.id)))
    .limit(1);

  return { apiKey: row ? apiKeyFromRow(row) : null };
});

server.setErrorHandler((error, _request, reply) => {
  const message = error instanceof Error ? error.message : String(error);
  const maybeStatus =
    error && typeof error === "object" && "statusCode" in error ? error.statusCode : null;
  const statusCode =
    typeof maybeStatus === "number"
      ? maybeStatus
      : message.endsWith("is required.")
        ? 400
        : 500;
  server.log.error(error);
  reply.code(statusCode).send({ error: message });
});

try {
  await server.listen({ host: config.host, port: config.port });
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
