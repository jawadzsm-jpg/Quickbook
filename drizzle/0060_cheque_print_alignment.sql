ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "cheque_offset_x" double precision DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "cheque_offset_y" double precision DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "cheque_amount_offset_x" double precision DEFAULT 0 NOT NULL;
