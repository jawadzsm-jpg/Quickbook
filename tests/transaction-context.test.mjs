import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const database = new PGlite();
globalThis.__comnetPg = database;
globalThis.__comnetPoolClosed = 0;
const previousUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
const vite = await createServer({
  appType: "custom", configFile: false, root,
  ssr: { noExternal: ["@neondatabase/serverless", "drizzle-orm"] },
  resolve: { alias: { "@": root, "@neondatabase/serverless": "\0test-neon", "drizzle-orm/neon-http": "\0test-driver", "drizzle-orm/neon-serverless": "\0test-driver" } }, server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: ["**/.next/**"] } },
  plugins: [{
    name: "embedded-postgres", enforce: "pre",
    transform(code, id) {
      if (id.endsWith("/db/index.ts")) return code.replaceAll('"@neondatabase/serverless"', '"/__test-neon.js"').replaceAll('"drizzle-orm/neon-http"', '"/__test-driver.js"').replaceAll('"drizzle-orm/neon-serverless"', '"/__test-driver.js"');
    },
    resolveId(id) {
      if (id === "/__test-neon.js") return "\0test-neon";
      if (id === "/__test-driver.js") return "\0test-driver";
      if (id === "@neondatabase/serverless") return "\0test-neon";
      if (["drizzle-orm/neon-http", "drizzle-orm/neon-serverless"].includes(id)) return "\0test-driver";
      if (/\/lib\/auth(?:\.ts)?$/.test(id)) return "\0test-auth";
      if (id === "server-only") return "\0server-only";
    },
    load(id) {
      if (id === "\0server-only") return "export {}";
      if (id === "\0test-neon") return `export const neon = () => ({}); export const neonConfig = {}; export class Pool { async end() { globalThis.__comnetPoolClosed++; } }`;
      if (id === "\0test-driver") return `import { drizzle as pg } from "drizzle-orm/pglite"; export const drizzle = (client, config) => pg(globalThis.__comnetPg, config);`;
      if (id === "\0test-auth") return `
        export * from "/lib/access.ts";
        export * from "/lib/password.ts";
        export const requireCompanyAccess = async () => ({ id: 1, email: "test@example.test", role: "all_admin", companyIds: [], mustChangePassword: false });
        export const requireApiUser = async () => (globalThis.__transferTestUser ?? { id: 1, email: "test@example.test", role: "all_admin", companyIds: [], mustChangePassword: false });
      `;
    },
  }],
});
after(async () => {
  await vite.close(); await database.close();
  delete globalThis.__comnetPg; delete globalThis.__comnetPoolClosed;
  if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
});

const { getDb, withWriteTransaction } = await vite.ssrLoadModule("/db/index.ts");
const { sql } = await import("drizzle-orm");

// Apply the actual migration chain to an isolated in-memory PostgreSQL engine.
for (const name of (await readdir(`${root}drizzle`)).filter((name) => name.endsWith(".sql")).sort()) {
  for (const statement of (await readFile(`${root}drizzle/${name}`, "utf8")).split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
    try { await database.exec(statement); } catch (error) { throw new Error(`Migration ${name} failed`, { cause: error }); }
  }
}

test("transfer edits enforce admin and company access, balance quantities and reject stale or insufficient stock", async () => {
  const company = (await database.query("INSERT INTO companies (name) VALUES ('Transfer edit test') RETURNING id")).rows[0].id;
  const other = (await database.query("INSERT INTO companies (name) VALUES ('Transfer destination') RETURNING id")).rows[0].id;
  const location = async (companyId, code) => (await database.query("INSERT INTO inventory_locations (company_id, code, name, invoice_prefix) VALUES ($1, $2, $2, $2) RETURNING id", [companyId, code])).rows[0].id;
  const source = await location(company, 'EDIT-SOURCE'), destination = await location(other, 'EDIT-DEST');
  await database.query("INSERT INTO items (company_id, location_id, sku, name, quantity, cost) VALUES ($1, $2, 'TRANSFER-EDIT', 'Laptop', 7, 10), ($3, $4, 'TRANSFER-EDIT', 'Laptop', 3, 10)", [company, source, other, destination]);
  const id = (await database.query("INSERT INTO stock_transfers (reference, source_company_id, source_location_id, destination_company_id, destination_location_id, sku, item_name, quantity, transfer_date) VALUES ('TRF-EDIT', $1, $2, $3, $4, 'TRANSFER-EDIT', 'Laptop', 3, '2026-09-11') RETURNING id", [company, source, other, destination])).rows[0].id;
  const { PATCH, GET, DELETE } = await vite.ssrLoadModule('/app/api/transfers/route.ts');
  const original = { quantity: 3, reference: 'TRF-EDIT', transferDate: '2026-09-11', salesman: '', notes: '' };
  const remove = (expected = original, transferId = id) => DELETE(new Request('https://app.test/api/transfers', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: transferId, expected }) }));
  const edit = (changes = {}, expected = original) => PATCH(new Request('https://app.test/api/transfers', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, ...original, ...changes, expected }) }));
  const balances = async () => (await database.query("SELECT quantity, cost FROM items WHERE sku = 'TRANSFER-EDIT' ORDER BY id")).rows;
  try {
    for (const role of ['viewer', 'sales', 'accountant', 'purchasing', 'inventory']) {
      globalThis.__transferTestUser = { id: 1, role, companyIds: [company, other] };
      assert.equal((await edit({ quantity: 5 })).status, 403);
      assert.equal((await remove()).status, 403);
      const history = await (await GET(new Request('https://app.test/api/transfers'))).json();
      assert.equal(history.records.find((r) => r.id === id).canEdit, false);
    }
    globalThis.__transferTestUser = { id: 1, role: 'admin', companyIds: [company] };
    assert.equal((await edit()).status, 403);
    assert.equal((await remove()).status, 403);
    globalThis.__transferTestUser = { id: 1, role: 'admin', companyIds: [company, other] };
    const history = await (await GET(new Request('https://app.test/api/transfers'))).json();
    assert.equal(history.records.find((r) => r.id === id).canEdit, true);
    assert.equal((await edit({ quantity: 5 })).status, 200);
    assert.deepEqual(await balances(), [{ quantity: 5, cost: 10 }, { quantity: 5, cost: 10 }]);
    assert.equal((await edit({ quantity: 4 })).status, 409);
    globalThis.__transferTestUser = { id: 1, role: 'all_admin', companyIds: [] };
    assert.equal((await edit({ quantity: 11 }, { ...original, quantity: 5 })).status, 409);
    assert.equal((await edit({ quantity: 2, notes: 'Corrected', salesman: 'Rep' }, { ...original, quantity: 5 })).status, 200);
    assert.deepEqual(await balances(), [{ quantity: 8, cost: 10 }, { quantity: 2, cost: 10 }]);
    const corrected = { ...original, quantity: 2, notes: 'Corrected', salesman: 'Rep' };
    assert.equal((await edit({ quantity: 0 }, corrected)).status, 400);
    assert.equal((await edit({ transferDate: '2026-02-30' }, corrected)).status, 400);
    await database.query("UPDATE items SET quantity = 0 WHERE sku = 'TRANSFER-EDIT' AND location_id = $1", [destination]);
    assert.equal((await edit({ quantity: 1 }, corrected)).status, 409);
    assert.deepEqual(await balances(), [{ quantity: 8, cost: 10 }, { quantity: 0, cost: 10 }]);
    assert.equal((await database.query("SELECT count(*)::int AS n FROM audit_log WHERE entity_type = 'stock_transfer' AND entity_id = $1", [id])).rows[0].n, 2);
    assert.equal((await database.query('SELECT notes FROM stock_transfers WHERE id = $1', [id])).rows[0].notes, 'Corrected');
    assert.equal((await remove(original)).status, 409);
    assert.equal((await remove(corrected)).status, 409);
    assert.deepEqual(await balances(), [{ quantity: 8, cost: 10 }, { quantity: 0, cost: 10 }]);
    await database.query("UPDATE items SET quantity = 2 WHERE sku = 'TRANSFER-EDIT' AND location_id = $1", [destination]);
    // A failure after the inventory updates must roll back the whole deletion.
    await database.exec("CREATE FUNCTION reject_transfer_delete_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'deleted' AND NEW.entity_type = 'stock_transfer' THEN RAISE EXCEPTION 'Test audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_transfer_delete_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_transfer_delete_audit()");
    assert.equal((await remove(corrected)).status, 500);
    assert.deepEqual(await balances(), [{ quantity: 8, cost: 10 }, { quantity: 2, cost: 10 }]);
    assert.equal((await database.query('SELECT id FROM stock_transfers WHERE id = $1', [id])).rows.length, 1);
    await database.exec('DROP TRIGGER reject_transfer_delete_audit ON audit_log; DROP FUNCTION reject_transfer_delete_audit()');
    assert.equal((await remove(corrected)).status, 200);
    assert.deepEqual(await balances(), [{ quantity: 10, cost: 10 }, { quantity: 0, cost: 10 }]);
    assert.equal((await remove(corrected)).status, 404);
    assert.deepEqual(await balances(), [{ quantity: 10, cost: 10 }, { quantity: 0, cost: 10 }]);
    const audit = (await database.query("SELECT details FROM audit_log WHERE entity_type = 'stock_transfer' AND entity_id = $1 AND action = 'deleted'", [id])).rows;
    assert.equal(audit.length, 1);
    assert.equal(JSON.parse(audit[0].details).before.quantity, 2);
    // A scoped company administrator can also delete, without affecting sibling lines.
    const copy = async () => (await database.query("INSERT INTO stock_transfers (reference, source_company_id, source_location_id, destination_company_id, destination_location_id, sku, item_name, quantity, transfer_date) VALUES ('TRF-EDIT', $1, $2, $3, $4, 'TRANSFER-EDIT', 'Laptop', 3, '2026-09-11') RETURNING id", [company, source, other, destination])).rows[0].id;
    const adminLine = await copy(), sibling = await copy();
    await database.query("UPDATE items SET quantity = CASE WHEN location_id = $1 THEN 4 ELSE 6 END WHERE sku = 'TRANSFER-EDIT'", [source]);
    globalThis.__transferTestUser = { id: 1, role: 'admin', companyIds: [company, other] };
    assert.equal((await remove(original, adminLine)).status, 200);
    assert.deepEqual(await balances(), [{ quantity: 7, cost: 10 }, { quantity: 3, cost: 10 }]);
    assert.equal((await database.query('SELECT id FROM stock_transfers WHERE id = $1', [sibling])).rows.length, 1);
  } finally { delete globalThis.__transferTestUser; }
});

test("all migrations apply to a fresh PostgreSQL database", async () => {
  const result = await database.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'");
  assert.ok(result.rows[0].count >= 20);
});

test("documents reject stock from another inventory or company before posting", async () => {
  const company = (await database.query("INSERT INTO companies (name) VALUES ('Inventory test') RETURNING id")).rows[0].id;
  const otherCompany = (await database.query("INSERT INTO companies (name) VALUES ('Other inventory test') RETURNING id")).rows[0].id;
  const location = async (companyId, code) => (await database.query("INSERT INTO inventory_locations (company_id, code, name, invoice_prefix) VALUES ($1, $2, $2, $2) RETURNING id", [companyId, code])).rows[0].id;
  const first = await location(company, "FIRST");
  const second = await location(company, "SECOND");
  const foreign = await location(otherCompany, "FOREIGN");
  const item = async (companyId, locationId, sku) => (await database.query("INSERT INTO items (company_id, location_id, sku, name, quantity) VALUES ($1, $2, $3, $3, 10) RETURNING id", [companyId, locationId, sku])).rows[0].id;
  const wrongInventoryItem = await item(company, second, "SECOND-ITEM");
  const foreignItem = await item(otherCompany, foreign, "FOREIGN-ITEM");
  const { POST } = await vite.ssrLoadModule("/app/api/records/route.ts");
  for (const type of ["bill", "invoice", "estimate", "sales order", "quotation"]) {
    for (const itemId of [wrongInventoryItem, foreignItem]) {
      const response = await POST(new Request("https://app.test/api/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "transactions", type, companyId: company, locationId: first, party: "Test party", lines: [{ itemId, description: "Stock", quantity: 1, unitPrice: 10 }] }) }));
      assert.equal(response.status, 400, `${type}: ${await response.text()}`);
    }
  }
  assert.equal((await database.query("SELECT count(*)::int AS count FROM transactions WHERE company_id = $1", [company])).rows[0].count, 0);
  assert.deepEqual((await database.query("SELECT quantity FROM items WHERE id IN ($1, $2) ORDER BY id", [wrongInventoryItem, foreignItem])).rows, [{ quantity: 10 }, { quantity: 10 }]);
});

test("write transaction rolls back thrown errors and rejected responses, and closes connections", async () => {
  await database.exec("CREATE TABLE rollback_probe (id integer PRIMARY KEY)");
  const closed = globalThis.__comnetPoolClosed;
  await assert.rejects(withWriteTransaction(async () => {
    await getDb().execute(sql`INSERT INTO rollback_probe VALUES (1)`);
    throw new Error("forced failure");
  }), /forced failure/);
  assert.equal((await database.query("SELECT * FROM rollback_probe")).rows.length, 0);
  const response = await withWriteTransaction(async () => {
    await getDb().execute(sql`INSERT INTO rollback_probe VALUES (2)`);
    return Response.json({ error: "invalid" }, { status: 409 });
  });
  assert.equal(response.status, 409);
  assert.equal((await database.query("SELECT * FROM rollback_probe")).rows.length, 0);
  await withWriteTransaction(async () => {
    await getDb().execute(sql`INSERT INTO rollback_probe VALUES (3)`);
    return Response.json({ ok: true });
  });
  assert.deepEqual((await database.query("SELECT * FROM rollback_probe")).rows, [{ id: 3 }]);
  assert.equal(globalThis.__comnetPoolClosed - closed, 3);
});

test("list edits preserve financial fields and rename linked records within the company", async () => {
  const company = (await database.query("INSERT INTO companies (name) VALUES ('List edit test') RETURNING id")).rows[0].id;
  const account = (await database.query("INSERT INTO accounts (company_id, code, name, type, currency, balance) VALUES ($1, 'EDIT1', 'Edit account', 'Bank', 'AED', 125) RETURNING id", [company])).rows[0].id;
  const contact = (await database.query("INSERT INTO contacts (company_id, type, name, currency, balance) VALUES ($1, 'customer', 'Edit customer', 'AED', 50) RETURNING id", [company])).rows[0].id;
  const { PATCH } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const edit = (payload) => PATCH(new Request('https://app.test/api/records', {method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({companyId:company,...payload})}));
  const result = await edit({kind:'accounts',id:account,name:'Updated bank',code:'EDIT2',balance:999,currency:'USD',systemRole:'AR'});
  assert.equal(result.status,200,await result.text());
  assert.deepEqual((await database.query('SELECT name, code, balance, currency FROM accounts WHERE id = $1',[account])).rows,[{name:'Updated bank',code:'EDIT2',balance:125,currency:'AED'}]);
  const customer = await edit({kind:'contacts',id:contact,name:'Updated customer',phone:'123',balance:999,currency:'USD',type:'vendor'});
  assert.equal(customer.status,200,await customer.text());
  assert.deepEqual((await database.query('SELECT name, phone, type, balance, currency FROM contacts WHERE id = $1',[contact])).rows,[{name:'Updated customer',phone:'123',type:'customer',balance:50,currency:'AED'}]);
  const other = (await database.query("INSERT INTO companies (name) VALUES ('Other edit company') RETURNING id")).rows[0].id;
  const foreign = await edit({kind:'accounts',companyId:other,id:account,name:'Wrong company',code:'EDIT3'});
  assert.equal(foreign.status,404);
});

test("stock revaluation balances journals, preserves quantity and rejects stale batches", async () => {
  const company = (await database.query("INSERT INTO companies (name) VALUES ('Revaluation test') RETURNING id")).rows[0].id;
  const location = (await database.query("INSERT INTO inventory_locations (company_id, code, name, invoice_prefix) VALUES ($1, 'REV', 'Revaluation inventory', 'REV') RETURNING id", [company])).rows[0].id;
  await database.query("INSERT INTO accounts (company_id, code, name, type, currency, system_role, balance) VALUES ($1, 'REV-ASSET', 'Revaluation inventory asset', 'Other Current Asset', 'AED', 'INVENTORY', 100)", [company]);
  const item = (await database.query("INSERT INTO items (company_id, location_id, sku, name, quantity, cost, sales_price) VALUES ($1, $2, 'REVALUE', 'Revalue item', 10, 10, 15) RETURNING id", [company, location])).rows[0].id;
  const { POST } = await vite.ssrLoadModule('/app/api/stock-revaluation/route.ts');
  const post = (records) => POST(new Request('https://app.test/api/stock-revaluation', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({records}) }));
  const result = await post([{id:item,cost:12,salesPrice:18,expectedCost:10,expectedPrice:15,expectedQuantity:10}]);
  assert.equal(result.status,200,await result.text());
  assert.deepEqual((await database.query('SELECT quantity, cost, sales_price FROM items WHERE id = $1',[item])).rows,[{quantity:10,cost:12,sales_price:18}]);
  const journals = await database.query('SELECT sum(debit) AS debit, sum(credit) AS credit FROM journal_lines l JOIN journal_entries e ON e.id = l.journal_entry_id WHERE e.company_id = $1',[company]);
  assert.deepEqual(journals.rows,[{debit:20,credit:20}]);
  const stale = await post([{id:item,cost:20,salesPrice:25,expectedCost:10,expectedPrice:15,expectedQuantity:10}]);
  assert.equal(stale.status,409);
  const secondItem = (await database.query("INSERT INTO items (company_id, location_id, sku, name, quantity, cost, sales_price) VALUES ($1, $2, 'REVALUE-2', 'Second item', 1, 5, 8) RETURNING id", [company, location])).rows[0].id;
  const batch = await post([{id:item,cost:14,salesPrice:20,expectedCost:12,expectedPrice:18,expectedQuantity:10}, {id:secondItem,cost:6,salesPrice:9,expectedCost:4,expectedPrice:8,expectedQuantity:1}]);
  assert.equal(batch.status,409);
  assert.deepEqual((await database.query('SELECT cost, sales_price FROM items WHERE id = $1',[item])).rows,[{cost:12,sales_price:18}]);
  const priceOnly = await post([{id:item,cost:12,salesPrice:19,expectedCost:12,expectedPrice:18,expectedQuantity:10}]);
  assert.equal(priceOnly.status,200,await priceOnly.text());
  assert.equal((await database.query('SELECT count(*)::int AS count FROM journal_entries WHERE company_id = $1',[company])).rows[0].count,1);
  const foreignPurchaseItem = (await database.query("INSERT INTO items (company_id, location_id, sku, name, quantity, cost) VALUES ($1, $2, 'FX-PURCHASE', 'Foreign purchase', 0, 0) RETURNING id", [company, location])).rows[0].id;
  const recordsRoute = await vite.ssrLoadModule('/app/api/records/route.ts');
  const purchase = await recordsRoute.POST(new Request('https://app.test/api/records', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({kind:'transactions',type:'bill',companyId:company,locationId:location,party:'USD Vendor',currency:'USD',exchangeRate:3.6725,lines:[{itemId:foreignPurchaseItem,quantity:2,unitPrice:100,unitCost:100,vatCode:'ZERO'}]}) }));
  assert.equal(purchase.status,201,await purchase.text());
  assert.deepEqual((await database.query('SELECT quantity, last_purchase_price FROM items WHERE id = $1',[foreignPurchaseItem])).rows,[{quantity:2,last_purchase_price:367.25}]);
});
