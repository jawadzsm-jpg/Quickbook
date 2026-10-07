// Removes the items created by an Inventory Import (Excel/CSV), matched by name the same way the
// app's unique-name check does. Dry run by default; pass --apply to delete.
//
//   node scripts/remove-imported-items.mjs --file ~/Downloads/import.csv              (list companies with matches)
//   node scripts/remove-imported-items.mjs --file import.csv --company comnet [--location 2]  (dry run; company name or id)
//   node scripts/remove-imported-items.mjs --file import.csv --company 1 [--location 2] --apply
//
// Only items whose saved details still equal the file row are removed, so an older item with the same name stays.
// Items already used on a document, stock movement, inventory check or packing list are never deleted.
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

config({ path: ".env.local" });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");
const sql = neon(process.env.DATABASE_URL);

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
const file = option("file");
const companyOption = option("company");
const locationId = option("location") ? Number(option("location")) : undefined;
const apply = args.includes("--apply");
if (!file) throw new Error("Pass --file <path to the imported .csv>");

const normalize = (value) => String(value ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

function parseCsv(text) {
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((cells) => cells.some((value) => value.trim()));
}

const [header, ...body] = parseCsv(readFileSync(file, "utf8").replace(/^﻿/, ""));
const column = (...aliases) => header.findIndex((cell) => aliases.includes(normalize(cell)));
const nameColumn = column("name", "item", "itemname", "product", "productname", "itemdescription", "description");
if (nameColumn < 0) throw new Error("The file has no Name column.");
const columns = {
  sku: column("sku"), itemNumber: column("itemno", "itemnumber", "itemcode"), category: column("category"),
  quantity: column("qty", "quantity", "onhand", "stock", "openingqty", "openingquantity"), reorderPoint: column("reorder", "reorderpoint", "reorderlevel"),
  salesPrice: column("salesprice", "price", "sellingprice", "saleprice"), cost: column("cost", "avgcost", "averagecost", "unitcost", "purchaseprice"),
  status: column("status"), itemType: column("type", "itemtype"),
};
const known = new Set([nameColumn, ...Object.values(columns)]);
const upper = (value) => String(value ?? "").normalize("NFKC").trim().toLocaleUpperCase("en");
const number = (value) => { const cleaned = String(value ?? "").replace(/[^0-9.-]/g, ""); return cleaned && /\d/.test(cleaned) ? Number(cleaned) : 0; };
const cell = (cells, index) => (index >= 0 ? String(cells[index] ?? "").trim() : "");

// What the import saved for each row (same rules as lib/item-import.ts + POST /api/records). Only the first
// row with a given name could be created; later rows with the same name were rejected as duplicates.
const expected = new Map();
for (const cells of body) {
  const key = normalize(cell(cells, nameColumn));
  if (!key || expected.has(key)) continue;
  const type = cell(cells, columns.itemType);
  const stock = !type || !/service|non/i.test(type);
  expected.set(key, {
    category: upper(cell(cells, columns.category)) || "GENERAL",
    quantity: stock ? number(cell(cells, columns.quantity)) : 0, reorderPoint: stock ? number(cell(cells, columns.reorderPoint)) : 0,
    salesPrice: number(cell(cells, columns.salesPrice)), cost: number(cell(cells, columns.cost)),
    specifications: JSON.stringify(header.map((label, index) => ({ label: label.trim(), value: upper(cell(cells, index)) }))
      .filter((specification, index) => !known.has(index) && specification.label && specification.value).slice(0, 30)),
  });
}
console.log(`${expected.size} distinct item names in ${file}`);

let companyId;
if (companyOption && /^\d+$/.test(companyOption)) companyId = Number(companyOption);
else if (companyOption) {
  const found = await sql`SELECT id, name FROM companies WHERE name ILIKE ${"%" + companyOption + "%"} ORDER BY id`;
  if (found.length !== 1) { console.log(`"${companyOption}" matches ${found.length} companies; pass --company <id>:`); for (const company of found) console.log(`  ${company.id}  ${company.name}`); process.exit(1); }
  companyId = found[0].id;
  console.log(`Company: ${found[0].name} (#${companyId})`);
}

if (!companyId) {
  const all = await sql`SELECT c.id, c.name, i.name AS item_name FROM items i JOIN companies c ON c.id = i.company_id`;
  const counts = new Map();
  for (const item of all) if (expected.has(normalize(item.item_name))) counts.set(item.id, { name: item.name, matches: (counts.get(item.id)?.matches ?? 0) + 1 });
  console.log("Companies with matching names (re-run with --company <id>):");
  for (const [id, entry] of counts) console.log(`  ${id}  ${entry.name}: ${entry.matches} matches`);
  process.exit(0);
}

const candidates = await sql`
  SELECT i.id, i.name, i.sku, i.item_number, i.category, i.quantity, i.reorder_point, i.sales_price, i.cost, i.specifications, l.name AS location,
    EXISTS (SELECT 1 FROM transaction_lines t WHERE t.item_id = i.id)
    OR EXISTS (SELECT 1 FROM inventory_movements m WHERE m.item_id = i.id)
    OR EXISTS (SELECT 1 FROM inventory_check_lines c WHERE c.item_id = i.id)
    OR EXISTS (SELECT 1 FROM packing_list_lines p WHERE p.item_id = i.id) AS used
  FROM items i JOIN inventory_locations l ON l.id = i.location_id
  WHERE i.company_id = ${companyId} AND (${locationId ?? null}::int IS NULL OR i.location_id = ${locationId ?? null}::int)
  ORDER BY i.id`;
const same = (a, b) => Math.abs(Number(a) - Number(b)) < 0.000001;
const differences = (item, row) => [
  item.category !== row.category && "category", !same(item.quantity, row.quantity) && "quantity", !same(item.reorder_point, row.reorderPoint) && "reorder point",
  !same(item.sales_price, row.salesPrice) && "sales price", !same(item.cost, row.cost) && "cost", item.specifications !== row.specifications && "specifications",
].filter(Boolean);
const named = candidates.filter((item) => expected.has(normalize(item.name))).map((item) => ({ ...item, differences: differences(item, expected.get(normalize(item.name))) }));
const removable = named.filter((item) => !item.used && !item.differences.length);
const used = named.filter((item) => item.used);
const different = named.filter((item) => !item.used && item.differences.length);
const line = (item) => `#${item.id}  ${item.item_number ?? ""}  ${item.sku}  ${item.name}  qty ${item.quantity}  [${item.location}]`;

console.log(`\nWILL DELETE: ${removable.length} items created by this import and never used`);
for (const item of removable) console.log(`  ${line(item)}`);
console.log(`\nKEPT, used on documents or stock movements: ${used.length}`);
for (const item of used) console.log(`  ${line(item)}`);
console.log(`\nKEPT, same name but different details (existed before the import, or edited since): ${different.length}`);
for (const item of different) console.log(`  ${line(item)}  differs in: ${item.differences.join(", ")}`);
console.log(`\n${expected.size - new Set(named.map((item) => normalize(item.name))).size} names in the file were not found in this company${locationId ? "/inventory" : ""}.`);

if (!apply) { console.log("\nDry run only. Re-run with --apply to delete the removable items."); process.exit(0); }
if (!removable.length) process.exit(0);

const ids = removable.map((item) => item.id);
const details = JSON.stringify({ actorName: "remove-imported-items script", source: file });
const [deleted] = await sql.transaction([
  sql`WITH gone AS (
        DELETE FROM items i WHERE i.company_id = ${companyId} AND i.id = ANY(${ids}::int[])
          AND NOT EXISTS (SELECT 1 FROM transaction_lines t WHERE t.item_id = i.id)
          AND NOT EXISTS (SELECT 1 FROM inventory_movements m WHERE m.item_id = i.id)
          AND NOT EXISTS (SELECT 1 FROM inventory_check_lines c WHERE c.item_id = i.id)
          AND NOT EXISTS (SELECT 1 FROM packing_list_lines p WHERE p.item_id = i.id)
        RETURNING i.id, i.name, i.sku)
      INSERT INTO audit_log (company_id, action, entity_type, entity_id, details)
      SELECT ${companyId}, 'deleted', 'item', id, (jsonb_build_object('name', name, 'sku', sku) || ${details}::jsonb)::text FROM gone
      RETURNING entity_id`,
]);
console.log(`\nDeleted ${deleted.length} items.`);
