ALTER TABLE memorised_reports ADD COLUMN IF NOT EXISTS customer text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE memorised_reports ADD COLUMN IF NOT EXISTS statement_date text NOT NULL DEFAULT '';
