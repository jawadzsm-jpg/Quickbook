import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");
const sql = neon(process.env.DATABASE_URL);

await sql.query(`WITH company AS (
  INSERT INTO companies (name, base_currency) VALUES ('ComNet International', 'AED')
  ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id
)
INSERT INTO inventory_locations (company_id, name, code, invoice_prefix)
SELECT id, 'Main Inventory', 'MAIN', 'MAIN' FROM company
ON CONFLICT (company_id, code) DO NOTHING`, []);

await sql.query(`WITH company AS (SELECT id FROM companies WHERE name = 'ComNet International')
INSERT INTO accounts (company_id, code, name, type, balance, active)
SELECT company.id, seed.code, seed.name, seed.type, 0, true FROM company CROSS JOIN (VALUES
  ('1000', 'Business Bank', 'Bank'),
  ('1100', 'Accounts Receivable', 'Accounts Receivable'),
  ('1200', 'Inventory Asset', 'Current Asset'),
  ('1300', 'Recoverable VAT', 'Current Asset'),
  ('2000', 'Accounts Payable', 'Accounts Payable'),
  ('2100', 'VAT Payable', 'Current Liability'),
  ('3000', 'Opening Balance Equity', 'Equity'),
  ('4000', 'Sales Revenue', 'Income'),
  ('4100', 'Other Income', 'Income'),
  ('5000', 'Cost of Goods Sold', 'Cost of Goods Sold'),
  ('6000', 'Purchases', 'Expense'),
  ('6100', 'Operating Expenses', 'Expense'),
  ('6200', 'Payroll Expense', 'Expense'),
  ('9999', 'Suspense', 'Other Current Asset')
) AS seed(code, name, type)
ON CONFLICT (company_id, code) DO NOTHING`, []);
console.log("Seeded 14 standard accounts.");
