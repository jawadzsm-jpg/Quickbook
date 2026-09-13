ALTER TABLE transaction_lines ADD COLUMN IF NOT EXISTS freight_charge double precision NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE transaction_lines ADD COLUMN IF NOT EXISTS is_freight_charge boolean NOT NULL DEFAULT false;
