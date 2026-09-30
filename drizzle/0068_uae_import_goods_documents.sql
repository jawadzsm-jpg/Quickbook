ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "bill_of_entry_number" text DEFAULT '' NOT NULL;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "airway_bill_number" text DEFAULT '' NOT NULL;

INSERT INTO "vat_codes" ("company_id", "code", "name", "rate", "description", "active", "system")
SELECT company."id", 'IMPORT_GOODS', 'Goods imported into the UAE', 5::double precision,
  'Imported goods supported by a Bill of Entry, Airway Bill and customs documents', true, true
FROM "companies" company
ON CONFLICT ("company_id", "code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "rate" = EXCLUDED."rate",
  "description" = EXCLUDED."description",
  "active" = true,
  "system" = true,
  "updated_at" = now();
