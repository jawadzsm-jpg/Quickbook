-- Deleting an invoice voids it: the document, lines and stock history stay; who voided it, when and why are kept here.
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "voided_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "voided_by_user_id" integer REFERENCES "app_users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "voided_by_name" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "void_reason" text DEFAULT '' NOT NULL;
