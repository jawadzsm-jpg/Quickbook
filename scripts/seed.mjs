import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");
const sql = neon(process.env.DATABASE_URL);

await sql.query(`INSERT INTO accounts (code, name, type, balance, active) VALUES
  ('1000', 'Business Bank', 'Bank', 0, true),
  ('1100', 'Accounts Receivable', 'Accounts Receivable', 0, true),
  ('1200', 'Inventory Asset', 'Current Asset', 0, true),
  ('1300', 'Recoverable VAT', 'Current Asset', 0, true),
  ('2000', 'Accounts Payable', 'Accounts Payable', 0, true),
  ('2100', 'VAT Payable', 'Current Liability', 0, true),
  ('3000', 'Opening Balance Equity', 'Equity', 0, true),
  ('4000', 'Sales Revenue', 'Income', 0, true),
  ('4100', 'Other Income', 'Income', 0, true),
  ('5000', 'Cost of Goods Sold', 'Cost of Goods Sold', 0, true),
  ('6000', 'Purchases', 'Expense', 0, true),
  ('6100', 'Operating Expenses', 'Expense', 0, true),
  ('6200', 'Payroll Expense', 'Expense', 0, true),
  ('9999', 'Suspense', 'Other Current Asset', 0, true)
  ON CONFLICT (code) DO NOTHING`, []);
console.log("Seeded 14 standard accounts.");
