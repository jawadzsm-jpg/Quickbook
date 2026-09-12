ALTER TABLE transactions ADD COLUMN IF NOT EXISTS sales_source_id integer REFERENCES transactions(id) ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_transactions_sales_source ON transactions(sales_source_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sales_invoice_allocations (
 id serial PRIMARY KEY,
 invoice_id integer NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
 source_line_id integer NOT NULL REFERENCES transaction_lines(id) ON DELETE RESTRICT,
 quantity double precision NOT NULL CHECK (quantity > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_sales_invoice_source_line ON sales_invoice_allocations(source_line_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_invoice_pair ON sales_invoice_allocations(invoice_id, source_line_id);
