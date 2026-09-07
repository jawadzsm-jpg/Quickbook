CREATE TABLE "stock_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"source_company_id" integer NOT NULL,
	"source_location_id" integer NOT NULL,
	"destination_company_id" integer NOT NULL,
	"destination_location_id" integer NOT NULL,
	"item_number" text,
	"sku" text NOT NULL,
	"item_name" text NOT NULL,
	"quantity" double precision NOT NULL,
	"transfer_date" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "idx_items_item_number";--> statement-breakpoint
DROP INDEX "idx_items_sku";--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_source_company_id_companies_id_fk" FOREIGN KEY ("source_company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_source_location_id_inventory_locations_id_fk" FOREIGN KEY ("source_location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_destination_company_id_companies_id_fk" FOREIGN KEY ("destination_company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_destination_location_id_inventory_locations_id_fk" FOREIGN KEY ("destination_location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_stock_transfers_reference" ON "stock_transfers" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "idx_stock_transfers_source_date" ON "stock_transfers" USING btree ("source_company_id","transfer_date");--> statement-breakpoint
CREATE INDEX "idx_stock_transfers_destination_date" ON "stock_transfers" USING btree ("destination_company_id","transfer_date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_items_location_item_number" ON "items" USING btree ("company_id","location_id","item_number");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_items_location_sku" ON "items" USING btree ("company_id","location_id","sku");