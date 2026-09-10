ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "stamp_data" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "bank_currency" text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE "companies" SET "bank_currency" = "base_currency" WHERE "bank_currency" = '';
