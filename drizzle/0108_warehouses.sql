-- Warehouses inside an inventory (Phase 1). Each inventory gets a default warehouse. items.quantity stays the
-- inventory total; warehouse_stock holds explicit quantities for the other (non-default) warehouses only, and the
-- default warehouse holds the remainder, so existing stock needs no copying and the totals always agree.
CREATE TABLE IF NOT EXISTS "warehouses" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "location_id" integer NOT NULL REFERENCES "inventory_locations"("id") ON DELETE cascade,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_warehouses_location_code" ON "warehouses" ("location_id", "code");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_warehouses_location_default" ON "warehouses" ("location_id") WHERE "is_default";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_warehouses_company" ON "warehouses" ("company_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "warehouse_stock" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "warehouse_id" integer NOT NULL REFERENCES "warehouses"("id") ON DELETE cascade,
  "item_id" integer NOT NULL REFERENCES "items"("id") ON DELETE cascade,
  "quantity" double precision DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_warehouse_stock_warehouse_item" ON "warehouse_stock" ("warehouse_id", "item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_warehouse_stock_item" ON "warehouse_stock" ("item_id");
--> statement-breakpoint
INSERT INTO "warehouses" ("company_id", "location_id", "code", "name", "is_default")
SELECT l."company_id", l."id", 'MAIN', 'Main warehouse', true FROM "inventory_locations" l
WHERE NOT EXISTS (SELECT 1 FROM "warehouses" w WHERE w."location_id" = l."id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION create_default_warehouse() RETURNS trigger AS $$
BEGIN
  INSERT INTO "warehouses" ("company_id", "location_id", "code", "name", "is_default")
  VALUES (NEW."company_id", NEW."id", 'MAIN', 'Main warehouse', true)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_inventory_locations_default_warehouse ON "inventory_locations";
--> statement-breakpoint
CREATE TRIGGER trg_inventory_locations_default_warehouse AFTER INSERT ON "inventory_locations" FOR EACH ROW EXECUTE FUNCTION create_default_warehouse();
