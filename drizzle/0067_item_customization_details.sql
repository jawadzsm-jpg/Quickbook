ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "customization_ram" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "customization_storage" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "part_number" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "item_serial_number" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "upc_number" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "customization_details" text DEFAULT '' NOT NULL;
