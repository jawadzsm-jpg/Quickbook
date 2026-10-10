-- A corporate tax working paper marked filed locks its period, like a filed VAT return.
ALTER TABLE "income_tax_working_papers" ADD COLUMN IF NOT EXISTS "filed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "income_tax_working_papers" ADD COLUMN IF NOT EXISTS "filed_by_user_id" integer REFERENCES "app_users"("id") ON DELETE SET NULL;
