-- Two-step sign-in with an authenticator app (TOTP). Keys are AES-256-GCM encrypted (lib/secret-box.ts); backup codes
-- are stored as SHA-256 digests; mfa_last_step stops a code being used twice.
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "mfa_enabled" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "mfa_secret_encrypted" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "mfa_pending_secret_encrypted" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "mfa_backup_codes" text NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "mfa_last_step" bigint NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "mfa_enabled_at" timestamp with time zone;
