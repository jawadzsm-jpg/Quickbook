ALTER TABLE transactions ADD COLUMN IF NOT EXISTS employee_loan_contact_id integer;
CREATE INDEX IF NOT EXISTS transactions_employee_loan_idx ON transactions (company_id, employee_loan_contact_id) WHERE employee_loan_contact_id IS NOT NULL;
