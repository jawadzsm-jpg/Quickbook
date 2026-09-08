CREATE TABLE IF NOT EXISTS "exchange_rates" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "currency_code" text NOT NULL,
  "rate" double precision NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_exchange_rates_company_currency" ON "exchange_rates" USING btree ("company_id", "currency_code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_exchange_rates_company_active" ON "exchange_rates" USING btree ("company_id", "active");
--> statement-breakpoint
INSERT INTO "exchange_rates" ("company_id", "currency_code", "rate", "active")
SELECT "id", "base_currency", 1::double precision, true FROM "companies"
ON CONFLICT ("company_id", "currency_code") DO UPDATE SET "rate" = 1, "active" = true, "updated_at" = now();
