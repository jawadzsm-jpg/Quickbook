-- Sign-in page top logo per company: an uploaded replacement for the EasyBook logo (empty = EasyBook), hide it, or
-- show the company's own logos first (swapped order).
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "login_top_logo_data" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "login_top_logo_hidden" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "login_logos_swapped" boolean NOT NULL DEFAULT false;
