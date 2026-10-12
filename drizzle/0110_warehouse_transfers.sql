-- Warehouses (Phase 3): moves between warehouses of the same inventory. A move changes only warehouse stock; the
-- inventory total (items.quantity), cost and the ledger are unchanged, so no stock movement or journal is written.
CREATE TABLE IF NOT EXISTS "warehouse_transfers" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "location_id" integer NOT NULL REFERENCES "inventory_locations"("id") ON DELETE cascade,
  "item_id" integer NOT NULL REFERENCES "items"("id") ON DELETE cascade,
  "from_warehouse_id" integer NOT NULL REFERENCES "warehouses"("id") ON DELETE no action,
  "to_warehouse_id" integer NOT NULL REFERENCES "warehouses"("id") ON DELETE no action,
  "quantity" double precision NOT NULL,
  "reference" text NOT NULL,
  "transfer_date" text NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "created_by_user_id" integer REFERENCES "app_users"("id") ON DELETE set null,
  "created_by_name" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_warehouse_transfers_location" ON "warehouse_transfers" ("company_id", "location_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_warehouse_transfers_item" ON "warehouse_transfers" ("item_id");
