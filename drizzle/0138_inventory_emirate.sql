-- VAT201 Box 1 splits standard-rated supplies by the emirate of the establishment that made them. Each inventory
-- (branch) records its emirate (lib/vat-return.ts key, e.g. "dubai"); empty follows the company's emirate from its address.
ALTER TABLE "inventory_locations" ADD COLUMN IF NOT EXISTS "emirate" text DEFAULT '' NOT NULL;
