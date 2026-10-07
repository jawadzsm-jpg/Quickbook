-- Delivery (Ship To) address on sales documents; multi-line free text, printed in Ship To.
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "delivery_address" text DEFAULT '' NOT NULL;
