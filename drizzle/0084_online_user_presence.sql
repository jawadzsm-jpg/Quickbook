ALTER TABLE "auth_sessions" ADD COLUMN IF NOT EXISTS "ip_address" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_auth_sessions_last_seen" ON "auth_sessions" USING btree ("last_seen_at");
