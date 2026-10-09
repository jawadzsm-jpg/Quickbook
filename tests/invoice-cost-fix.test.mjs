import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { run } from "../scripts/fix-invoice-cost-of-sales.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const database = new PGlite();
for (const name of (await readdir(`${root}drizzle`)).filter((name) => name.endsWith(".sql")).sort()) {
  for (const statement of (await readFile(`${root}drizzle/${name}`, "utf8")).split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) await database.exec(statement);
}

// The script's Neon tagged-template client, backed by the in-memory database.
const query = (strings, values) => ({ text: strings.reduce((text, part, index) => text + (index ? `$${index}` : "") + part, ""), params: values });
const sql = (strings, ...values) => {
  const statement = query(strings, values);
  return { ...statement, then: (resolve, reject) => database.query(statement.text, statement.params).then((result) => result.rows).then(resolve, reject) };
};
sql.transaction = (statements) => database.transaction(async (tx) => { for (const statement of statements) await tx.query(statement.text, statement.params); });

test("invoice cost of sales is corrected to the purchase average with matching journal lines", async () => {
  const one = async (text, params) => (await database.query(text, params)).rows[0];
  const companyId = (await one("INSERT INTO companies (name) VALUES ('Cost fix') RETURNING id")).id;
  const locationId = (await one("INSERT INTO inventory_locations (company_id, code, name, invoice_prefix) VALUES ($1, 'FIX', 'Fix', 'FIX') RETURNING id", [companyId])).id;
  await database.query("INSERT INTO accounts (company_id, code, name, type, system_role) VALUES ($1, 'C1', 'Cost of Goods Sold', 'Cost of Goods Sold', 'COGS'), ($1, 'I1', 'Inventory Asset', 'Other Current Asset', 'INVENTORY')", [companyId]);
  const itemId = (await one("INSERT INTO items (company_id, location_id, sku, name, item_type, quantity, cost) VALUES ($1, $2, 'FC8C51', 'MSI VECTOR 16', 'stock-part', 99, 4220.5) RETURNING id", [companyId, locationId])).id;
  const billId = (await one("INSERT INTO transactions (company_id, location_id, type, number, party, transaction_date, status, total) VALUES ($1, $2, 'bill', 'BIL-0003', 'Supplier', '2026-10-09', 'open', 800000) RETURNING id", [companyId, locationId])).id;
  await database.query("INSERT INTO transaction_lines (transaction_id, item_id, description, quantity, unit_price) VALUES ($1, $2, 'MSI', 100, 8000)", [billId, itemId]);
  const invoiceId = (await one("INSERT INTO transactions (company_id, location_id, type, number, party, transaction_date, status, total) VALUES ($1, $2, 'invoice', 'INV-MSI', 'Customer', '2026-10-10', 'open', 10000) RETURNING id", [companyId, locationId])).id;
  await database.query("INSERT INTO transaction_lines (transaction_id, item_id, description, quantity, unit_price, unit_cost) VALUES ($1, $2, 'MSI', 1, 10000, 4220.5)", [invoiceId, itemId]);
  await database.query("INSERT INTO inventory_movements (item_id, transaction_id, movement_date, movement_type, quantity, unit_cost, reference) VALUES ($1, $2, '2026-10-10', 'invoice', -1, 4220.5, 'INV-MSI')", [itemId, invoiceId]);
  const entryId = (await one("INSERT INTO journal_entries (company_id, location_id, transaction_id, entry_date, reference) VALUES ($1, $2, $3, '2026-10-10', 'INV-MSI') RETURNING id", [companyId, locationId, invoiceId])).id;
  await database.query("INSERT INTO journal_lines (journal_entry_id, account_name, debit, credit) VALUES ($1, 'Accounts Receivable', 10000, 0), ($1, 'Sales Revenue', 0, 10000), ($1, 'Cost of Goods Sold', 4220.5, 0), ($1, 'Inventory Asset', 0, 4220.5)", [entryId]);
  // A sale dated before any purchase is left alone.
  const earlyId = (await one("INSERT INTO transactions (company_id, location_id, type, number, party, transaction_date, status, total) VALUES ($1, $2, 'invoice', 'INV-EARLY', 'Customer', '2026-10-01', 'open', 5000) RETURNING id", [companyId, locationId])).id;
  await database.query("INSERT INTO transaction_lines (transaction_id, item_id, description, quantity, unit_price, unit_cost) VALUES ($1, $2, 'MSI', 1, 5000, 4220.5)", [earlyId, itemId]);

  const quiet = () => {};
  const preview = await run(sql, { companyOption: String(companyId), log: quiet });
  assert.deepEqual(preview.fixable.map((entry) => entry.invoice.number), ["INV-MSI"]);
  assert.deepEqual(preview.noPurchase.map((line) => line.number), ["INV-EARLY"]);
  assert.equal(preview.applied, 0);
  assert.equal((await one("SELECT unit_cost FROM transaction_lines WHERE transaction_id = $1", [invoiceId])).unit_cost, 4220.5);

  const applied = await run(sql, { companyOption: String(companyId), apply: true, log: quiet });
  assert.equal(applied.applied, 1);
  assert.equal((await one("SELECT unit_cost FROM transaction_lines WHERE transaction_id = $1", [invoiceId])).unit_cost, 8000);
  assert.equal((await one("SELECT unit_cost FROM inventory_movements WHERE transaction_id = $1", [invoiceId])).unit_cost, 8000);
  const journal = (await database.query("SELECT account_name, debit, credit FROM journal_lines WHERE journal_entry_id = $1 ORDER BY id", [entryId])).rows;
  assert.deepEqual(journal.map((row) => [row.account_name, row.debit, row.credit]), [["Accounts Receivable", 10000, 0], ["Sales Revenue", 0, 10000], ["Cost of Goods Sold", 8000, 0], ["Inventory Asset", 0, 8000]]);
  assert.match((await one("SELECT details FROM audit_log WHERE entity_id = $1 AND entity_type = 'transaction'", [invoiceId])).details, /"oldHomeUnitCost":4220.5,"newHomeUnitCost":8000/);
  assert.equal((await one("SELECT unit_cost FROM transaction_lines WHERE transaction_id = $1", [earlyId])).unit_cost, 4220.5);

  const again = await run(sql, { companyOption: String(companyId), log: quiet });
  assert.equal(again.fixable.length, 0);
});
