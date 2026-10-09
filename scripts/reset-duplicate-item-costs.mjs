// Resets Cost and Last purchase price to 0 on items made with Duplicate item before duplicates started at cost 0.
// Those copies kept the source item's average cost, so their Avg. cost showed a price they were never bought at.
// Dry run by default; pass --apply to update.
//
//   node scripts/reset-duplicate-item-costs.mjs                          (dry run, all companies)
//   node scripts/reset-duplicate-item-costs.mjs --company comnet         (dry run; company name or id)
//   node scripts/reset-duplicate-item-costs.mjs --company 1 --apply
//
// Duplicates are found from the "duplicated" audit-log entries. An item that has any bill or item receipt line
// (any status) is kept: its cost may come from its own purchases. Posted invoices and journals are not changed.
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");
const sql = neon(process.env.DATABASE_URL);

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
const companyOption = option("company");
const apply = args.includes("--apply");

let companyId = null;
if (companyOption && /^\d+$/.test(companyOption)) companyId = Number(companyOption);
else if (companyOption) {
  const found = await sql`SELECT id, name FROM companies WHERE name ILIKE ${"%" + companyOption + "%"} ORDER BY id`;
  if (found.length !== 1) { console.log(`"${companyOption}" matches ${found.length} companies; pass --company <id>:`); for (const company of found) console.log(`  ${company.id}  ${company.name}`); process.exit(1); }
  companyId = found[0].id;
  console.log(`Company: ${found[0].name} (#${companyId})`);
}

const duplicates = await sql`
  SELECT i.id, i.company_id, c.name AS company, l.name AS location, i.item_number, i.sku, i.name, i.cost, i.last_purchase_price,
    EXISTS (SELECT 1 FROM transaction_lines tl JOIN transactions t ON t.id = tl.transaction_id
            WHERE tl.item_id = i.id AND t.type IN ('bill', 'item receipt')) AS purchased,
    (SELECT count(DISTINCT t.id) FROM transaction_lines tl JOIN transactions t ON t.id = tl.transaction_id
     WHERE tl.item_id = i.id AND t.type = 'invoice')::int AS invoices
  FROM items i
  JOIN companies c ON c.id = i.company_id
  JOIN inventory_locations l ON l.id = i.location_id
  WHERE EXISTS (SELECT 1 FROM audit_log a WHERE a.entity_type = 'item' AND a.action = 'duplicated' AND a.entity_id = i.id AND a.company_id = i.company_id)
    AND (${companyId}::int IS NULL OR i.company_id = ${companyId}::int)
  ORDER BY i.company_id, i.id`;

const resettable = duplicates.filter((item) => !item.purchased && (Number(item.cost) !== 0 || Number(item.last_purchase_price) !== 0));
const purchased = duplicates.filter((item) => item.purchased);
const line = (item) => `#${item.id}  ${item.item_number ?? ""}  ${item.sku}  ${item.name}  cost ${Number(item.cost).toFixed(2)}  [${item.company} · ${item.location}]`;

console.log(`\nWILL RESET TO 0: ${resettable.length} duplicated items with no bills or item receipts`);
for (const item of resettable) console.log(`  ${line(item)}${item.invoices ? `  (on ${item.invoices} invoice(s); their posted cost of sales is not changed)` : ""}`);
console.log(`\nKEPT, has its own bills or item receipts: ${purchased.length}`);
for (const item of purchased) console.log(`  ${line(item)}`);
console.log(`\n${duplicates.length - resettable.length - purchased.length} duplicated items already have cost 0.`);

if (!apply) { console.log("\nDry run only. Re-run with --apply to reset the items listed above."); process.exit(0); }
if (!resettable.length) process.exit(0);

const ids = resettable.map((item) => item.id);
const [updated] = await sql.transaction([
  sql`WITH reset AS (
        SELECT i.id, i.company_id, i.sku, i.cost, i.last_purchase_price FROM items i
        WHERE i.id = ANY(${ids}::int[])
          AND NOT EXISTS (SELECT 1 FROM transaction_lines tl JOIN transactions t ON t.id = tl.transaction_id
                          WHERE tl.item_id = i.id AND t.type IN ('bill', 'item receipt'))
        FOR UPDATE),
      changed AS (
        UPDATE items i SET cost = 0, last_purchase_price = 0 FROM reset r WHERE i.id = r.id
        RETURNING r.id, r.company_id, r.sku, r.cost, r.last_purchase_price)
      INSERT INTO audit_log (company_id, action, entity_type, entity_id, details)
      SELECT company_id, 'updated', 'item', id,
        sku || ' duplicate cost reset to 0 (was cost ' || cost || ', last purchase price ' || last_purchase_price || ') by reset-duplicate-item-costs script'
      FROM changed
      RETURNING entity_id`,
]);
console.log(`\nReset ${updated.length} items to cost 0.`);
