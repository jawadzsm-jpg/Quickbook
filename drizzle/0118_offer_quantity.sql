-- Today Offer quantity: how many may be sold at the offer. Null = no limit. Sales on invoices and sales receipts made
-- after the offer starts count down; when the quantity is sold the offer is over.
ALTER TABLE "item_offers" ADD COLUMN IF NOT EXISTS "offer_quantity" double precision;
