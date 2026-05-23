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

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => appUsers.id, { onDelete: "cascade" }),
  workspaceName: text("workspace_name").notNull().default("OpenDot Lab"),
  timezone: text("timezone").notNull(),
  compactMode: boolean("compact_mode").notNull(),
  createdAt: timestamp("created_at", timestampConfig).notNull(),
  updatedAt: timestamp("updated_at", timestampConfig).notNull(),
});

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    tokenHash: text("token_hash").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", timestampConfig).notNull(),
    updatedAt: timestamp("updated_at", timestampConfig).notNull(),
    lastUsedAt: timestamp("last_used_at", timestampConfig),
    expiresAt: timestamp("expires_at", timestampConfig),
    revokedAt: timestamp("revoked_at", timestampConfig),
  },
  (table) => [
    index("api_keys_user_created_idx").on(table.userId, table.createdAt),
    index("api_keys_prefix_idx").on(table.prefix),
  ],
);

export const pipelines = pgTable(
  "pipelines",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    ...lifecycleColumns,
  },
  (table) => [
    uniqueIndex("pipelines_user_slug_active_idx")
      .on(table.userId, table.slug)
      .where(sql`${table.deletedAt} is null`),
    index("pipelines_user_updated_idx").on(table.userId, table.updatedAt),
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
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
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
    uniqueIndex("agents_user_slug_active_idx")
      .on(table.userId, table.slug)
      .where(sql`${table.deletedAt} is null`),
    index("agents_user_updated_idx").on(table.userId, table.updatedAt),
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

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    serialNumber: text("serial_number").notNull(),
    hardwareId: text("hardware_id"),
    model: text("model").notNull(),
    displayName: text("display_name").notNull(),
    deviceEndpoint: text("device_endpoint").notNull(),
    status: text("status").notNull(),
    ...lifecycleColumns,
  },
  (table) => [
    uniqueIndex("devices_user_serial_active_idx")
      .on(table.userId, table.serialNumber)
      .where(sql`${table.deletedAt} is null`),
    index("devices_user_updated_idx").on(table.userId, table.updatedAt),
  ],
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

export const deployments = pgTable(
  "deployments",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
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
    createdAt: timestamp("created_at", timestampConfig).notNull(),
    activatedAt: timestamp("activated_at", timestampConfig),
    supersededAt: timestamp("superseded_at", timestampConfig),
  },
  (table) => [
    index("deployments_user_status_idx").on(table.userId, table.status),
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
    uniqueIndex("deployment_device_targets_active_device_idx")
      .on(table.deviceId)
      .where(sql`${table.status} = 'active'`),
    index("deployment_device_targets_device_status_idx").on(
      table.deviceId,
      table.status,
    ),
    index("deployment_device_targets_deployment_idx").on(table.deploymentId),
  ],
);

export type AppUserRow = typeof appUsers.$inferSelect;
export type LocalAuthCredentialRow = typeof localAuthCredentials.$inferSelect;
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
