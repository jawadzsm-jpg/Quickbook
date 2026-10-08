-- Stock held for a sales rep for a limited time. Active holds (not released, not expired) are not available to
-- other sales, purchase returns or transfers.
CREATE TABLE IF NOT EXISTS "stock_holds" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "item_id" integer NOT NULL REFERENCES "items"("id") ON DELETE CASCADE,
  "quantity" double precision NOT NULL,
  "sales_rep" text NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_by_user_id" integer REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_by_name" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "released_at" timestamp with time zone,
  "released_by_name" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_holds_item_active" ON "stock_holds" ("item_id", "expires_at") WHERE "released_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_holds_company" ON "stock_holds" ("company_id", "created_at");
