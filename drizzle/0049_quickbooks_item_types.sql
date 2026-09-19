ALTER TABLE items ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'stock-part';
--> statement-breakpoint
ALTER TABLE items ADD COLUMN IF NOT EXISTS purchase_vat_code text NOT NULL DEFAULT 'STANDARD';
--> statement-breakpoint
ALTER TABLE items ADD COLUMN IF NOT EXISTS cogs_account_id integer;
--> statement-breakpoint
ALTER TABLE items ADD COLUMN IF NOT EXISTS preferred_supplier_id integer;
--> statement-breakpoint
ALTER TABLE items ADD COLUMN IF NOT EXISTS sales_vat_code text NOT NULL DEFAULT 'STANDARD';
--> statement-breakpoint
ALTER TABLE items ADD COLUMN IF NOT EXISTS income_account_id integer;
--> statement-breakpoint
ALTER TABLE items ADD COLUMN IF NOT EXISTS asset_account_id integer;
--> statement-breakpoint
ALTER TABLE items ADD COLUMN IF NOT EXISTS amounts_include_vat boolean NOT NULL DEFAULT false;
