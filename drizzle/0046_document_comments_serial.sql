ALTER TABLE transactions ADD COLUMN IF NOT EXISTS comments text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS serial_number text NOT NULL DEFAULT '';
