ALTER TABLE contacts ADD COLUMN IF NOT EXISTS sales_owner_id integer REFERENCES app_users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_by_user_id integer REFERENCES app_users(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_contacts_sales_owner ON contacts(company_id, sales_owner_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_transactions_creator ON transactions(company_id, created_by_user_id);
