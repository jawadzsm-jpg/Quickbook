CREATE TABLE "rcm_declarations" (
 "id" serial PRIMARY KEY NOT NULL, "company_id" integer NOT NULL, "number" text DEFAULT '' NOT NULL,
 "declaration_date" text NOT NULL, "supply_date" text NOT NULL, "valid_from" text NOT NULL, "valid_until" text NOT NULL,
 "recipient_company" text NOT NULL, "recipient_license" text DEFAULT '' NOT NULL, "recipient_trn" text NOT NULL, "recipient_address" text DEFAULT '' NOT NULL,
 "authorized_signatory" text NOT NULL, "recipient_contact" text DEFAULT '' NOT NULL, "recipient_telephone" text DEFAULT '' NOT NULL, "recipient_email" text DEFAULT '' NOT NULL, "footer_address" text DEFAULT '' NOT NULL,
 "supplier_company" text NOT NULL, "supplier_license" text DEFAULT '' NOT NULL, "supplier_trn" text NOT NULL, "supplier_address" text DEFAULT '' NOT NULL, "supplier_manager" text DEFAULT '' NOT NULL, "supplier_contact" text DEFAULT '' NOT NULL,
 "acquisition_purpose" text DEFAULT 'resale' NOT NULL, "show_stamp" boolean DEFAULT false NOT NULL, "stamp_left" integer DEFAULT 155 NOT NULL, "stamp_top" integer DEFAULT 230 NOT NULL,
 "created_by_user_id" integer, "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rcm_declarations" ADD CONSTRAINT "rcm_declarations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "rcm_declarations" ADD CONSTRAINT "rcm_declarations_created_by_user_id_app_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_rcm_declarations_company_number" ON "rcm_declarations" USING btree ("company_id","number");
--> statement-breakpoint
CREATE INDEX "idx_rcm_declarations_company_date" ON "rcm_declarations" USING btree ("company_id","declaration_date");
