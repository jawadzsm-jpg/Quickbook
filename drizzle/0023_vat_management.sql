CREATE TABLE IF NOT EXISTS "vat_adjustments" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL,
  "location_id" integer,
  "adjustment_date" text NOT NULL,
  "reference" text NOT NULL,
  "direction" text NOT NULL,
  "amount" double precision NOT NULL,
  "reason" text NOT NULL,
  "created_by_user_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vat_adjustments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade,
  CONSTRAINT "vat_adjustments_location_id_inventory_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE set null,
  CONSTRAINT "vat_adjustments_created_by_user_id_app_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."app_users"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vat_adjustments_company_date" ON "vat_adjustments" USING btree ("company_id", "adjustment_date");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_vat_adjustments_company_reference" ON "vat_adjustments" USING btree ("company_id", "reference");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vat_returns" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL,
  "location_id" integer,
  "period_start" text NOT NULL,
  "period_end" text NOT NULL,
  "reference" text NOT NULL,
  "output_vat" double precision DEFAULT 0 NOT NULL,
  "input_vat" double precision DEFAULT 0 NOT NULL,
  "adjustments" double precision DEFAULT 0 NOT NULL,
  "net_vat_due" double precision DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'filed' NOT NULL,
  "filed_by_user_id" integer,
  "filed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vat_returns_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade,
  CONSTRAINT "vat_returns_location_id_inventory_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE set null,
  CONSTRAINT "vat_returns_filed_by_user_id_app_users_id_fk" FOREIGN KEY ("filed_by_user_id") REFERENCES "public"."app_users"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vat_returns_company_period" ON "vat_returns" USING btree ("company_id", "period_start", "period_end");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_vat_returns_company_reference" ON "vat_returns" USING btree ("company_id", "reference");
