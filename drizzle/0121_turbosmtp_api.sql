-- Email server: send through an SMTP server (default) or the turboSMTP HTTPS API. For the API, username holds the
-- consumer key and password_encrypted the encrypted consumer secret; api_region picks the global or EU sending host.
ALTER TABLE "email_settings" ADD COLUMN IF NOT EXISTS "provider" text NOT NULL DEFAULT 'smtp';
--> statement-breakpoint
ALTER TABLE "email_settings" ADD COLUMN IF NOT EXISTS "api_region" text NOT NULL DEFAULT 'global';
