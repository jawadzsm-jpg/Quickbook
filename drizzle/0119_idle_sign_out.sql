-- Automatic sign-out after inactivity. Minutes per user (0 = never); administrators change it in Users & access.
-- Sessions keep the time of the last real user activity (keyboard, mouse, touch) apart from last_seen_at, which the
-- online-users heartbeat refreshes even while nobody is using the screen.
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "idle_timeout_minutes" integer NOT NULL DEFAULT 15;
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN IF NOT EXISTS "last_active_at" timestamp with time zone NOT NULL DEFAULT now();
