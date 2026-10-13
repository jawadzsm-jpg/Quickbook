-- EasyBook edition: how many companies, inventories and warehouses this installation may use. One row (id = 1);
-- only an All-Admin changes it (Admin Controls → EasyBook edition). Not part of company backups.
CREATE TABLE IF NOT EXISTS "app_settings" (
  "id" integer PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
  "edition" text NOT NULL DEFAULT 'multi_company' CHECK ("edition" IN ('multi_company', 'single_company', 'single_inventory', 'single_warehouse')),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by" text NOT NULL DEFAULT ''
);
--> statement-breakpoint
INSERT INTO "app_settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
