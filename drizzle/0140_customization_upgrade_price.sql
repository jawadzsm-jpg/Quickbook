-- Product Customization RAM and Storage upgrade options get a price (excluding VAT, in the viewed company's base
-- currency), added to the item's price in Inventory Overview when the upgrade is picked. Other options keep 0.
ALTER TABLE "specification_options" ADD COLUMN IF NOT EXISTS "price" double precision DEFAULT 0 NOT NULL;
