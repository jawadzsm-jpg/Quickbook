ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS currency text;
--> statement-breakpoint
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS exchange_rate double precision NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS original_debit double precision;
--> statement-breakpoint
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS original_credit double precision;
