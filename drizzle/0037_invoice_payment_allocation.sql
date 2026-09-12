ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "invoice_id" integer REFERENCES "transactions"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "paid_at" timestamptz;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transactions_invoice_id" ON "transactions"("invoice_id");
