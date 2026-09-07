CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"base_currency" text DEFAULT 'AED' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "companies" ("name", "base_currency") VALUES ('ComNet International', 'AED');--> statement-breakpoint
INSERT INTO "inventory_locations" ("company_id", "name", "code") VALUES (1, 'Main Inventory', 'MAIN');--> statement-breakpoint
DROP INDEX "idx_accounts_code";--> statement-breakpoint
DROP INDEX "idx_contacts_type_name";--> statement-breakpoint
DROP INDEX "idx_items_name";--> statement-breakpoint
DROP INDEX "idx_journal_entries_date";--> statement-breakpoint
DROP INDEX "idx_transactions_date";--> statement-breakpoint
DROP INDEX "idx_transactions_type_status";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "company_id" integer;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "company_id" integer;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "company_id" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "company_id" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "location_id" integer;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "company_id" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "company_id" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "location_id" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "exchange_rate" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "base_total" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "accounts" SET "company_id" = 1;--> statement-breakpoint
UPDATE "audit_log" SET "company_id" = 1;--> statement-breakpoint
UPDATE "contacts" SET "company_id" = 1;--> statement-breakpoint
UPDATE "items" SET "company_id" = 1, "location_id" = 1;--> statement-breakpoint
UPDATE "journal_entries" SET "company_id" = 1;--> statement-breakpoint
UPDATE "transactions" SET "company_id" = 1, "location_id" = 1, "base_total" = "total";--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "location_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entries" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_locations" ADD CONSTRAINT "inventory_locations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_companies_name" ON "companies" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_inventory_locations_company_code" ON "inventory_locations" USING btree ("company_id","code");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_location_id_inventory_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_location_id_inventory_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_accounts_company_code" ON "accounts" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "idx_contacts_company_type_name" ON "contacts" USING btree ("company_id","type","name");--> statement-breakpoint
CREATE INDEX "idx_items_company_location_name" ON "items" USING btree ("company_id","location_id","name");--> statement-breakpoint
CREATE INDEX "idx_journal_entries_company_date" ON "journal_entries" USING btree ("company_id","entry_date");--> statement-breakpoint
CREATE INDEX "idx_transactions_company_date" ON "transactions" USING btree ("company_id","transaction_date");--> statement-breakpoint
CREATE INDEX "idx_transactions_company_type_status" ON "transactions" USING btree ("company_id","type","status");
