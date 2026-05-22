import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { PipelineStage } from "../../types.js";

type JsonObject = Record<string, unknown>;

const timestampConfig = { withTimezone: true } as const;

const lifecycleColumns = {
  createdAt: timestamp("created_at", timestampConfig).notNull(),
  updatedAt: timestamp("updated_at", timestampConfig).notNull(),
  deletedAt: timestamp("deleted_at", timestampConfig),
};

export const appUsers = pgTable(
  "app_users",
  {
    id: uuid("id").primaryKey(),
    authProvider: text("auth_provider").notNull(),
    authSubject: text("auth_subject").notNull(),
    email: text("email").notNull().default(""),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at", timestampConfig).notNull(),
    updatedAt: timestamp("updated_at", timestampConfig).notNull(),
  },
  (table) => [
    uniqueIndex("app_users_auth_identity_idx").on(
      table.authProvider,
      table.authSubject,
    ),
  ],
);

export const localAuthCredentials = pgTable(
  "local_auth_credentials",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    emailNormalized: text("email_normalized").notNull(),
    passwordHash: text("password_hash").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", timestampConfig).notNull(),
    updatedAt: timestamp("updated_at", timestampConfig).notNull(),
    lastUsedAt: timestamp("last_used_at", timestampConfig),
  },
  (table) => [
    uniqueIndex("local_auth_credentials_email_idx").on(table.emailNormalized),
    index("local_auth_credentials_user_idx").on(table.userId),
  ],
);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    ...lifecycleColumns,
  },
  (table) => [
    uniqueIndex("organizations_slug_active_idx")
      .on(table.slug)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", timestampConfig).notNull(),
    updatedAt: timestamp("updated_at", timestampConfig).notNull(),
  },
  (table) => [
    uniqueIndex("organization_memberships_org_user_idx").on(
      table.organizationId,
      table.userId,
    ),
    index("organization_memberships_user_idx").on(table.userId),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    ...lifecycleColumns,
  },
  (table) => [
    uniqueIndex("projects_org_slug_active_idx")
      .on(table.organizationId, table.slug)
      .where(sql`${table.deletedAt} is null`),
    index("projects_org_idx").on(table.organizationId),
  ],
);

export const environments = pgTable(
  "environments",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    ...lifecycleColumns,
  },
  (table) => [
    uniqueIndex("environments_project_key_active_idx")
      .on(table.projectId, table.key)
      .where(sql`${table.deletedAt} is null`),
    index("environments_project_idx").on(table.projectId),
  ],
);

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => appUsers.id, { onDelete: "cascade" }),
  timezone: text("timezone").notNull(),
  compactMode: boolean("compact_mode").notNull(),
  createdAt: timestamp("created_at", timestampConfig).notNull(),
  updatedAt: timestamp("updated_at", timestampConfig).notNull(),
});

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    environmentId: uuid("environment_id").references(() => environments.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    tokenHash: text("token_hash").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    status: text("status").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", timestampConfig).notNull(),
    updatedAt: timestamp("updated_at", timestampConfig).notNull(),
    lastUsedAt: timestamp("last_used_at", timestampConfig),
    expiresAt: timestamp("expires_at", timestampConfig),
    revokedAt: timestamp("revoked_at", timestampConfig),
  },
  (table) => [
    index("api_keys_org_created_idx").on(table.organizationId, table.createdAt),
    index("api_keys_prefix_idx").on(table.prefix),
  ],
);

export const providerConnections = pgTable(
  "provider_connections",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    environmentId: uuid("environment_id").references(() => environments.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    configJson: jsonb("config_json").$type<JsonObject>().notNull(),
    secretRef: text("secret_ref"),
    ...lifecycleColumns,
  },
  (table) => [index("provider_connections_org_idx").on(table.organizationId)],
);

export const pipelines = pgTable(
  "pipelines",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    ...lifecycleColumns,
  },
  (table) => [
    uniqueIndex("pipelines_project_slug_active_idx")
      .on(table.projectId, table.slug)
      .where(sql`${table.deletedAt} is null`),
    index("pipelines_org_project_idx").on(table.organizationId, table.projectId),
  ],
);

export const pipelineVersions = pgTable(
  "pipeline_versions",
  {
    id: uuid("id").primaryKey(),
    pipelineId: uuid("pipeline_id")
      .notNull()
      .references(() => pipelines.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    status: text("status").notNull(),
    manifestJson: jsonb("manifest_json")
      .$type<{ stages: PipelineStage[] }>()
      .notNull(),
    latencyBudgetMs: integer("latency_budget_ms"),
    createdByUserId: uuid("created_by_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", timestampConfig).notNull(),
    publishedAt: timestamp("published_at", timestampConfig),
  },
  (table) => [
    uniqueIndex("pipeline_versions_pipeline_version_idx").on(
      table.pipelineId,
      table.versionNumber,
    ),
    index("pipeline_versions_pipeline_created_idx").on(
      table.pipelineId,
      table.createdAt,
    ),
  ],
);

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    pipelineId: uuid("pipeline_id").references(() => pipelines.id, {
      onDelete: "set null",
    }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull(),
    ...lifecycleColumns,
  },
  (table) => [
    uniqueIndex("agents_project_slug_active_idx")
      .on(table.projectId, table.slug)
      .where(sql`${table.deletedAt} is null`),
    index("agents_org_project_updated_idx").on(
      table.organizationId,
      table.projectId,
      table.updatedAt,
    ),
  ],
);

export const agentVersions = pgTable(
  "agent_versions",
  {
    id: uuid("id").primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    pipelineVersionId: uuid("pipeline_version_id").references(
      () => pipelineVersions.id,
      { onDelete: "set null" },
    ),
    versionNumber: integer("version_number").notNull(),
    status: text("status").notNull(),
    manifestJson: jsonb("manifest_json").$type<JsonObject>().notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", timestampConfig).notNull(),
    publishedAt: timestamp("published_at", timestampConfig),
  },
  (table) => [
    uniqueIndex("agent_versions_agent_version_idx").on(
      table.agentId,
      table.versionNumber,
    ),
    index("agent_versions_agent_created_idx").on(table.agentId, table.createdAt),
  ],
);

export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    sourceType: text("source_type").notNull(),
    sourceUri: text("source_uri"),
    syncStatus: text("sync_status").notNull(),
    lastSyncedAt: timestamp("last_synced_at", timestampConfig),
    configJson: jsonb("config_json").$type<JsonObject>().notNull(),
    ...lifecycleColumns,
  },
  (table) => [index("knowledge_sources_project_idx").on(table.projectId)],
);

export const tools = pgTable(
  "tools",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    configSchemaJson: jsonb("config_schema_json").$type<JsonObject>().notNull(),
    runtimeConfigJson: jsonb("runtime_config_json").$type<JsonObject>().notNull(),
    ...lifecycleColumns,
  },
  (table) => [
    uniqueIndex("tools_project_slug_active_idx")
      .on(table.projectId, table.slug)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    serialNumber: text("serial_number").notNull(),
    hardwareId: text("hardware_id"),
    model: text("model").notNull(),
    displayName: text("display_name").notNull(),
    deviceEndpoint: text("device_endpoint").notNull(),
    status: text("status").notNull(),
    ...lifecycleColumns,
  },
  (table) => [
    uniqueIndex("devices_org_serial_active_idx")
      .on(table.organizationId, table.serialNumber)
      .where(sql`${table.deletedAt} is null`),
    index("devices_org_updated_idx").on(table.organizationId, table.updatedAt),
  ],
);

export const deviceCredentials = pgTable(
  "device_credentials",
  {
    id: uuid("id").primaryKey(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    credentialType: text("credential_type").notNull(),
    publicKeyFingerprint: text("public_key_fingerprint"),
    secretHash: text("secret_hash"),
    issuedAt: timestamp("issued_at", timestampConfig).notNull(),
    expiresAt: timestamp("expires_at", timestampConfig),
    revokedAt: timestamp("revoked_at", timestampConfig),
    lastUsedAt: timestamp("last_used_at", timestampConfig),
  },
  (table) => [index("device_credentials_device_idx").on(table.deviceId)],
);

export const deviceState = pgTable("device_state", {
  deviceId: uuid("device_id")
    .primaryKey()
    .references(() => devices.id, { onDelete: "cascade" }),
  availability: text("availability").notNull(),
  lastSeenAt: timestamp("last_seen_at", timestampConfig),
  ipAddress: text("ip_address").notNull().default(""),
  firmwareVersion: text("firmware_version"),
  runtimeVersion: text("runtime_version"),
  reportedStateJson: jsonb("reported_state_json").$type<JsonObject>().notNull(),
  desiredStateJson: jsonb("desired_state_json").$type<JsonObject>().notNull(),
  updateMode: text("update_mode").notNull(),
  updatedAt: timestamp("updated_at", timestampConfig).notNull(),
});

export const deviceAssignments = pgTable(
  "device_assignments",
  {
    id: uuid("id").primaryKey(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", timestampConfig).notNull(),
    removedAt: timestamp("removed_at", timestampConfig),
  },
  (table) => [
    index("device_assignments_device_idx").on(table.deviceId),
    index("device_assignments_environment_idx").on(table.environmentId),
  ],
);

export const runtimeInstances = pgTable(
  "runtime_instances",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    version: text("version"),
    status: text("status").notNull(),
    lastSeenAt: timestamp("last_seen_at", timestampConfig),
    metadataJson: jsonb("metadata_json").$type<JsonObject>().notNull(),
    ...lifecycleColumns,
  },
  (table) => [index("runtime_instances_environment_idx").on(table.environmentId)],
);

export const deployments = pgTable(
  "deployments",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    agentVersionId: uuid("agent_version_id")
      .notNull()
      .references(() => agentVersions.id, { onDelete: "restrict" }),
    pipelineVersionId: uuid("pipeline_version_id")
      .notNull()
      .references(() => pipelineVersions.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    status: text("status").notNull(),
    rolloutStrategyJson: jsonb("rollout_strategy_json")
      .$type<JsonObject>()
      .notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", timestampConfig).notNull(),
    activatedAt: timestamp("activated_at", timestampConfig),
    supersededAt: timestamp("superseded_at", timestampConfig),
  },
  (table) => [
    index("deployments_environment_status_idx").on(
      table.environmentId,
      table.status,
    ),
  ],
);

export const deploymentDeviceTargets = pgTable(
  "deployment_device_targets",
  {
    id: uuid("id").primaryKey(),
    deploymentId: uuid("deployment_id")
      .notNull()
      .references(() => deployments.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    desiredConfigVersion: text("desired_config_version"),
    appliedConfigVersion: text("applied_config_version"),
    appliedAt: timestamp("applied_at", timestampConfig),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", timestampConfig).notNull(),
    updatedAt: timestamp("updated_at", timestampConfig).notNull(),
  },
  (table) => [
    index("deployment_device_targets_device_status_idx").on(
      table.deviceId,
      table.status,
    ),
    index("deployment_device_targets_deployment_idx").on(table.deploymentId),
  ],
);

export const sessionArtifacts = pgTable(
  "session_artifacts",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    artifactType: text("artifact_type").notNull(),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type"),
    byteSize: integer("byte_size"),
    sha256: text("sha256"),
    createdAt: timestamp("created_at", timestampConfig).notNull(),
    expiresAt: timestamp("expires_at", timestampConfig),
  },
  (table) => [index("session_artifacts_org_created_idx").on(table.organizationId, table.createdAt)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id").references(() => devices.id, {
      onDelete: "set null",
    }),
    deploymentId: uuid("deployment_id").references(() => deployments.id, {
      onDelete: "set null",
    }),
    agentVersionId: uuid("agent_version_id")
      .notNull()
      .references(() => agentVersions.id, { onDelete: "restrict" }),
    pipelineVersionId: uuid("pipeline_version_id")
      .notNull()
      .references(() => pipelineVersions.id, { onDelete: "restrict" }),
    runtimeInstanceId: uuid("runtime_instance_id").references(
      () => runtimeInstances.id,
      { onDelete: "set null" },
    ),
    status: text("status").notNull(),
    startedAt: timestamp("started_at", timestampConfig).notNull(),
    endedAt: timestamp("ended_at", timestampConfig),
    summaryJson: jsonb("summary_json").$type<JsonObject>().notNull(),
    latencySummaryJson: jsonb("latency_summary_json").$type<JsonObject>().notNull(),
    metadataJson: jsonb("metadata_json").$type<JsonObject>().notNull(),
  },
  (table) => [
    index("sessions_org_started_idx").on(table.organizationId, table.startedAt),
    index("sessions_environment_status_idx").on(
      table.environmentId,
      table.status,
    ),
  ],
);

export const sessionEvents = pgTable(
  "session_events",
  {
    id: uuid("id").primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    eventType: text("event_type").notNull(),
    createdAt: timestamp("created_at", timestampConfig).notNull(),
    payloadJson: jsonb("payload_json").$type<JsonObject>().notNull(),
    artifactId: uuid("artifact_id").references(() => sessionArtifacts.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    uniqueIndex("session_events_session_sequence_idx").on(
      table.sessionId,
      table.sequence,
    ),
    index("session_events_session_created_idx").on(
      table.sessionId,
      table.createdAt,
    ),
  ],
);

export const deviceEvents = pgTable(
  "device_events",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    observedAt: timestamp("observed_at", timestampConfig).notNull(),
    payloadJson: jsonb("payload_json").$type<JsonObject>().notNull(),
    artifactId: uuid("artifact_id").references(() => sessionArtifacts.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("device_events_device_observed_idx").on(
      table.deviceId,
      table.observedAt,
    ),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    actorApiKeyId: uuid("actor_api_key_id").references(() => apiKeys.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    diffJson: jsonb("diff_json").$type<JsonObject>().notNull(),
    createdAt: timestamp("created_at", timestampConfig).notNull(),
  },
  (table) => [index("audit_logs_org_created_idx").on(table.organizationId, table.createdAt)],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadJson: jsonb("payload_json").$type<JsonObject>().notNull(),
    createdAt: timestamp("created_at", timestampConfig).notNull(),
    publishedAt: timestamp("published_at", timestampConfig),
  },
  (table) => [
    index("outbox_events_unpublished_idx").on(table.publishedAt, table.createdAt),
  ],
);

export type AppUserRow = typeof appUsers.$inferSelect;
export type LocalAuthCredentialRow = typeof localAuthCredentials.$inferSelect;
export type OrganizationRow = typeof organizations.$inferSelect;
export type UserPreferenceRow = typeof userPreferences.$inferSelect;
export type AgentRow = typeof agents.$inferSelect;
export type AgentVersionRow = typeof agentVersions.$inferSelect;
export type PipelineRow = typeof pipelines.$inferSelect;
export type PipelineVersionRow = typeof pipelineVersions.$inferSelect;
export type DeviceRow = typeof devices.$inferSelect;
export type DeviceStateRow = typeof deviceState.$inferSelect;
export type DeploymentRow = typeof deployments.$inferSelect;
export type DeploymentDeviceTargetRow = typeof deploymentDeviceTargets.$inferSelect;
export type ApiKeyRow = typeof apiKeys.$inferSelect;
