import { boolean, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import type { PipelineStage } from "../../types.js";

export const voiceAgents = pgTable("voice_agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("draft"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  pipeline: jsonb("pipeline").$type<PipelineStage[]>().notNull(),
});

export const dotDevices = pgTable("dot_devices", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  model: text("model").notNull(),
  serialNumber: text("serial_number").notNull(),
  availability: text("availability").notNull(),
  ipAddress: text("ip_address").notNull(),
  deviceEndpoint: text("device_endpoint").notNull(),
  lastSeenAt: text("last_seen_at"),
  boundAgentId: text("bound_agent_id"),
  boundAgentName: text("bound_agent_name"),
  boundConfigVersion: text("bound_config_version"),
  boundAt: text("bound_at"),
  updateMode: text("update_mode").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const userSettings = pgTable("user_settings", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull(),
  workspaceName: text("workspace_name").notNull(),
  timezone: text("timezone").notNull(),
  compactMode: boolean("compact_mode").notNull(),
});

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull(),
  prefix: text("prefix").notNull(),
  createdAt: text("created_at").notNull(),
  lastUsedAt: text("last_used_at"),
  status: text("status").notNull(),
});

export type VoiceAgentRow = typeof voiceAgents.$inferSelect;
export type DotDeviceRow = typeof dotDevices.$inferSelect;
export type UserSettingsRow = typeof userSettings.$inferSelect;
export type ApiKeyRow = typeof apiKeys.$inferSelect;
