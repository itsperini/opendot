CREATE TABLE "device_activation_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"device_identifier" text NOT NULL,
	"client_id" text DEFAULT '' NOT NULL,
	"serial_number" text,
	"user_agent" text DEFAULT '' NOT NULL,
	"ip_address" text DEFAULT '' NOT NULL,
	"code_hash" text NOT NULL,
	"challenge" text NOT NULL,
	"token_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" text NOT NULL,
	"claimed_by_user_id" uuid,
	"device_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "device_credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"device_id" uuid NOT NULL,
	"prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "runtime_session_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "device_activation_requests" ADD CONSTRAINT "device_activation_requests_claimed_by_user_id_app_users_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_activation_requests" ADD CONSTRAINT "device_activation_requests_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_credentials" ADD CONSTRAINT "device_credentials_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_session_tokens" ADD CONSTRAINT "runtime_session_tokens_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_session_tokens" ADD CONSTRAINT "runtime_session_tokens_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_activation_requests_code_idx" ON "device_activation_requests" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "device_activation_requests_challenge_idx" ON "device_activation_requests" USING btree ("challenge");--> statement-breakpoint
CREATE INDEX "device_activation_requests_device_idx" ON "device_activation_requests" USING btree ("device_identifier","status");--> statement-breakpoint
CREATE INDEX "device_activation_requests_expires_idx" ON "device_activation_requests" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "device_credentials_token_hash_idx" ON "device_credentials" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "device_credentials_device_status_idx" ON "device_credentials" USING btree ("device_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_session_tokens_token_hash_idx" ON "runtime_session_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "runtime_session_tokens_user_created_idx" ON "runtime_session_tokens" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "runtime_session_tokens_expires_idx" ON "runtime_session_tokens" USING btree ("expires_at");