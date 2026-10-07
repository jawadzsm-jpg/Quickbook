-- Supplier (vendor) bank details, shown in Vendor Center and used when paying the supplier.
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "bank_name" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "bank_account_name" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "bank_account_number" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "bank_iban" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "bank_swift" text DEFAULT '' NOT NULL;
