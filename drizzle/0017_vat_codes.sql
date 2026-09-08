CREATE TABLE IF NOT EXISTS "vat_codes" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "rate" double precision DEFAULT 0 NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "system" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_vat_codes_company_code" ON "vat_codes" USING btree ("company_id", "code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vat_codes_company_active" ON "vat_codes" USING btree ("company_id", "active");
--> statement-breakpoint
INSERT INTO "vat_codes" ("company_id", "code", "name", "rate", "description", "active", "system")
SELECT company."id", defaults."code", defaults."name", defaults."rate", defaults."description", true, true
FROM "companies" company
CROSS JOIN (VALUES
  ('STANDARD', 'Standard rated', 5::double precision, 'Standard UAE VAT rate'),
  ('ZERO', 'Zero rated', 0::double precision, 'Taxable supply charged at 0%'),
  ('EXEMPT', 'Exempt', 0::double precision, 'Supply exempt from VAT'),
  ('OUT_OF_SCOPE', 'Out of scope', 0::double precision, 'Transaction outside the scope of VAT')
) AS defaults("code", "name", "rate", "description")
ON CONFLICT ("company_id", "code") DO NOTHING;
