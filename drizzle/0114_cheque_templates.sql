-- Company cheque templates: one per UAE bank cheque layout (size, field positions, printer feed) with an optional
-- scan of a blank cheque used only as the designer background. Every cheque from that bank prints with it.
CREATE TABLE IF NOT EXISTS "cheque_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "layout_key" text NOT NULL,
  "config" text DEFAULT '{}' NOT NULL,
  "background_data" text DEFAULT '' NOT NULL,
  "updated_by_name" text DEFAULT '' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_cheque_templates_company_layout" ON "cheque_templates" ("company_id", "layout_key");
