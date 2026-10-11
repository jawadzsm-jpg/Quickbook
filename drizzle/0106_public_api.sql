-- Integration API (Phase 1): items record when they last changed, and read-only API keys per company.
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION set_items_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_items_updated_at ON "items";
--> statement-breakpoint
CREATE TRIGGER trg_items_updated_at BEFORE UPDATE ON "items" FOR EACH ROW EXECUTE FUNCTION set_items_updated_at();
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_items_company_updated" ON "items" ("company_id", "updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "key_prefix" text NOT NULL,
  "key_hash" text NOT NULL,
  "scopes" text DEFAULT 'products:read' NOT NULL,
  "created_by_user_id" integer REFERENCES "app_users"("id") ON DELETE set null,
  "created_by_name" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "revoked_by_name" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_api_keys_hash" ON "api_keys" ("key_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_api_keys_company" ON "api_keys" ("company_id");
