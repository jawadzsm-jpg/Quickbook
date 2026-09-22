CREATE TABLE IF NOT EXISTS "packing_lists" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "location_id" integer REFERENCES "inventory_locations"("id") ON DELETE set null,
  "invoice_id" integer NOT NULL REFERENCES "transactions"("id") ON DELETE cascade,
  "number" text NOT NULL,
  "packing_date" text NOT NULL,
  "delivery_address" text DEFAULT '' NOT NULL,
  "memo" text DEFAULT '' NOT NULL,
  "created_by_user_id" integer REFERENCES "app_users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_packing_lists_company_number" ON "packing_lists" USING btree ("company_id", "number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_packing_lists_invoice" ON "packing_lists" USING btree ("invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_packing_lists_company_date" ON "packing_lists" USING btree ("company_id", "packing_date");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "packing_list_lines" (
  "id" serial PRIMARY KEY NOT NULL,
  "packing_list_id" integer NOT NULL REFERENCES "packing_lists"("id") ON DELETE cascade,
  "invoice_line_id" integer NOT NULL REFERENCES "transaction_lines"("id") ON DELETE restrict,
  "item_id" integer REFERENCES "items"("id") ON DELETE set null,
  "item_number" text DEFAULT '' NOT NULL,
  "sku" text DEFAULT '' NOT NULL,
  "description" text NOT NULL,
  "hs_code" text DEFAULT '' NOT NULL,
  "country_of_origin" text DEFAULT '' NOT NULL,
  "packed_quantity" double precision NOT NULL,
  "units_per_carton" double precision NOT NULL,
  "carton_count" integer NOT NULL,
  "gross_weight_kg" double precision DEFAULT 0 NOT NULL,
  "carton_weight_kg" double precision DEFAULT 0 NOT NULL,
  "dimension_text" text DEFAULT '' NOT NULL,
  "length_cm" double precision DEFAULT 0 NOT NULL,
  "width_cm" double precision DEFAULT 0 NOT NULL,
  "height_cm" double precision DEFAULT 0 NOT NULL,
  "cbm_per_carton" double precision DEFAULT 0 NOT NULL,
  "total_cbm" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_packing_list_lines_list" ON "packing_list_lines" USING btree ("packing_list_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_packing_list_lines_invoice_line" ON "packing_list_lines" USING btree ("invoice_line_id");
