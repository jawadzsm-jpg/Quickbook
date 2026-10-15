-- Company Setup → Fonts & text: the app font (empty = the built-in default) and text sizes per area of the app, in percent
-- of the default size (100). Applied for everyone signed in to the company; printed documents keep their Layout Builder fonts.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "app_font" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "app_text_base" integer NOT NULL DEFAULT 100;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "app_text_sidebar" integer NOT NULL DEFAULT 100;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "app_text_tables" integer NOT NULL DEFAULT 100;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "app_text_forms" integer NOT NULL DEFAULT 100;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "app_text_headings" integer NOT NULL DEFAULT 100;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "app_text_print" integer NOT NULL DEFAULT 100;
