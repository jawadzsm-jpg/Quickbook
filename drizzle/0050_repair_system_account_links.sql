-- Repair legacy Chart of Accounts links so existing companies post to the correct accounting areas.
-- This migration is idempotent and only claims a named legacy account when that system role is still missing.

UPDATE accounts a
SET system_role = 'COGS', type = 'Cost of Goods Sold'
WHERE a.active = true
  AND a.system_role IS NULL
  AND (lower(trim(a.name)) IN ('cost of goods','cost of goods sold','cogs') OR lower(trim(a.code)) = 'cogs')
  AND NOT EXISTS (SELECT 1 FROM accounts x WHERE x.company_id=a.company_id AND x.system_role='COGS');
--> statement-breakpoint

UPDATE accounts a
SET system_role = 'SALES', type = 'Income'
WHERE a.active = true
  AND a.system_role IS NULL
  AND (lower(trim(a.name)) IN ('sales revenue','sales income') OR (a.code='4100' AND lower(trim(a.name))='income'))
  AND NOT EXISTS (SELECT 1 FROM accounts x WHERE x.company_id=a.company_id AND x.system_role='SALES');
--> statement-breakpoint

UPDATE accounts a
SET system_role = 'INPUT_VAT', type = 'Other Current Asset'
WHERE a.active = true
  AND a.system_role IS NULL
  AND lower(trim(a.name)) IN ('recoverable vat','input vat','vat recoverable')
  AND NOT EXISTS (SELECT 1 FROM accounts x WHERE x.company_id=a.company_id AND x.system_role='INPUT_VAT');
--> statement-breakpoint

UPDATE accounts a
SET system_role = 'OUTPUT_VAT', type = 'Other Current Liability'
WHERE a.active = true
  AND a.system_role IS NULL
  AND lower(trim(a.name)) IN ('vat payable','output vat')
  AND NOT EXISTS (SELECT 1 FROM accounts x WHERE x.company_id=a.company_id AND x.system_role='OUTPUT_VAT');
--> statement-breakpoint

UPDATE accounts a
SET system_role = 'BANK', type = 'Bank'
WHERE a.active = true
  AND a.system_role IS NULL
  AND lower(trim(a.name)) IN ('cash on hand','cash on head','business bank')
  AND NOT EXISTS (SELECT 1 FROM accounts x WHERE x.company_id=a.company_id AND x.system_role='BANK');
--> statement-breakpoint

UPDATE accounts a
SET system_role = 'PAYROLL', type = 'Expense'
WHERE a.active = true
  AND a.system_role IS NULL
  AND lower(trim(a.name)) IN ('salary account','payroll expense','salary expense')
  AND NOT EXISTS (SELECT 1 FROM accounts x WHERE x.company_id=a.company_id AND x.system_role='PAYROLL');
--> statement-breakpoint

UPDATE accounts a
SET system_role = 'PURCHASES'
WHERE a.active = true
  AND a.system_role IS NULL
  AND lower(trim(a.name)) IN ('purchases','purchase account')
  AND a.type IN ('Expense','Cost of Goods Sold')
  AND NOT EXISTS (SELECT 1 FROM accounts x WHERE x.company_id=a.company_id AND x.system_role='PURCHASES');

-- Create only missing control/default accounts. Codes are company-safe even if a legacy numeric code is already occupied.
INSERT INTO accounts (company_id, code, name, type, system_role, currency)
SELECT c.id, 'SYS-INVENTORY-'||c.id, 'Inventory Asset', 'Other Current Asset', 'INVENTORY', c.base_currency
FROM companies c
WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.system_role='INVENTORY');
--> statement-breakpoint

INSERT INTO accounts (company_id, code, name, type, system_role, currency)
SELECT c.id, 'SYS-PURCHASES-'||c.id, 'Purchases', 'Expense', 'PURCHASES', c.base_currency
FROM companies c
WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.system_role='PURCHASES');
--> statement-breakpoint

INSERT INTO accounts (company_id, code, name, type, system_role, currency)
SELECT c.id, 'SYS-EXPENSE-'||c.id, 'Operating Expenses', 'Expense', 'EXPENSE', c.base_currency
FROM companies c
WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.system_role='EXPENSE');
--> statement-breakpoint

INSERT INTO accounts (company_id, code, name, type, system_role, currency)
SELECT c.id, 'SYS-OTHER-INCOME-'||c.id, 'Other Income', 'Other Income', 'OTHER_INCOME', c.base_currency
FROM companies c
WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.system_role='OTHER_INCOME');
--> statement-breakpoint

INSERT INTO accounts (company_id, code, name, type, system_role, currency)
SELECT c.id, 'SYS-SUSPENSE-'||c.id, 'Suspense', 'Other Current Asset', 'SUSPENSE', c.base_currency
FROM companies c
WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.system_role='SUSPENSE');

-- Backfill item links to the valid account purpose for legacy stock items with blank or incorrect links.
UPDATE items i
SET asset_account_id = inv.id
FROM accounts inv
WHERE inv.company_id=i.company_id
  AND inv.system_role='INVENTORY'
  AND i.item_type='stock-part'
  AND (
    i.asset_account_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM accounts a WHERE a.id=i.asset_account_id AND a.company_id=i.company_id
        AND (a.system_role='INVENTORY' OR lower(a.name) LIKE '%inventory asset%')
    )
  );
--> statement-breakpoint

UPDATE items i
SET cogs_account_id = cogs.id
FROM accounts cogs
WHERE cogs.company_id=i.company_id
  AND cogs.system_role='COGS'
  AND i.item_type='stock-part'
  AND (
    i.cogs_account_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM accounts a WHERE a.id=i.cogs_account_id AND a.company_id=i.company_id AND a.type='Cost of Goods Sold'
    )
  );
--> statement-breakpoint

UPDATE items i
SET income_account_id = sales.id
FROM accounts sales
WHERE sales.company_id=i.company_id
  AND sales.system_role='SALES'
  AND i.item_type IN ('stock-part','service','non-stock-part','other-charge')
  AND (
    i.income_account_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM accounts a WHERE a.id=i.income_account_id AND a.company_id=i.company_id AND a.type IN ('Income','Other Income')
    )
  );
--> statement-breakpoint

UPDATE items i
SET cogs_account_id = purchases.id
FROM accounts purchases
WHERE purchases.company_id=i.company_id
  AND purchases.system_role='PURCHASES'
  AND i.item_type IN ('service','non-stock-part','other-charge')
  AND (
    i.cogs_account_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM accounts a WHERE a.id=i.cogs_account_id AND a.company_id=i.company_id AND a.type IN ('Cost of Goods Sold','Expense','Other Expense')
    )
  );
