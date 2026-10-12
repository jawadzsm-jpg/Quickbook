-- Warehouses: an inventory check report can count one warehouse of its inventory instead of comparing all companies.
-- Existing reports keep NULL (the cross-company comparison).
ALTER TABLE "inventory_check_reports" ADD COLUMN IF NOT EXISTS "warehouse_id" integer REFERENCES "warehouses"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inventory_check_reports_warehouse" ON "inventory_check_reports" ("warehouse_id");
