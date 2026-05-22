CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"created_at" text NOT NULL,
	"last_used_at" text,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dot_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"model" text NOT NULL,
	"serial_number" text NOT NULL,
	"availability" text NOT NULL,
	"ip_address" text NOT NULL,
	"device_endpoint" text NOT NULL,
	"last_seen_at" text,
	"bound_agent_id" text,
	"bound_agent_name" text,
	"bound_config_version" text,
	"bound_at" text,
	"update_mode" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"workspace_name" text NOT NULL,
	"timezone" text NOT NULL,
	"compact_mode" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_agents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"pipeline" jsonb NOT NULL
);
