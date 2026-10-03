ALTER TABLE contacts ADD COLUMN IF NOT EXISTS salary_amount double precision NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS salary_expense_account_id integer;
--> statement-breakpoint
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS loan_balance double precision NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS vacation_departure text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS vacation_return text NOT NULL DEFAULT '';
