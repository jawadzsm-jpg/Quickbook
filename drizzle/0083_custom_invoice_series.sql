ALTER TABLE inventory_locations ADD COLUMN IF NOT EXISTS invoice_number_format text NOT NULL DEFAULT 'C{COMPANY}-{PREFIX}-INV-{NUMBER}';
--> statement-breakpoint
ALTER TABLE inventory_locations ADD COLUMN IF NOT EXISTS invoice_number_padding integer NOT NULL DEFAULT 4;
