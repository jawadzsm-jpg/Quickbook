CREATE TABLE "inventory_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"transaction_id" integer NOT NULL,
	"movement_date" text NOT NULL,
	"movement_type" text NOT NULL,
	"quantity" double precision NOT NULL,
	"unit_cost" double precision DEFAULT 0 NOT NULL,
	"reference" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" integer NOT NULL,
	"item_id" integer,
	"description" text NOT NULL,
	"quantity" double precision DEFAULT 1 NOT NULL,
	"unit_price" double precision DEFAULT 0 NOT NULL,
	"unit_cost" double precision DEFAULT 0 NOT NULL,
	"vat_rate" double precision DEFAULT 5 NOT NULL,
	"subtotal" double precision DEFAULT 0 NOT NULL,
	"vat_amount" double precision DEFAULT 0 NOT NULL,
	"total" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_inventory_movements_item_date" ON "inventory_movements" USING btree ("item_id","movement_date");--> statement-breakpoint
CREATE INDEX "idx_inventory_movements_transaction" ON "inventory_movements" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "idx_transaction_lines_transaction" ON "transaction_lines" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "idx_transaction_lines_item" ON "transaction_lines" USING btree ("item_id");