ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "cheque_date_offset_x" double precision DEFAULT 0 NOT NULL;
