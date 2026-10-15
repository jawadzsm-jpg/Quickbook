-- Supplier QuickReport and Supplier Open Balance need the supplier they were run for, so a memorised copy keeps it and
-- reopens for the same supplier (app/api/memorised-reports). Removing the supplier clears it; the report then asks again.
ALTER TABLE "memorised_reports" ADD COLUMN IF NOT EXISTS "supplier_id" integer REFERENCES "contacts"("id") ON DELETE SET NULL;
