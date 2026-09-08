ALTER TABLE "transaction_lines" ADD COLUMN IF NOT EXISTS "vat_code" text DEFAULT 'STANDARD' NOT NULL;
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "parent_account_id" integer;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_account_id_accounts_id_fk" FOREIGN KEY ("parent_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_accounts_parent" ON "accounts" USING btree ("parent_account_id");
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "last_purchase_price" double precision DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "items" SET "last_purchase_price" = "cost" WHERE "last_purchase_price" = 0 AND "cost" > 0;
--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "salesman" text DEFAULT '' NOT NULL;
