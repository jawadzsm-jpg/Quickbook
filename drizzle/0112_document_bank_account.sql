-- A sales document can print a chosen company bank account instead of the one matching its currency.
-- '' keeps the currency rule (existing documents), 'default' is the main bank account, otherwise an extra account id.
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "bank_account_key" text DEFAULT '' NOT NULL;
