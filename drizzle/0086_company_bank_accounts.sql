ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "bank_accounts" text DEFAULT '' NOT NULL;
