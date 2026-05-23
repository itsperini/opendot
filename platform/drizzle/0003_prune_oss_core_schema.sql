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
	'',
	'Marco',
	null,
	now(),
	now()
WHERE NOT EXISTS (SELECT 1 FROM "app_users");--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "workspace_name" text DEFAULT 'OpenDot Lab' NOT NULL;--> statement-breakpoint
UPDATE "user_preferences" preferences
SET "workspace_name" = coalesce(workspace."name", preferences."workspace_name", 'OpenDot Lab')
FROM (
	SELECT DISTINCT ON (membership."user_id")
		membership."user_id",
		organization."name"
	FROM "organization_memberships" membership
	JOIN "organizations" organization ON organization."id" = membership."organization_id"
	WHERE membership."status" = 'active'
	ORDER BY
		membership."user_id",
		CASE WHEN membership."role" = 'owner' THEN 0 ELSE 1 END,
		membership."created_at" ASC
) workspace
WHERE preferences."user_id" = workspace."user_id";--> statement-breakpoint
CREATE TEMP TABLE "migration_fallback_user" AS
SELECT "id" AS "user_id" FROM "app_users" ORDER BY "created_at" ASC LIMIT 1;--> statement-breakpoint
CREATE TEMP TABLE "migration_org_owner" AS
SELECT DISTINCT ON ("organization_id")
	"organization_id",
	"user_id"
FROM "organization_memberships"
WHERE "status" = 'active'
ORDER BY
	"organization_id",
	CASE WHEN "role" = 'owner' THEN 0 ELSE 1 END,
	"created_at" ASC;--> statement-breakpoint
ALTER TABLE "pipelines" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "user_id" uuid;--> statement-breakpoint
UPDATE "pipelines" pipeline
SET "user_id" = coalesce(
	(
		SELECT owner."user_id"
		FROM "projects" project
		JOIN "migration_org_owner" owner ON owner."organization_id" = project."organization_id"
		WHERE project."id" = pipeline."project_id"
		LIMIT 1
	),
	(SELECT "user_id" FROM "migration_fallback_user" LIMIT 1)
);--> statement-breakpoint
UPDATE "agents" agent
SET "user_id" = coalesce(
	(
		SELECT owner."user_id"
		FROM "projects" project
		JOIN "migration_org_owner" owner ON owner."organization_id" = project."organization_id"
		WHERE project."id" = agent."project_id"
		LIMIT 1
	),
	(SELECT pipeline."user_id" FROM "pipelines" pipeline WHERE pipeline."id" = agent."pipeline_id" LIMIT 1),
	(SELECT "user_id" FROM "migration_fallback_user" LIMIT 1)
);--> statement-breakpoint
UPDATE "devices" device
SET "user_id" = coalesce(
	(
		SELECT owner."user_id"
		FROM "migration_org_owner" owner
		WHERE owner."organization_id" = device."organization_id"
		LIMIT 1
	),
	(SELECT "user_id" FROM "migration_fallback_user" LIMIT 1)
);--> statement-breakpoint
UPDATE "api_keys" api_key
SET "user_id" = coalesce(
	api_key."created_by_user_id",
	(
		SELECT owner."user_id"
		FROM "migration_org_owner" owner
		WHERE owner."organization_id" = api_key."organization_id"
		LIMIT 1
	),
	(SELECT "user_id" FROM "migration_fallback_user" LIMIT 1)
);--> statement-breakpoint
UPDATE "deployments" deployment
SET "user_id" = coalesce(
	deployment."created_by_user_id",
	(
		SELECT owner."user_id"
		FROM "migration_org_owner" owner
		WHERE owner."organization_id" = deployment."organization_id"
		LIMIT 1
	),
	(
		SELECT agent."user_id"
		FROM "agent_versions" agent_version
		JOIN "agents" agent ON agent."id" = agent_version."agent_id"
		WHERE agent_version."id" = deployment."agent_version_id"
		LIMIT 1
	),
	(SELECT "user_id" FROM "migration_fallback_user" LIMIT 1)
);--> statement-breakpoint
UPDATE "pipelines" SET "user_id" = (SELECT "user_id" FROM "migration_fallback_user" LIMIT 1) WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "agents" SET "user_id" = (SELECT "user_id" FROM "migration_fallback_user" LIMIT 1) WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "devices" SET "user_id" = (SELECT "user_id" FROM "migration_fallback_user" LIMIT 1) WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "api_keys" SET "user_id" = (SELECT "user_id" FROM "migration_fallback_user" LIMIT 1) WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "deployments" SET "user_id" = (SELECT "user_id" FROM "migration_fallback_user" LIMIT 1) WHERE "user_id" IS NULL;--> statement-breakpoint
WITH ranked_targets AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "device_id"
			ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
		) AS rank
	FROM "deployment_device_targets"
	WHERE "status" = 'active'
)
UPDATE "deployment_device_targets" target
SET "status" = 'superseded', "updated_at" = now()
FROM ranked_targets ranked
WHERE target."id" = ranked."id" AND ranked.rank > 1;--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "deployments" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pipelines" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
DROP TABLE IF EXISTS "session_events" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "device_events" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "sessions" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "session_artifacts" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "runtime_instances" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "device_assignments" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "device_credentials" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "knowledge_sources" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "tools" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "provider_connections" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "audit_logs" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "outbox_events" CASCADE;--> statement-breakpoint
ALTER TABLE "agents" DROP CONSTRAINT IF EXISTS "agents_organization_id_organizations_id_fk";--> statement-breakpoint
ALTER TABLE "agents" DROP CONSTRAINT IF EXISTS "agents_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_organization_id_organizations_id_fk";--> statement-breakpoint
ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_environment_id_environments_id_fk";--> statement-breakpoint
ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_created_by_user_id_app_users_id_fk";--> statement-breakpoint
ALTER TABLE "deployments" DROP CONSTRAINT IF EXISTS "deployments_organization_id_organizations_id_fk";--> statement-breakpoint
ALTER TABLE "deployments" DROP CONSTRAINT IF EXISTS "deployments_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "deployments" DROP CONSTRAINT IF EXISTS "deployments_environment_id_environments_id_fk";--> statement-breakpoint
ALTER TABLE "deployments" DROP CONSTRAINT IF EXISTS "deployments_created_by_user_id_app_users_id_fk";--> statement-breakpoint
ALTER TABLE "devices" DROP CONSTRAINT IF EXISTS "devices_organization_id_organizations_id_fk";--> statement-breakpoint
ALTER TABLE "pipelines" DROP CONSTRAINT IF EXISTS "pipelines_organization_id_organizations_id_fk";--> statement-breakpoint
ALTER TABLE "pipelines" DROP CONSTRAINT IF EXISTS "pipelines_project_id_projects_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "agents_project_slug_active_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "agents_org_project_updated_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "api_keys_org_created_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "deployments_environment_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "devices_org_serial_active_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "devices_org_updated_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "pipelines_project_slug_active_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "pipelines_org_project_idx";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "project_id";--> statement-breakpoint
ALTER TABLE "api_keys" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "api_keys" DROP COLUMN "project_id";--> statement-breakpoint
ALTER TABLE "api_keys" DROP COLUMN "environment_id";--> statement-breakpoint
ALTER TABLE "api_keys" DROP COLUMN "scopes";--> statement-breakpoint
ALTER TABLE "api_keys" DROP COLUMN "created_by_user_id";--> statement-breakpoint
ALTER TABLE "deployments" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "deployments" DROP COLUMN "project_id";--> statement-breakpoint
ALTER TABLE "deployments" DROP COLUMN "environment_id";--> statement-breakpoint
ALTER TABLE "deployments" DROP COLUMN "created_by_user_id";--> statement-breakpoint
ALTER TABLE "devices" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "pipelines" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "pipelines" DROP COLUMN "project_id";--> statement-breakpoint
DROP TABLE IF EXISTS "environments" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "projects" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "organization_memberships" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "organizations" CASCADE;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agents_user_slug_active_idx" ON "agents" USING btree ("user_id","slug") WHERE "agents"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "agents_user_updated_idx" ON "agents" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "api_keys_user_created_idx" ON "api_keys" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deployment_device_targets_active_device_idx" ON "deployment_device_targets" USING btree ("device_id") WHERE "deployment_device_targets"."status" = 'active';--> statement-breakpoint
CREATE INDEX "deployments_user_status_idx" ON "deployments" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_user_serial_active_idx" ON "devices" USING btree ("user_id","serial_number") WHERE "devices"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "devices_user_updated_idx" ON "devices" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pipelines_user_slug_active_idx" ON "pipelines" USING btree ("user_id","slug") WHERE "pipelines"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "pipelines_user_updated_idx" ON "pipelines" USING btree ("user_id","updated_at");
