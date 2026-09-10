CREATE TABLE IF NOT EXISTS "inventory_check_reports" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "location_id" integer NOT NULL REFERENCES "inventory_locations"("id") ON DELETE CASCADE,
  "memo" text DEFAULT '' NOT NULL,
  "created_by_user_id" integer REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inventory_check_reports_company_date" ON "inventory_check_reports" ("company_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inventory_check_reports_location" ON "inventory_check_reports" ("location_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_check_lines" (
  "id" serial PRIMARY KEY NOT NULL,
  "report_id" integer NOT NULL REFERENCES "inventory_check_reports"("id") ON DELETE CASCADE,
  "item_id" integer REFERENCES "items"("id") ON DELETE SET NULL,
  "item_number" text DEFAULT '' NOT NULL,
  "sku" text NOT NULL,
  "item_name" text NOT NULL,
  "system_quantity" double precision DEFAULT 0 NOT NULL,
  "counted_quantity" double precision
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inventory_check_lines_report" ON "inventory_check_lines" ("report_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inventory_check_lines_item" ON "inventory_check_lines" ("item_id");
