ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "cheque_bank_key" text DEFAULT '' NOT NULL;
