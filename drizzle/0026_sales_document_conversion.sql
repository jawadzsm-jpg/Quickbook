ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "source_transaction_id" integer;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "converted_invoice_id" integer;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_source_transaction_id_transactions_id_fk" FOREIGN KEY ("source_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE SET NULL;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_converted_invoice_id_transactions_id_fk" FOREIGN KEY ("converted_invoice_id") REFERENCES "public"."transactions"("id") ON DELETE SET NULL;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_transactions_source_conversion" ON "transactions" USING btree ("source_transaction_id") WHERE "source_transaction_id" IS NOT NULL;
