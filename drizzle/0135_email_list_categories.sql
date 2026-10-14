-- Email list categories are kept in their own table, so a user can add a category before any address uses it, rename it
-- (its addresses follow) and delete it (its addresses keep no category). One set per company, list and owner, like the
-- addresses (app/api/email-lists); the addresses' own `category` text stays the source for filtering and sending.
CREATE TABLE IF NOT EXISTS "email_list_categories" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "list_type" text NOT NULL,
  "owner_user_id" integer REFERENCES "app_users"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_email_list_categories_owner_name" ON "email_list_categories" ("company_id", "list_type", COALESCE("owner_user_id", 0), lower("name"));
--> statement-breakpoint
-- The categories already used by addresses (migration 0134) become saved categories of their owners.
INSERT INTO "email_list_categories" ("company_id", "list_type", "owner_user_id", "name")
SELECT DISTINCT ON ("company_id", "list_type", COALESCE("created_by_user_id", 0), lower("category")) "company_id", "list_type", "created_by_user_id", "category"
FROM "email_list_contacts" WHERE "category" <> ''
ORDER BY "company_id", "list_type", COALESCE("created_by_user_id", 0), lower("category"), "id"
ON CONFLICT DO NOTHING;
