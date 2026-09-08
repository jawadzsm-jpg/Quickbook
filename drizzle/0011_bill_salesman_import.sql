ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "salesman" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "is_import" boolean DEFAULT false NOT NULL;
