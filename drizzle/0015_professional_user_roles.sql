ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "full_name" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "must_change_password" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "app_users" SET "role" = 'viewer' WHERE "role" NOT IN ('admin', 'accountant', 'sales', 'purchasing', 'inventory', 'viewer');
