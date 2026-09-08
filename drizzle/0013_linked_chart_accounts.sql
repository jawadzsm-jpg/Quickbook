ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "system_role" text;
--> statement-breakpoint
UPDATE "accounts" SET "system_role" = CASE "name"
  WHEN 'Business Bank' THEN 'BANK'
  WHEN 'Accounts Receivable' THEN 'AR'
  WHEN 'Inventory Asset' THEN 'INVENTORY'
  WHEN 'Recoverable VAT' THEN 'INPUT_VAT'
  WHEN 'Accounts Payable' THEN 'AP'
  WHEN 'VAT Payable' THEN 'OUTPUT_VAT'
  WHEN 'Opening Balance Equity' THEN 'EQUITY'
  WHEN 'Sales Revenue' THEN 'SALES'
  WHEN 'Other Income' THEN 'OTHER_INCOME'
  WHEN 'Cost of Goods Sold' THEN 'COGS'
  WHEN 'Purchases' THEN 'PURCHASES'
  WHEN 'Operating Expenses' THEN 'EXPENSE'
  WHEN 'Payroll Expense' THEN 'PAYROLL'
  WHEN 'Suspense' THEN 'SUSPENSE'
  ELSE "system_role"
END
WHERE "system_role" IS NULL;
--> statement-breakpoint
UPDATE "accounts" SET "type" = CASE "system_role"
  WHEN 'BANK' THEN 'Bank'
  WHEN 'AR' THEN 'Accounts Receivable'
  WHEN 'AP' THEN 'Accounts Payable'
  WHEN 'INVENTORY' THEN 'Other Current Asset'
  WHEN 'INPUT_VAT' THEN 'Other Current Asset'
  WHEN 'OUTPUT_VAT' THEN 'Other Current Liability'
  WHEN 'EQUITY' THEN 'Equity'
  WHEN 'SALES' THEN 'Income'
  WHEN 'OTHER_INCOME' THEN 'Other Income'
  WHEN 'COGS' THEN 'Cost of Goods Sold'
  WHEN 'PURCHASES' THEN 'Expense'
  WHEN 'EXPENSE' THEN 'Expense'
  WHEN 'PAYROLL' THEN 'Expense'
  WHEN 'SUSPENSE' THEN 'Other Current Asset'
  ELSE "type"
END
WHERE "system_role" IS NOT NULL;
--> statement-breakpoint
DELETE FROM "accounts" account
WHERE account."system_role" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "journal_lines" line WHERE lower(line."account_name") = lower(account."name"))
  AND NOT EXISTS (SELECT 1 FROM "transactions" transaction WHERE transaction."company_id" = account."company_id" AND lower(transaction."account") = lower(account."name"))
  AND NOT EXISTS (SELECT 1 FROM "accounts" child WHERE child."parent_account_id" = account."id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_accounts_company_system_role" ON "accounts" USING btree ("company_id", "system_role") WHERE "system_role" IS NOT NULL;
