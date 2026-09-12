ALTER TABLE transactions ADD COLUMN IF NOT EXISTS purchase_order_id integer REFERENCES transactions(id) ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_transactions_purchase_order ON transactions(purchase_order_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS purchase_receipt_allocations (
 id serial PRIMARY KEY,
 receipt_id integer NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
 order_line_id integer NOT NULL REFERENCES transaction_lines(id) ON DELETE RESTRICT,
 quantity double precision NOT NULL CHECK (quantity > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_purchase_receipt_line ON purchase_receipt_allocations(order_line_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_receipt_pair ON purchase_receipt_allocations(receipt_id, order_line_id);
