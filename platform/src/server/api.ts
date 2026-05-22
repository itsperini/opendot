import "dotenv/config";

import cors from "@fastify/cors";
import { and, desc, eq } from "drizzle-orm";
import Fastify from "fastify";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db, pool } from "./db/client.js";
import {
  apiKeys,
  dotDevices,
  userSettings,
  voiceAgents,
  type ApiKeyRow,
  type DotDeviceRow,
  type UserSettingsRow,
  type VoiceAgentRow,
} from "./db/schema.js";
import { createDefaultPipeline, normalizeVoiceAgent } from "../lib/pipeline.js";
import type {
  CreateAgentInput,
  CreateDotDeviceInput,
  DotDevice,
  DotDeviceAvailability,
  DotDeviceUpdateMode,
  UserApiKey,
  UserSettings,
  VoiceAgent,
} from "../types.js";

const DEFAULT_SETTINGS_ID = "default";
const defaultUserSettings: UserSettings = {
  displayName: "Marco",
  email: "",
  workspaceName: "OpenDot Lab",
  timezone: "Europe/Zurich",
  compactMode: false,
};

const config = {
  host: process.env.PLATFORM_API_HOST || "0.0.0.0",
  port: Number(process.env.PLATFORM_API_PORT || 8788),
};

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix = "agent") {
  return `${prefix}_${randomUUID()}`;
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function trimRequired(value: unknown, field: string) {
  const trimmed = stringValue(value).trim();
  if (!trimmed) {
    throw new Error(`${field} is required.`);
  }
  return trimmed;
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

function createApiToken() {
  return `od_sk_${randomBytes(24).toString("hex")}`;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function apiKeyFromRow(row: ApiKeyRow, token: string | null = null): UserApiKey {
  return {
    id: row.id,
    name: row.name,
    token,
    prefix: row.prefix,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    status: row.status === "revoked" ? "revoked" : "active",
  };
}

function agentFromRow(row: VoiceAgentRow): VoiceAgent {
  return normalizeVoiceAgent({
    id: row.id,
    name: row.name,
    description: row.description,
    status: "draft",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    pipeline: Array.isArray(row.pipeline) ? row.pipeline : createDefaultPipeline(),
  });
}

function deviceFromRow(row: DotDeviceRow): DotDevice {
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    serialNumber: row.serialNumber,
    availability: availability(row.availability),
    ipAddress: row.ipAddress,
    deviceEndpoint: row.deviceEndpoint,
    lastSeenAt: row.lastSeenAt,
    boundAgentId: row.boundAgentId,
    boundAgentName: row.boundAgentName,
    boundConfigVersion: row.boundConfigVersion,
    boundAt: row.boundAt,
    updateMode: updateMode(row.updateMode),
    updatedAt: row.updatedAt,
  };
}

function settingsFromRow(row: UserSettingsRow | undefined): UserSettings {
  if (!row) {
    return defaultUserSettings;
  }

  return {
    displayName: row.displayName,
    email: row.email,
    workspaceName: row.workspaceName,
    timezone: row.timezone,
    compactMode: row.compactMode,
  };
}

function agentToRow(agent: VoiceAgent): typeof voiceAgents.$inferInsert {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    status: agent.status,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
    pipeline: agent.pipeline,
  };
}

function deviceToRow(device: DotDevice): typeof dotDevices.$inferInsert {
  return {
    id: device.id,
    name: device.name,
    model: device.model,
    serialNumber: device.serialNumber,
    availability: device.availability,
    ipAddress: device.ipAddress,
    deviceEndpoint: device.deviceEndpoint,
    lastSeenAt: device.lastSeenAt,
    boundAgentId: device.boundAgentId,
    boundAgentName: device.boundAgentName,
    boundConfigVersion: device.boundConfigVersion,
    boundAt: device.boundAt,
    updateMode: device.updateMode,
    updatedAt: device.updatedAt,
  };
}

async function ensureUserSettings() {
  const existing = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.id, DEFAULT_SETTINGS_ID))
    .limit(1);

  if (existing[0]) {
    return existing[0];
  }

  const row = {
    id: DEFAULT_SETTINGS_ID,
    ...defaultUserSettings,
  };
  await db.insert(userSettings).values(row).onConflictDoNothing();
  return row;
}

async function readPlatformState() {
  const [agentRows, deviceRows, settingsRow, apiKeyRows] = await Promise.all([
    db.select().from(voiceAgents).orderBy(desc(voiceAgents.updatedAt)),
    db.select().from(dotDevices).orderBy(desc(dotDevices.updatedAt)),
    ensureUserSettings(),
    db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt)),
  ]);

  return {
    agents: agentRows.map(agentFromRow),
    devices: deviceRows.map(deviceFromRow),
    userSettings: settingsFromRow(settingsRow),
    apiKeys: apiKeyRows.map((row) => apiKeyFromRow(row)),
  };
}

function createAgent(input: CreateAgentInput): VoiceAgent {
  const createdAt = nowIso();
  return {
    id: createId("agent"),
    name: trimRequired(input.name, "Agent name"),
    description: trimRequired(input.description, "Agent description"),
    status: "draft",
    createdAt,
    updatedAt: createdAt,
    pipeline: createDefaultPipeline(),
  };
}

function createDevice(input: CreateDotDeviceInput): DotDevice {
  const updatedAt = nowIso();
  const serialNumber = trimRequired(input.serialNumber, "Serial number");

  return {
    id: createId("dot"),
    name: trimRequired(input.name, "Device name"),
    model: stringValue(input.model, "Dot S3").trim() || "Dot S3",
    serialNumber,
    availability: "unknown",
    ipAddress: stringValue(input.ipAddress),
    deviceEndpoint: stringValue(input.deviceEndpoint, "demo://custom-dot").trim() || "demo://custom-dot",
    lastSeenAt: null,
    boundAgentId: null,
    boundAgentName: null,
    boundConfigVersion: null,
    boundAt: null,
    updateMode: "idle",
    updatedAt,
  };
}

function mergeDevice(id: string, existing: DotDevice | null, body: Partial<DotDevice>): DotDevice {
  const updatedAt = nowIso();
  return {
    id,
    name: trimRequired(body.name ?? existing?.name, "Device name"),
    model: stringValue(body.model ?? existing?.model, "Dot S3").trim() || "Dot S3",
    serialNumber: trimRequired(body.serialNumber ?? existing?.serialNumber, "Serial number"),
    availability: availability(body.availability ?? existing?.availability),
    ipAddress: stringValue(body.ipAddress ?? existing?.ipAddress),
    deviceEndpoint:
      stringValue(body.deviceEndpoint ?? existing?.deviceEndpoint, "demo://custom-dot").trim() ||
      "demo://custom-dot",
    lastSeenAt: body.lastSeenAt ?? existing?.lastSeenAt ?? null,
    boundAgentId: body.boundAgentId ?? existing?.boundAgentId ?? null,
    boundAgentName: body.boundAgentName ?? existing?.boundAgentName ?? null,
    boundConfigVersion: body.boundConfigVersion ?? existing?.boundConfigVersion ?? null,
    boundAt: body.boundAt ?? existing?.boundAt ?? null,
    updateMode: updateMode(body.updateMode ?? existing?.updateMode),
    updatedAt,
  };
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

server.get("/api/platform-state", async () => readPlatformState());

server.post<{ Body: CreateAgentInput }>("/api/agents", async (request, reply) => {
  const agent = createAgent(request.body ?? ({} as CreateAgentInput));
  await db.insert(voiceAgents).values(agentToRow(agent));
  return reply.code(201).send({ agent });
});

server.put<{ Params: { id: string }; Body: Partial<VoiceAgent> }>(
  "/api/agents/:id",
  async (request, reply) => {
    const [row] = await db
      .select()
      .from(voiceAgents)
      .where(eq(voiceAgents.id, request.params.id))
      .limit(1);

    if (!row) {
      return reply.code(404).send({ error: "Agent not found." });
    }

    const current = agentFromRow(row);
    const body = request.body ?? {};
    const pipeline = Array.isArray(body.pipeline) ? body.pipeline : current.pipeline;
    const agent = normalizeVoiceAgent({
      ...current,
      name: trimRequired(body.name ?? current.name, "Agent name"),
      description: trimRequired(
        body.description ?? current.description,
        "Agent description",
      ),
      pipeline,
      updatedAt: nowIso(),
    });

    await db
      .update(voiceAgents)
      .set(agentToRow(agent))
      .where(eq(voiceAgents.id, request.params.id));

    return { agent };
  },
);

server.get("/api/dot-devices", async () => {
  const rows = await db.select().from(dotDevices).orderBy(desc(dotDevices.updatedAt));
  return { devices: rows.map(deviceFromRow) };
});

server.post<{ Body: CreateDotDeviceInput }>("/api/dot-devices", async (request, reply) => {
  const device = createDevice(request.body ?? ({} as CreateDotDeviceInput));
  await db.insert(dotDevices).values(deviceToRow(device));
  return reply.code(201).send({ device });
});

server.put<{ Params: { id: string }; Body: Partial<DotDevice> }>(
  "/api/dot-devices/:id",
  async (request) => {
    const [row] = await db
      .select()
      .from(dotDevices)
      .where(eq(dotDevices.id, request.params.id))
      .limit(1);
    const existing = row ? deviceFromRow(row) : null;
    const device = mergeDevice(request.params.id, existing, request.body ?? {});

    await db
      .insert(dotDevices)
      .values(deviceToRow(device))
      .onConflictDoUpdate({
        target: dotDevices.id,
        set: deviceToRow(device),
      });

    return { device };
  },
);

server.delete<{ Params: { id: string } }>("/api/dot-devices/:id", async (request) => {
  await db.delete(dotDevices).where(eq(dotDevices.id, request.params.id));
  return { ok: true };
});

server.put<{ Body: Partial<UserSettings> }>("/api/settings", async (request) => {
  const current = settingsFromRow(await ensureUserSettings());
  const body = request.body ?? {};
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

  await db
    .insert(userSettings)
    .values({ id: DEFAULT_SETTINGS_ID, ...next })
    .onConflictDoUpdate({
      target: userSettings.id,
      set: next,
    });

  return { settings: next };
});

server.post<{ Body: { name?: string } }>("/api/api-keys", async (request, reply) => {
  const token = createApiToken();
  const createdAt = nowIso();
  const row = {
    id: createId("api_key"),
    name: trimRequired(request.body?.name, "Key name"),
    tokenHash: hashToken(token),
    prefix: token.slice(0, 14),
    createdAt,
    lastUsedAt: null,
    status: "active",
  };

  await db.insert(apiKeys).values(row);
  return reply.code(201).send({ apiKey: apiKeyFromRow(row, token) });
});

server.post<{ Params: { id: string } }>("/api/api-keys/:id/revoke", async (request) => {
  await db
    .update(apiKeys)
    .set({ status: "revoked" })
    .where(and(eq(apiKeys.id, request.params.id), eq(apiKeys.status, "active")));
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.id, request.params.id))
    .limit(1);

  return { apiKey: row ? apiKeyFromRow(row) : null };
});

server.setErrorHandler((error, _request, reply) => {
  const message = error instanceof Error ? error.message : String(error);
  const statusCode = message.endsWith("is required.") ? 400 : 500;
  server.log.error(error);
  reply.code(statusCode).send({ error: message });
});

try {
  await server.listen({ host: config.host, port: config.port });
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
