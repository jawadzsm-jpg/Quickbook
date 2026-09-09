ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "currency" text DEFAULT 'AED' NOT NULL;
UPDATE "accounts" AS account
SET "currency" = company."base_currency"
FROM "companies" AS company
WHERE account."company_id" = company."id";
DROP INDEX IF EXISTS "idx_accounts_company_system_role";
CREATE UNIQUE INDEX IF NOT EXISTS "idx_accounts_company_system_role_currency"
ON "accounts" ("company_id", "system_role", "currency");
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "ledger_account_id" integer;
CREATE INDEX IF NOT EXISTS "idx_contacts_ledger_account" ON "contacts" ("ledger_account_id");
UPDATE "contacts" AS contact
SET "ledger_account_id" = account."id"
FROM "accounts" AS account
WHERE contact."ledger_account_id" IS NULL
  AND contact."company_id" = account."company_id"
  AND contact."currency" = account."currency"
  AND ((contact."type" = 'customer' AND account."system_role" = 'AR') OR (contact."type" = 'vendor' AND account."system_role" = 'AP'));
