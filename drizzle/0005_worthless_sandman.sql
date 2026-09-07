ALTER TABLE "items" ADD COLUMN "item_number" text;--> statement-breakpoint
UPDATE "items" SET "item_number" = (13000 + "id")::text WHERE "item_number" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_items_item_number" ON "items" USING btree ("item_number");
