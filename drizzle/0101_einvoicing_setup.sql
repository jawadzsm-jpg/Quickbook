-- UAE e-invoicing setup per company (Peppol / PINT-AE through an Accredited Service Provider). Readiness only; no XML yet.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "einvoice_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "peppol_participant_id" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "einvoice_asp" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "einvoice_asp_account" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "einvoice_go_live" text DEFAULT '' NOT NULL;
