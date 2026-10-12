-- Warehouses (Phase 2): stock documents and stock movements record the warehouse they posted to. Existing documents and
-- movements are assigned their inventory's current default warehouse, which is where all stock was counted until now.
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "warehouse_id" integer REFERENCES "warehouses"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN IF NOT EXISTS "warehouse_id" integer REFERENCES "warehouses"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inventory_movements_warehouse" ON "inventory_movements" ("warehouse_id");
--> statement-breakpoint
UPDATE "transactions" t SET "warehouse_id" = w."id" FROM "warehouses" w
WHERE t."warehouse_id" IS NULL AND t."location_id" = w."location_id" AND w."is_default"
  AND t."type" IN ('bill', 'item receipt', 'invoice', 'sales receipt', 'vendor credit');
--> statement-breakpoint
UPDATE "inventory_movements" m SET "warehouse_id" = w."id" FROM "items" i, "warehouses" w
WHERE m."warehouse_id" IS NULL AND m."item_id" = i."id" AND w."location_id" = i."location_id" AND w."is_default";
