-- Customer and vendor postal address (needed on UAE e-invoices for B2B buyers).
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "address_line_1" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "address_line_2" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "city" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "region" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "postal_code" text DEFAULT '' NOT NULL;
