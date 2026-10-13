-- Email lists for Inventory Overview emails: one Sales list (customers) and one Purchase list (suppliers) per company,
-- shared by the company's users and filled by hand or from a CSV file. An address appears once per list.
CREATE TABLE IF NOT EXISTS "email_list_contacts" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "list_type" text NOT NULL CHECK ("list_type" IN ('sales', 'purchase')),
  "name" text NOT NULL DEFAULT '',
  "email" text NOT NULL,
  "created_by_user_id" integer REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_email_list_contacts_address" ON "email_list_contacts" ("company_id", "list_type", lower("email"));
