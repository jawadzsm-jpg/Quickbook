-- Shared cargo / freight agent list: every user of a company can add entries.
CREATE TABLE IF NOT EXISTS "cargos" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "telephone" text DEFAULT '' NOT NULL,
  "mobile" text DEFAULT '' NOT NULL,
  "email" text DEFAULT '' NOT NULL,
  "modes" text DEFAULT '' NOT NULL,
  "destinations" text DEFAULT '' NOT NULL,
  "address" text DEFAULT '' NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "created_by_user_id" integer REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_by_name" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cargos_company" ON "cargos" ("company_id", "id");
