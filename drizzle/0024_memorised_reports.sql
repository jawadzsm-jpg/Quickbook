CREATE TABLE IF NOT EXISTS "memorised_reports" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "company_id" integer NOT NULL,
  "location_id" integer,
  "name" text NOT NULL,
  "report_key" text NOT NULL,
  "category" text NOT NULL,
  "currency" text DEFAULT 'AED' NOT NULL,
  "period_start" text DEFAULT '' NOT NULL,
  "period_end" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "memorised_reports_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade,
  CONSTRAINT "memorised_reports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade,
  CONSTRAINT "memorised_reports_location_id_inventory_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_memorised_reports_user_company_report" ON "memorised_reports" USING btree ("user_id", "company_id", "report_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_memorised_reports_user_company_category" ON "memorised_reports" USING btree ("user_id", "company_id", "category");
