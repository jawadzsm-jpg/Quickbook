CREATE TABLE IF NOT EXISTS bill_payment_allocations (
 id serial PRIMARY KEY,
 payment_id integer NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
 bill_id integer NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
 amount double precision NOT NULL CHECK (amount > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_bill_payment_pair ON bill_payment_allocations(payment_id,bill_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_bill_allocation_bill ON bill_payment_allocations(bill_id);
