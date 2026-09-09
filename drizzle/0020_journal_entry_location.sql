ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "location_id" integer;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_location_id_inventory_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "journal_entries" AS journal
SET "location_id" = source_transaction."location_id"
FROM "transactions" AS source_transaction
WHERE journal."transaction_id" = source_transaction."id" AND journal."location_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_journal_entries_location_date" ON "journal_entries" USING btree ("location_id", "entry_date");
