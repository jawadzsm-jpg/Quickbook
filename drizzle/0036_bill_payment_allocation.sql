ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "bill_id" integer REFERENCES "transactions"("id") ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transactions_bill_id" ON "transactions"("bill_id");
