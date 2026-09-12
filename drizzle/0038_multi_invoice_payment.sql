CREATE TABLE IF NOT EXISTS invoice_payment_allocations (
  id SERIAL PRIMARY KEY,
  payment_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  invoice_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  amount DOUBLE PRECISION NOT NULL CHECK (amount > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_payment_pair ON invoice_payment_allocations(payment_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_allocation_invoice ON invoice_payment_allocations(invoice_id);
INSERT INTO invoice_payment_allocations(payment_id, invoice_id, amount)
SELECT id, invoice_id, total FROM transactions WHERE type = 'customer payment' AND invoice_id IS NOT NULL AND total > 0
ON CONFLICT (payment_id, invoice_id) DO NOTHING;
