ALTER TABLE "inventory_locations" ADD COLUMN "invoice_prefix" text;--> statement-breakpoint
ALTER TABLE "inventory_locations" ADD COLUMN "next_invoice_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE "inventory_locations" SET "invoice_prefix" = "code";--> statement-breakpoint
UPDATE "inventory_locations" AS location SET "next_invoice_number" = 1 + (SELECT count(*)::integer FROM "transactions" WHERE "transactions"."location_id" = location."id" AND "transactions"."type" = 'invoice');--> statement-breakpoint
ALTER TABLE "inventory_locations" ALTER COLUMN "invoice_prefix" SET NOT NULL;
