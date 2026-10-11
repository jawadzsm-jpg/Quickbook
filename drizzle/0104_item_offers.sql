-- Today Offer: a special selling price for an item between a start and an end time (Inventory Overview).
CREATE TABLE IF NOT EXISTS "item_offers" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "item_id" integer NOT NULL REFERENCES "items"("id") ON DELETE cascade,
  "offer_price" double precision NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "created_by_user_id" integer REFERENCES "app_users"("id") ON DELETE set null,
  "created_by_name" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ended_at" timestamp with time zone,
  "ended_by_name" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_item_offers_item_window" ON "item_offers" ("item_id", "ends_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_item_offers_company" ON "item_offers" ("company_id", "starts_at");
