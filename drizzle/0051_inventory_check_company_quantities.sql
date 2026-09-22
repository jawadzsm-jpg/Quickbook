ALTER TABLE "inventory_check_lines" ADD COLUMN IF NOT EXISTS "company_quantities" text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE "inventory_check_lines" ADD COLUMN IF NOT EXISTS "remark" text DEFAULT '' NOT NULL;
