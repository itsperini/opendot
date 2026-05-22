import "./env.js";

import cors from "@fastify/cors";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import Fastify from "fastify";
import {
  createHash,
  randomBytes,
  randomUUID,
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
  deviceAssignments,
  deviceState,
  devices,
  environments,
  localAuthCredentials,
  organizationMemberships,
  organizations,
  pipelineVersions,
  pipelines,
  projects,
  userPreferences,
  type AgentRow,
  type AgentVersionRow,
  type ApiKeyRow,
  type AppUserRow,
  type DeploymentDeviceTargetRow,
  type DeploymentRow,
  type DeviceRow,
  type DeviceStateRow,
  type LocalAuthCredentialRow,
  type OrganizationRow,
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

const DEFAULT_ORG_ID =
  process.env.OPENDOT_DEV_ORG_ID || "00000000-0000-4000-8000-000000000101";
const DEFAULT_PROJECT_ID =
  process.env.OPENDOT_DEV_PROJECT_ID || "00000000-0000-4000-8000-000000000201";
const DEFAULT_ENVIRONMENT_ID =
  process.env.OPENDOT_DEV_ENVIRONMENT_ID || "00000000-0000-4000-8000-000000000301";

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
};

type WorkspaceContext = {
  identity: AuthIdentity;
  user: AppUserRow;
  organization: OrganizationRow;
  project: typeof projects.$inferSelect;
  environment: typeof environments.$inferSelect;
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

function deterministicUuid(scope: string, value: string) {
  const bytes = Buffer.from(
    createHash("sha256").update(`${scope}:${value}`).digest("hex"),
    "hex",
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
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
  return value === "checking" || value === "binding" || value === "idle"
    ? value
    : "idle";
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
  organization: OrganizationRow,
  preferences: UserPreferenceRow,
): UserSettings {
  return {
    displayName: user.displayName || defaultUserSettings.displayName,
    email: user.email || defaultUserSettings.email,
    workspaceName: organization.name || defaultUserSettings.workspaceName,
    timezone: preferences.timezone || defaultUserSettings.timezone,
    compactMode: preferences.compactMode,
  };
}

function authUserFromWorkspace(workspace: WorkspaceContext): AuthSessionUser {
  return {
    id: workspace.user.id,
    authProvider: workspace.identity.authProvider,
    email: workspace.user.email,
    displayName: workspace.user.displayName,
    avatarUrl: workspace.user.avatarUrl,
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
  const workspace = await ensureWorkspace(identity);

  return {
    accessToken,
    user: authUserFromWorkspace(workspace),
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

async function ensureWorkspace(identity: AuthIdentity): Promise<WorkspaceContext> {
  const timestamp = nowDate();
  const organizationId =
    identity.authProvider === "dev"
      ? DEFAULT_ORG_ID
      : deterministicUuid("organization", identity.id);
  const projectId =
    identity.authProvider === "dev"
      ? DEFAULT_PROJECT_ID
      : deterministicUuid("project", organizationId);
  const environmentId =
    identity.authProvider === "dev"
      ? DEFAULT_ENVIRONMENT_ID
      : deterministicUuid("environment", projectId);

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

  const [existingMembership] = await db
    .select()
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.userId, identity.id),
        eq(organizationMemberships.status, "active"),
      ),
    )
    .limit(1);

  const resolvedOrganizationId = existingMembership?.organizationId ?? organizationId;

  if (!existingMembership) {
    await db
      .insert(organizations)
      .values({
        id: resolvedOrganizationId,
        slug:
          identity.authProvider === "dev"
            ? "opendot-lab"
            : `workspace-${identity.id.slice(0, 8)}`,
        name: defaultUserSettings.workspaceName,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      })
      .onConflictDoNothing();

    await db
      .insert(organizationMemberships)
      .values({
        id: randomUUID(),
        organizationId: resolvedOrganizationId,
        userId: identity.id,
        role: "owner",
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoNothing();
  }

  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, resolvedOrganizationId))
    .limit(1);

  if (!organization) {
    throw new Error("Organization could not be resolved.");
  }

  const [existingProject] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organization.id),
        eq(projects.slug, "default"),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);

  const resolvedProject =
    existingProject ??
    (
      await db
        .insert(projects)
        .values({
          id: projectId,
          organizationId: organization.id,
          slug: "default",
          name: "Default project",
          createdAt: timestamp,
          updatedAt: timestamp,
          deletedAt: null,
        })
        .returning()
    )[0];

  const [existingEnvironment] = await db
    .select()
    .from(environments)
    .where(
      and(
        eq(environments.projectId, resolvedProject.id),
        eq(environments.key, "local"),
        isNull(environments.deletedAt),
      ),
    )
    .limit(1);

  const resolvedEnvironment =
    existingEnvironment ??
    (
      await db
        .insert(environments)
        .values({
          id: environmentId,
          projectId: resolvedProject.id,
          key: "local",
          name: "Local",
          kind: "local",
          createdAt: timestamp,
          updatedAt: timestamp,
          deletedAt: null,
        })
        .returning()
    )[0];

  const [preferences] = await db
    .insert(userPreferences)
    .values({
      userId: identity.id,
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
    organization,
    project: resolvedProject,
    environment: resolvedEnvironment,
    preferences,
  };
}

async function workspaceFromRequest(
  authorization: string | string[] | undefined,
) {
  return ensureWorkspace(await resolveAuthIdentity(authorization));
}

function hasBearerToken(authorization: string | string[] | undefined) {
  const header = Array.isArray(authorization) ? authorization[0] : authorization;
  return Boolean(header?.match(/^Bearer\s+.+$/i));
}

async function authSessionFromRequest(
  authorization: string | string[] | undefined,
) {
  if (!hasBearerToken(authorization)) {
    throw httpError("An active session is required.", 401);
  }

  const workspace = await workspaceFromRequest(authorization);
  return { user: authUserFromWorkspace(workspace) };
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

async function latestPipelineVersions(pipelineIds: string[]) {
  if (pipelineIds.length === 0) {
    return new Map<string, PipelineVersionRow>();
  }

  const rows = await db
    .select()
    .from(pipelineVersions)
    .where(inArray(pipelineVersions.pipelineId, pipelineIds))
    .orderBy(desc(pipelineVersions.versionNumber));
  const latest = new Map<string, PipelineVersionRow>();

  for (const row of rows) {
    if (!latest.has(row.pipelineId)) {
      latest.set(row.pipelineId, row);
    }
  }

  return latest;
}

async function readAgents(workspace: WorkspaceContext) {
  const agentRows = await db
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.organizationId, workspace.organization.id),
        eq(agents.projectId, workspace.project.id),
        isNull(agents.deletedAt),
      ),
    )
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
  const pipelineVersionById = new Map(
    pipelineVersionRows.map((row) => [row.id, row]),
  );

  return agentRows.map((agent) => {
    const agentVersion = latestAgentVersionByAgent.get(agent.id) ?? null;
    const pipelineVersion = agentVersion?.pipelineVersionId
      ? pipelineVersionById.get(agentVersion.pipelineVersionId) ?? null
      : null;
    return agentFromRows(agent, agentVersion, pipelineVersion);
  });
}

async function readDevices(workspace: WorkspaceContext) {
  const deviceRows = await db
    .select()
    .from(devices)
    .where(
      and(
        eq(devices.organizationId, workspace.organization.id),
        isNull(devices.deletedAt),
      ),
    )
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

async function readPlatformState(workspace: WorkspaceContext) {
  const [agentRows, deviceRows, apiKeyRows] = await Promise.all([
    readAgents(workspace),
    readDevices(workspace),
    db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.organizationId, workspace.organization.id))
      .orderBy(desc(apiKeys.createdAt)),
  ]);

  return {
    agents: agentRows,
    devices: deviceRows,
    userSettings: settingsFromRows(
      workspace.user,
      workspace.organization,
      workspace.preferences,
    ),
    apiKeys: apiKeyRows.map((row) => apiKeyFromRow(row)),
  };
}

async function createAgent(workspace: WorkspaceContext, input: CreateAgentInput) {
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
      organizationId: workspace.organization.id,
      projectId: workspace.project.id,
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
      createdByUserId: workspace.user.id,
      createdAt: timestamp,
      publishedAt: null,
    });

    await tx.insert(agents).values({
      id: agentId,
      organizationId: workspace.organization.id,
      projectId: workspace.project.id,
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
      createdByUserId: workspace.user.id,
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
  workspace: WorkspaceContext,
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
        eq(agents.organizationId, workspace.organization.id),
        eq(agents.projectId, workspace.project.id),
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
        organizationId: workspace.organization.id,
        projectId: workspace.project.id,
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
      createdByUserId: workspace.user.id,
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
      createdByUserId: workspace.user.id,
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
    boundConfigVersion:
      body.boundConfigVersion ?? existing?.boundConfigVersion ?? null,
    boundAt: body.boundAt ?? existing?.boundAt ?? null,
    updateMode: updateMode(body.updateMode ?? existing?.updateMode),
    updatedAt,
  };
}

async function findDeviceByExternalId(
  workspace: WorkspaceContext,
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
          eq(devices.organizationId, workspace.organization.id),
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
        eq(devices.organizationId, workspace.organization.id),
        eq(devices.serialNumber, serial),
        isNull(devices.deletedAt),
      ),
    )
    .limit(1);

  return row ?? null;
}

async function publicDeviceById(workspace: WorkspaceContext, deviceId: string) {
  const allDevices = await readDevices(workspace);
  return allDevices.find((device) => device.id === deviceId) ?? null;
}

async function saveDevice(
  workspace: WorkspaceContext,
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
        organizationId: workspace.organization.id,
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

    if (!existing) {
      await tx.insert(deviceAssignments).values({
        id: randomUUID(),
        deviceId: device.id,
        environmentId: workspace.environment.id,
        assignedAt: updatedAt,
        removedAt: null,
      });
    }
  });

  const bindingChanged =
    device.boundAgentId !== existing?.boundAgentId ||
    device.boundConfigVersion !== existing?.boundConfigVersion ||
    device.boundAt !== existing?.boundAt;

  if (bindingChanged && device.boundAgentId) {
    await bindDeviceToAgent(workspace, device, device.boundAgentId);
  } else if (bindingChanged && existing?.boundAgentId && !device.boundAgentId) {
    await unbindDevice(device.id);
  }

  return publicDeviceById(workspace, device.id);
}

async function bindDeviceToAgent(
  workspace: WorkspaceContext,
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
        eq(agents.organizationId, workspace.organization.id),
        eq(agents.projectId, workspace.project.id),
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
      organizationId: workspace.organization.id,
      projectId: workspace.project.id,
      environmentId: workspace.environment.id,
      agentVersionId: latestAgentVersion.id,
      pipelineVersionId,
      name: `${agent.name} -> ${device.name}`,
      status: "active",
      rolloutStrategyJson: { kind: "single-device" },
      createdByUserId: workspace.user.id,
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

async function deleteDevice(workspace: WorkspaceContext, id: string) {
  const row = await findDeviceByExternalId(workspace, id);
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
      .update(deviceAssignments)
      .set({ removedAt: timestamp })
      .where(
        and(
          eq(deviceAssignments.deviceId, row.id),
          isNull(deviceAssignments.removedAt),
        ),
      );
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
  const workspace = await workspaceFromRequest(request.headers.authorization);
  return readPlatformState(workspace);
});

server.post<{ Body: CreateAgentInput }>("/api/agents", async (request, reply) => {
  const workspace = await workspaceFromRequest(request.headers.authorization);
  const agent = await createAgent(workspace, request.body ?? ({} as CreateAgentInput));
  return reply.code(201).send({ agent });
});

server.put<{ Params: { id: string }; Body: Partial<VoiceAgent> }>(
  "/api/agents/:id",
  async (request, reply) => {
    const workspace = await workspaceFromRequest(request.headers.authorization);
    const agent = await updateAgent(workspace, request.params.id, request.body ?? {});

    if (!agent) {
      return reply.code(404).send({ error: "Agent not found." });
    }

    return { agent };
  },
);

server.get("/api/dot-devices", async (request) => {
  const workspace = await workspaceFromRequest(request.headers.authorization);
  return { devices: await readDevices(workspace) };
});

server.post<{ Body: CreateDotDeviceInput }>("/api/dot-devices", async (request, reply) => {
  const workspace = await workspaceFromRequest(request.headers.authorization);
  const device = createDevice(request.body ?? ({} as CreateDotDeviceInput));
  const savedDevice = await saveDevice(workspace, device);
  return reply.code(201).send({ device: savedDevice ?? device });
});

server.put<{ Params: { id: string }; Body: Partial<DotDevice> }>(
  "/api/dot-devices/:id",
  async (request) => {
    const workspace = await workspaceFromRequest(request.headers.authorization);
    const body = request.body ?? {};
    const existingRow = await findDeviceByExternalId(
      workspace,
      request.params.id,
      body.serialNumber ?? null,
    );
    const existing = existingRow ? await publicDeviceById(workspace, existingRow.id) : null;
    const deviceId = existing?.id ?? (isUuid(request.params.id) ? request.params.id : randomUUID());
    const device = mergeDevice(deviceId, existing, body);
    const savedDevice = await saveDevice(workspace, device, existing);

    return { device: savedDevice ?? device };
  },
);

server.delete<{ Params: { id: string } }>("/api/dot-devices/:id", async (request) => {
  const workspace = await workspaceFromRequest(request.headers.authorization);
  await deleteDevice(workspace, request.params.id);
  return { ok: true };
});

server.put<{ Body: Partial<UserSettings> }>("/api/settings", async (request) => {
  const workspace = await workspaceFromRequest(request.headers.authorization);
  const current = settingsFromRows(
    workspace.user,
    workspace.organization,
    workspace.preferences,
  );
  const body = request.body ?? {};
  const timestamp = nowDate();
  const next: UserSettings = {
    displayName: stringValue(body.displayName ?? current.displayName, current.displayName),
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
      .where(eq(appUsers.id, workspace.user.id));
    await tx
      .update(organizations)
      .set({
        name: next.workspaceName,
        updatedAt: timestamp,
      })
      .where(eq(organizations.id, workspace.organization.id));
    await tx
      .insert(userPreferences)
      .values({
        userId: workspace.user.id,
        timezone: next.timezone,
        compactMode: next.compactMode,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          timezone: next.timezone,
          compactMode: next.compactMode,
          updatedAt: timestamp,
        },
      });
  });

  return { settings: next };
});

server.post<{ Body: { name?: string } }>("/api/api-keys", async (request, reply) => {
  const workspace = await workspaceFromRequest(request.headers.authorization);
  const token = createApiToken();
  const timestamp = nowDate();
  const row = {
    id: randomUUID(),
    organizationId: workspace.organization.id,
    projectId: workspace.project.id,
    environmentId: workspace.environment.id,
    name: trimRequired(request.body?.name, "Key name"),
    tokenHash: hashToken(token),
    prefix: token.slice(0, 14),
    scopes: ["platform:read", "platform:write"],
    status: "active",
    createdByUserId: workspace.user.id,
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
  const workspace = await workspaceFromRequest(request.headers.authorization);

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
        eq(apiKeys.organizationId, workspace.organization.id),
        eq(apiKeys.status, "active"),
      ),
    );
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.id, request.params.id),
        eq(apiKeys.organizationId, workspace.organization.id),
      ),
    )
    .limit(1);

  return { apiKey: row ? apiKeyFromRow(row) : null };
});

server.setErrorHandler((error, _request, reply) => {
  const message = error instanceof Error ? error.message : String(error);
  const maybeStatus =
    error && typeof error === "object" && "statusCode" in error
      ? error.statusCode
      : null;
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
