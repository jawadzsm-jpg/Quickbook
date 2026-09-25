ALTER TABLE warranty_slips ADD COLUMN IF NOT EXISTS supplier_id integer REFERENCES contacts(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE warranty_slips ADD COLUMN IF NOT EXISTS purchase_bill_id integer REFERENCES transactions(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE warranty_slips ADD COLUMN IF NOT EXISTS supplier_name text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE warranty_slips ADD COLUMN IF NOT EXISTS purchase_number text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE warranty_slips ADD COLUMN IF NOT EXISTS purchase_date text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE warranty_slips ADD COLUMN IF NOT EXISTS returned_to_supplier_date text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE warranty_slips ADD COLUMN IF NOT EXISTS received_from_supplier_date text NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_warranty_slips_supplier ON warranty_slips(company_id, supplier_id);
