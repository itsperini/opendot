CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
CREATE TEMP TABLE "legacy_api_keys" AS SELECT * FROM "api_keys";--> statement-breakpoint
ALTER TABLE "api_keys" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "api_keys" CASCADE;--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agent_id" uuid NOT NULL,
	"pipeline_version_id" uuid,
	"version_number" integer NOT NULL,
	"status" text NOT NULL,
	"manifest_json" jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"pipeline_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"auth_provider" text NOT NULL,
	"auth_subject" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid,
	"environment_id" uuid,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"status" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"actor_api_key_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"diff_json" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_device_targets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"deployment_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"status" text NOT NULL,
	"desired_config_version" text,
	"applied_config_version" text,
	"applied_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"pipeline_version_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"rollout_strategy_json" jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"activated_at" timestamp with time zone,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "device_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"device_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "device_credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"device_id" uuid NOT NULL,
	"credential_type" text NOT NULL,
	"public_key_fingerprint" text,
	"secret_hash" text,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "device_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"payload_json" jsonb NOT NULL,
	"artifact_id" uuid
);
--> statement-breakpoint
CREATE TABLE "device_state" (
	"device_id" uuid PRIMARY KEY NOT NULL,
	"availability" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"ip_address" text DEFAULT '' NOT NULL,
	"firmware_version" text,
	"runtime_version" text,
	"reported_state_json" jsonb NOT NULL,
	"desired_state_json" jsonb NOT NULL,
	"update_mode" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"serial_number" text NOT NULL,
	"hardware_id" text,
	"model" text NOT NULL,
	"display_name" text NOT NULL,
	"device_endpoint" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "environments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"agent_id" uuid,
	"name" text NOT NULL,
	"source_type" text NOT NULL,
	"source_uri" text,
	"sync_status" text NOT NULL,
	"last_synced_at" timestamp with time zone,
	"config_json" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pipeline_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"status" text NOT NULL,
	"manifest_json" jsonb NOT NULL,
	"latency_budget_ms" integer,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pipelines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "provider_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid,
	"environment_id" uuid,
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"config_json" jsonb NOT NULL,
	"secret_ref" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "runtime_instances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"version" text,
	"status" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"metadata_json" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "session_artifacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"artifact_type" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text,
	"byte_size" integer,
	"sha256" text,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "session_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"event_type" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"payload_json" jsonb NOT NULL,
	"artifact_id" uuid
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"device_id" uuid,
	"deployment_id" uuid,
	"agent_version_id" uuid NOT NULL,
	"pipeline_version_id" uuid NOT NULL,
	"runtime_instance_id" uuid,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"summary_json" jsonb NOT NULL,
	"latency_summary_json" jsonb NOT NULL,
	"metadata_json" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tools" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"config_schema_json" jsonb NOT NULL,
	"runtime_config_json" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"timezone" text NOT NULL,
	"compact_mode" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
INSERT INTO "app_users" (
	"id",
	"auth_provider",
	"auth_subject",
	"email",
	"display_name",
	"avatar_url",
	"created_at",
	"updated_at"
)
SELECT
	'00000000-0000-4000-8000-000000000001'::uuid,
	'dev',
	'00000000-0000-4000-8000-000000000001',
	coalesce((SELECT "email" FROM "user_settings" WHERE "id" = 'default' LIMIT 1), ''),
	coalesce((SELECT "display_name" FROM "user_settings" WHERE "id" = 'default' LIMIT 1), 'Marco'),
	null,
	now(),
	now()
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "organizations" (
	"id",
	"slug",
	"name",
	"created_at",
	"updated_at",
	"deleted_at"
)
VALUES (
	'00000000-0000-4000-8000-000000000101'::uuid,
	'opendot-lab',
	coalesce((SELECT "workspace_name" FROM "user_settings" WHERE "id" = 'default' LIMIT 1), 'OpenDot Lab'),
	now(),
	now(),
	null
)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "organization_memberships" (
	"id",
	"organization_id",
	"user_id",
	"role",
	"status",
	"created_at",
	"updated_at"
)
VALUES (
	gen_random_uuid(),
	'00000000-0000-4000-8000-000000000101'::uuid,
	'00000000-0000-4000-8000-000000000001'::uuid,
	'owner',
	'active',
	now(),
	now()
)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "projects" (
	"id",
	"organization_id",
	"slug",
	"name",
	"created_at",
	"updated_at",
	"deleted_at"
)
VALUES (
	'00000000-0000-4000-8000-000000000201'::uuid,
	'00000000-0000-4000-8000-000000000101'::uuid,
	'default',
	'Default project',
	now(),
	now(),
	null
)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "environments" (
	"id",
	"project_id",
	"key",
	"name",
	"kind",
	"created_at",
	"updated_at",
	"deleted_at"
)
VALUES (
	'00000000-0000-4000-8000-000000000301'::uuid,
	'00000000-0000-4000-8000-000000000201'::uuid,
	'local',
	'Local',
	'local',
	now(),
	now(),
	null
)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "user_preferences" (
	"user_id",
	"timezone",
	"compact_mode",
	"created_at",
	"updated_at"
)
SELECT
	'00000000-0000-4000-8000-000000000001'::uuid,
	coalesce((SELECT "timezone" FROM "user_settings" WHERE "id" = 'default' LIMIT 1), 'Europe/Zurich'),
	coalesce((SELECT "compact_mode" FROM "user_settings" WHERE "id" = 'default' LIMIT 1), false),
	now(),
	now()
ON CONFLICT ("user_id") DO NOTHING;
--> statement-breakpoint
CREATE TEMP TABLE "legacy_agent_map" AS
SELECT
	"id" AS "legacy_agent_id",
	gen_random_uuid() AS "agent_id",
	gen_random_uuid() AS "agent_version_id",
	gen_random_uuid() AS "pipeline_id",
	gen_random_uuid() AS "pipeline_version_id"
FROM "voice_agents";
--> statement-breakpoint
INSERT INTO "pipelines" (
	"id",
	"organization_id",
	"project_id",
	"slug",
	"name",
	"description",
	"created_at",
	"updated_at",
	"deleted_at"
)
SELECT
	map."pipeline_id",
	'00000000-0000-4000-8000-000000000101'::uuid,
	'00000000-0000-4000-8000-000000000201'::uuid,
	concat(
		coalesce(nullif(regexp_replace(lower(agent."name"), '[^a-z0-9]+', '-', 'g'), ''), 'agent'),
		'-',
		substring(map."pipeline_id"::text from 1 for 8)
	),
	concat(agent."name", ' pipeline'),
	'',
	agent."created_at"::timestamp with time zone,
	agent."updated_at"::timestamp with time zone,
	null
FROM "voice_agents" agent
JOIN "legacy_agent_map" map ON map."legacy_agent_id" = agent."id";
--> statement-breakpoint
INSERT INTO "pipeline_versions" (
	"id",
	"pipeline_id",
	"version_number",
	"status",
	"manifest_json",
	"latency_budget_ms",
	"created_by_user_id",
	"created_at",
	"published_at"
)
SELECT
	map."pipeline_version_id",
	map."pipeline_id",
	1,
	coalesce(nullif(agent."status", ''), 'draft'),
	jsonb_build_object('stages', coalesce(agent."pipeline", '[]'::jsonb)),
	null,
	'00000000-0000-4000-8000-000000000001'::uuid,
	agent."updated_at"::timestamp with time zone,
	null
FROM "voice_agents" agent
JOIN "legacy_agent_map" map ON map."legacy_agent_id" = agent."id";
--> statement-breakpoint
INSERT INTO "agents" (
	"id",
	"organization_id",
	"project_id",
	"pipeline_id",
	"slug",
	"name",
	"description",
	"status",
	"created_at",
	"updated_at",
	"deleted_at"
)
SELECT
	map."agent_id",
	'00000000-0000-4000-8000-000000000101'::uuid,
	'00000000-0000-4000-8000-000000000201'::uuid,
	map."pipeline_id",
	concat(
		coalesce(nullif(regexp_replace(lower(agent."name"), '[^a-z0-9]+', '-', 'g'), ''), 'agent'),
		'-',
		substring(map."agent_id"::text from 1 for 8)
	),
	agent."name",
	agent."description",
	coalesce(nullif(agent."status", ''), 'draft'),
	agent."created_at"::timestamp with time zone,
	agent."updated_at"::timestamp with time zone,
	null
FROM "voice_agents" agent
JOIN "legacy_agent_map" map ON map."legacy_agent_id" = agent."id";
--> statement-breakpoint
INSERT INTO "agent_versions" (
	"id",
	"agent_id",
	"pipeline_version_id",
	"version_number",
	"status",
	"manifest_json",
	"created_by_user_id",
	"created_at",
	"published_at"
)
SELECT
	map."agent_version_id",
	map."agent_id",
	map."pipeline_version_id",
	1,
	coalesce(nullif(agent."status", ''), 'draft'),
	jsonb_build_object(
		'name',
		agent."name",
		'description',
		agent."description",
		'status',
		coalesce(nullif(agent."status", ''), 'draft')
	),
	'00000000-0000-4000-8000-000000000001'::uuid,
	agent."updated_at"::timestamp with time zone,
	null
FROM "voice_agents" agent
JOIN "legacy_agent_map" map ON map."legacy_agent_id" = agent."id";
--> statement-breakpoint
CREATE TEMP TABLE "legacy_device_map" AS
SELECT
	"id" AS "legacy_device_id",
	gen_random_uuid() AS "device_id"
FROM "dot_devices";
--> statement-breakpoint
INSERT INTO "devices" (
	"id",
	"organization_id",
	"serial_number",
	"hardware_id",
	"model",
	"display_name",
	"device_endpoint",
	"status",
	"created_at",
	"updated_at",
	"deleted_at"
)
SELECT
	map."device_id",
	'00000000-0000-4000-8000-000000000101'::uuid,
	device."serial_number",
	null,
	device."model",
	device."name",
	device."device_endpoint",
	'paired',
	device."updated_at"::timestamp with time zone,
	device."updated_at"::timestamp with time zone,
	null
FROM "dot_devices" device
JOIN "legacy_device_map" map ON map."legacy_device_id" = device."id";
--> statement-breakpoint
INSERT INTO "device_state" (
	"device_id",
	"availability",
	"last_seen_at",
	"ip_address",
	"firmware_version",
	"runtime_version",
	"reported_state_json",
	"desired_state_json",
	"update_mode",
	"updated_at"
)
SELECT
	map."device_id",
	device."availability",
	nullif(device."last_seen_at", '')::timestamp with time zone,
	device."ip_address",
	null,
	null,
	'{}'::jsonb,
	'{}'::jsonb,
	device."update_mode",
	device."updated_at"::timestamp with time zone
FROM "dot_devices" device
JOIN "legacy_device_map" map ON map."legacy_device_id" = device."id";
--> statement-breakpoint
INSERT INTO "device_assignments" (
	"id",
	"device_id",
	"environment_id",
	"assigned_at",
	"removed_at"
)
SELECT
	gen_random_uuid(),
	map."device_id",
	'00000000-0000-4000-8000-000000000301'::uuid,
	device."updated_at"::timestamp with time zone,
	null
FROM "dot_devices" device
JOIN "legacy_device_map" map ON map."legacy_device_id" = device."id";
--> statement-breakpoint
CREATE TEMP TABLE "legacy_binding_map" AS
SELECT
	device_map."device_id",
	agent_map."agent_version_id",
	agent_map."pipeline_version_id",
	gen_random_uuid() AS "deployment_id",
	gen_random_uuid() AS "target_id",
	coalesce(nullif(device."bound_at", '')::timestamp with time zone, device."updated_at"::timestamp with time zone) AS "bound_at",
	device."bound_config_version",
	device."name" AS "device_name",
	agent."name" AS "agent_name"
FROM "dot_devices" device
JOIN "legacy_device_map" device_map ON device_map."legacy_device_id" = device."id"
JOIN "legacy_agent_map" agent_map ON agent_map."legacy_agent_id" = device."bound_agent_id"
JOIN "voice_agents" agent ON agent."id" = device."bound_agent_id"
WHERE device."bound_agent_id" IS NOT NULL;
--> statement-breakpoint
INSERT INTO "deployments" (
	"id",
	"organization_id",
	"project_id",
	"environment_id",
	"agent_version_id",
	"pipeline_version_id",
	"name",
	"status",
	"rollout_strategy_json",
	"created_by_user_id",
	"created_at",
	"activated_at",
	"superseded_at"
)
SELECT
	"deployment_id",
	'00000000-0000-4000-8000-000000000101'::uuid,
	'00000000-0000-4000-8000-000000000201'::uuid,
	'00000000-0000-4000-8000-000000000301'::uuid,
	"agent_version_id",
	"pipeline_version_id",
	concat("agent_name", ' -> ', "device_name"),
	'active',
	'{"kind":"legacy-device-binding"}'::jsonb,
	'00000000-0000-4000-8000-000000000001'::uuid,
	"bound_at",
	"bound_at",
	null
FROM "legacy_binding_map";
--> statement-breakpoint
INSERT INTO "deployment_device_targets" (
	"id",
	"deployment_id",
	"device_id",
	"status",
	"desired_config_version",
	"applied_config_version",
	"applied_at",
	"last_error",
	"created_at",
	"updated_at"
)
SELECT
	"target_id",
	"deployment_id",
	"device_id",
	'active',
	"bound_config_version",
	"bound_config_version",
	"bound_at",
	null,
	"bound_at",
	"bound_at"
FROM "legacy_binding_map";
--> statement-breakpoint
INSERT INTO "api_keys" (
	"id",
	"organization_id",
	"project_id",
	"environment_id",
	"name",
	"prefix",
	"token_hash",
	"scopes",
	"status",
	"created_by_user_id",
	"created_at",
	"updated_at",
	"last_used_at",
	"expires_at",
	"revoked_at"
)
SELECT
	gen_random_uuid(),
	'00000000-0000-4000-8000-000000000101'::uuid,
	'00000000-0000-4000-8000-000000000201'::uuid,
	'00000000-0000-4000-8000-000000000301'::uuid,
	"name",
	"prefix",
	"token_hash",
	'["platform:read","platform:write"]'::jsonb,
	CASE WHEN "status" = 'revoked' THEN 'revoked' ELSE 'active' END,
	'00000000-0000-4000-8000-000000000001'::uuid,
	"created_at"::timestamp with time zone,
	"created_at"::timestamp with time zone,
	nullif("last_used_at", '')::timestamp with time zone,
	null,
	CASE WHEN "status" = 'revoked' THEN coalesce(nullif("last_used_at", '')::timestamp with time zone, "created_at"::timestamp with time zone) ELSE null END
FROM "legacy_api_keys";
--> statement-breakpoint
ALTER TABLE "dot_devices" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_settings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "voice_agents" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "dot_devices" CASCADE;--> statement-breakpoint
DROP TABLE "user_settings" CASCADE;--> statement-breakpoint
DROP TABLE "voice_agents" CASCADE;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_pipeline_version_id_pipeline_versions_id_fk" FOREIGN KEY ("pipeline_version_id") REFERENCES "public"."pipeline_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_created_by_user_id_app_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_app_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_api_key_id_api_keys_id_fk" FOREIGN KEY ("actor_api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_device_targets" ADD CONSTRAINT "deployment_device_targets_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_device_targets" ADD CONSTRAINT "deployment_device_targets_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_pipeline_version_id_pipeline_versions_id_fk" FOREIGN KEY ("pipeline_version_id") REFERENCES "public"."pipeline_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_created_by_user_id_app_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_assignments" ADD CONSTRAINT "device_assignments_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_assignments" ADD CONSTRAINT "device_assignments_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_credentials" ADD CONSTRAINT "device_credentials_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_events" ADD CONSTRAINT "device_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_events" ADD CONSTRAINT "device_events_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_events" ADD CONSTRAINT "device_events_artifact_id_session_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."session_artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_state" ADD CONSTRAINT "device_state_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_versions" ADD CONSTRAINT "pipeline_versions_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_versions" ADD CONSTRAINT "pipeline_versions_created_by_user_id_app_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_instances" ADD CONSTRAINT "runtime_instances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_instances" ADD CONSTRAINT "runtime_instances_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_artifacts" ADD CONSTRAINT "session_artifacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_artifact_id_session_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."session_artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_pipeline_version_id_pipeline_versions_id_fk" FOREIGN KEY ("pipeline_version_id") REFERENCES "public"."pipeline_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_runtime_instance_id_runtime_instances_id_fk" FOREIGN KEY ("runtime_instance_id") REFERENCES "public"."runtime_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_versions_agent_version_idx" ON "agent_versions" USING btree ("agent_id","version_number");--> statement-breakpoint
CREATE INDEX "agent_versions_agent_created_idx" ON "agent_versions" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_project_slug_active_idx" ON "agents" USING btree ("project_id","slug") WHERE "agents"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "agents_org_project_updated_idx" ON "agents" USING btree ("organization_id","project_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_auth_identity_idx" ON "app_users" USING btree ("auth_provider","auth_subject");--> statement-breakpoint
CREATE INDEX "audit_logs_org_created_idx" ON "audit_logs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "deployment_device_targets_device_status_idx" ON "deployment_device_targets" USING btree ("device_id","status");--> statement-breakpoint
CREATE INDEX "deployment_device_targets_deployment_idx" ON "deployment_device_targets" USING btree ("deployment_id");--> statement-breakpoint
CREATE INDEX "deployments_environment_status_idx" ON "deployments" USING btree ("environment_id","status");--> statement-breakpoint
CREATE INDEX "device_assignments_device_idx" ON "device_assignments" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "device_assignments_environment_idx" ON "device_assignments" USING btree ("environment_id");--> statement-breakpoint
CREATE INDEX "device_credentials_device_idx" ON "device_credentials" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "device_events_device_observed_idx" ON "device_events" USING btree ("device_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_org_serial_active_idx" ON "devices" USING btree ("organization_id","serial_number") WHERE "devices"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "devices_org_updated_idx" ON "devices" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "environments_project_key_active_idx" ON "environments" USING btree ("project_id","key") WHERE "environments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "environments_project_idx" ON "environments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "knowledge_sources_project_idx" ON "knowledge_sources" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_memberships_org_user_idx" ON "organization_memberships" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "organization_memberships_user_idx" ON "organization_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_active_idx" ON "organizations" USING btree ("slug") WHERE "organizations"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "outbox_events_unpublished_idx" ON "outbox_events" USING btree ("published_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_versions_pipeline_version_idx" ON "pipeline_versions" USING btree ("pipeline_id","version_number");--> statement-breakpoint
CREATE INDEX "pipeline_versions_pipeline_created_idx" ON "pipeline_versions" USING btree ("pipeline_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pipelines_project_slug_active_idx" ON "pipelines" USING btree ("project_id","slug") WHERE "pipelines"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "pipelines_org_project_idx" ON "pipelines" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_org_slug_active_idx" ON "projects" USING btree ("organization_id","slug") WHERE "projects"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "projects_org_idx" ON "projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "provider_connections_org_idx" ON "provider_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "runtime_instances_environment_idx" ON "runtime_instances" USING btree ("environment_id");--> statement-breakpoint
CREATE INDEX "session_artifacts_org_created_idx" ON "session_artifacts" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "session_events_session_sequence_idx" ON "session_events" USING btree ("session_id","sequence");--> statement-breakpoint
CREATE INDEX "session_events_session_created_idx" ON "session_events" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "sessions_org_started_idx" ON "sessions" USING btree ("organization_id","started_at");--> statement-breakpoint
CREATE INDEX "sessions_environment_status_idx" ON "sessions" USING btree ("environment_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "tools_project_slug_active_idx" ON "tools" USING btree ("project_id","slug") WHERE "tools"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_user_id_app_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_org_created_idx" ON "api_keys" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "api_keys_prefix_idx" ON "api_keys" USING btree ("prefix");
