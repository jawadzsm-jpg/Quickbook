-- Invoices marked as delivered by inventory staff; printed as a DELIVERED stamp on the invoice and delivery note.
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "delivered_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "delivered_by_user_id" integer REFERENCES "app_users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "delivered_by_name" text DEFAULT '' NOT NULL;
