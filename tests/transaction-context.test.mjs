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

test('vendor changes and deletion are administrator-only, scoped and audited', async () => {
  const company = (await database.query("INSERT INTO companies (name) VALUES ('Vendor permissions') RETURNING id")).rows[0].id;
  const vendor = (await database.query("INSERT INTO contacts (company_id, type, name, currency, balance) VALUES ($1, 'vendor', 'Audit vendor', 'AED', 0) RETURNING id", [company])).rows[0].id;
  const { PATCH, DELETE, GET } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const request = (method, payload={}) => new Request('https://app.test/api/records', {method,headers:{'content-type':'application/json'},body:JSON.stringify({kind:'contacts',id:vendor,companyId:company,...payload})});
  const history = () => GET(new Request(`https://app.test/api/records?kind=vendor-history&companyId=${company}`));
  try {
    for (const role of ['accountant','purchasing','viewer']) {
      globalThis.__transferTestUser = { id: 9, fullName: 'Not an admin', email: 'other@example.test', role, companyIds: [company] };
      assert.equal((await PATCH(request('PATCH',{name:'Blocked',type:'customer'}))).status,403);
      assert.equal((await DELETE(request('DELETE'))).status,403);
      assert.equal((await history()).status,403);
    }
    globalThis.__transferTestUser = { id: 10, fullName: 'Company Admin', email: 'admin@example.test', role:'admin',companyIds:[] };
    assert.equal((await PATCH(request('PATCH',{name:'Blocked'}))).status,403);
    assert.equal((await DELETE(request('DELETE'))).status,403);
    assert.equal((await history()).status,403);
    globalThis.__transferTestUser.companyIds=[company];
    const changed=await PATCH(request('PATCH',{name:'Renamed vendor',phone:'123'}));
    assert.equal(changed.status,200,await changed.text());
    let entries=(await (await history()).json()).history;
    assert.equal(entries.length,1);
    const details=JSON.parse(entries[0].details);
    assert.equal(details.actorName,'Company Admin');
    assert.equal(details.actorId,10);
    assert.ok(details.changes.some(c=>c.field==='phone'&&c.after==='123'));
    await database.query('UPDATE contacts SET balance=10 WHERE id=$1',[vendor]);
    assert.equal((await DELETE(request('DELETE'))).status,409);
    await database.query('UPDATE contacts SET balance=0 WHERE id=$1',[vendor]);
    globalThis.__transferTestUser = { id: 11, fullName: 'All Admin', email:'all@example.test',role:'all_admin',companyIds:[] };
    assert.equal((await DELETE(request('DELETE'))).status,200);
    assert.equal((await database.query('SELECT id FROM contacts WHERE id=$1',[vendor])).rows.length,0);
    entries=(await (await history()).json()).history;
    assert.equal(entries[0].action,'deleted');
    assert.equal(JSON.parse(entries[0].details).actorName,'All Admin');
    assert.equal(entries.length,2);
  } finally { delete globalThis.__transferTestUser; }
});

test('purchase edits preserve identity, repost stock and ledger atomically, and enforce admin access and revisions', async () => {
  const companyId = (await database.query("INSERT INTO companies (name) VALUES ('Purchase edit test') RETURNING id")).rows[0].id;
  const locationId = (await database.query("INSERT INTO inventory_locations (company_id, code, name, invoice_prefix) VALUES ($1, 'PUR-EDIT', 'Purchase stock', 'PUR-EDIT') RETURNING id", [companyId])).rows[0].id;
  const itemId = (await database.query("INSERT INTO items (company_id, location_id, sku, name, quantity, cost) VALUES ($1, $2, 'PUR-EDIT', 'Laptop', 0, 50) RETURNING id", [companyId, locationId])).rows[0].id;
  await database.query("INSERT INTO contacts (company_id, type, name) VALUES ($1, 'vendor', 'Original supplier'), ($1, 'vendor', 'New supplier')", [companyId]);
  const { GET, POST, PATCH } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const request = (method, body) => new Request('https://app.test/api/records', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const initial = { kind: 'transactions', companyId, locationId, type: 'bill', number: 'EDIT-BILL', party: 'Original supplier', transactionDate: '2026-09-10', account: 'Purchases', status: 'open', currency: 'USD', exchangeRate: 3.67, lines: [{ itemId, description: 'Laptop', quantity: 10, unitPrice: 100, unitCost: 100, vatCode: 'STANDARD' }] };
  const created = await POST(request('POST', initial));
  assert.equal(created.status, 201);
  const original = (await created.json()).record;
  const id = original.id;
  const detail = async () => (await GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${companyId}&id=${id}`))).json();
  let revision = (await detail()).revision;
  const edit = (changes = {}, token = revision) => PATCH(request('PATCH', { ...initial, id, revision: token, ...changes }));
  const snapshot = async () => ({
    document: (await database.query('SELECT * FROM transactions WHERE id = $1', [id])).rows,
    items: (await database.query('SELECT quantity, last_purchase_price FROM items WHERE id = $1', [itemId])).rows,
    lines: (await database.query('SELECT * FROM transaction_lines WHERE transaction_id = $1 ORDER BY id', [id])).rows,
    journal: (await database.query('SELECT jl.* FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id WHERE je.transaction_id = $1 ORDER BY jl.id', [id])).rows,
    vendors: (await database.query('SELECT name, balance FROM contacts WHERE company_id = $1 ORDER BY name', [companyId])).rows,
  });
  try {
    for (const role of ['accountant', 'purchasing', 'viewer', 'inventory', 'sales']) {
      globalThis.__transferTestUser = { id: 9, role, companyIds: [companyId] };
      assert.equal((await edit()).status, 403);
    }
    globalThis.__transferTestUser = { id: 9, role: 'admin', companyIds: [] };
    assert.equal((await edit()).status, 403);
    globalThis.__transferTestUser = { id: 9, role: 'admin', companyIds: [companyId], fullName: 'Purchase Admin', email: 'admin@test.local' };
    // Eight have already sold. Keeping ten received is valid; reducing below eight is not.
    await database.query('UPDATE items SET quantity = 2 WHERE id = $1', [itemId]);
    let before = await snapshot();
    assert.equal((await edit({ lines: [{ ...initial.lines[0], quantity: 7 }] })).status, 409);
    assert.deepEqual(await snapshot(), before);
    const updated = await edit({ party: 'New supplier', lines: [{ ...initial.lines[0], unitPrice: 120 }] });
    assert.equal(updated.status, 200, JSON.stringify(await updated.clone().json()));
    const record = (await updated.json()).record;
    assert.equal(record.id, id);
    assert.equal(record.createdAt, original.createdAt);
    assert.equal(record.total, 1260);
    assert.equal(record.baseTotal, 4624.2);
    let state = await snapshot();
    assert.deepEqual(state.items, [{ quantity: 2, last_purchase_price: 440.4 }]);
    assert.deepEqual(state.vendors, [{ name: 'New supplier', balance: 1260 }, { name: 'Original supplier', balance: 0 }]);
    assert.equal(Math.round(state.journal.reduce((sum, row) => sum + row.debit, 0) * 100), 462420);
    assert.equal(Math.round(state.journal.reduce((sum, row) => sum + row.credit, 0) * 100), 462420);
    assert.equal((await edit()).status, 409);
    revision = (await detail()).revision;
    before = await snapshot();
    // Invalid exchange rate is discovered after reversals: every change must roll back.
    assert.equal((await edit({ exchangeRate: 0 })).status, 400);
    assert.deepEqual(await snapshot(), before);
    assert.equal((await edit({ type: 'invoice' })).status, 400);
    assert.equal((await edit({ locationId: locationId + 10000 })).status, 400);
    assert.equal((await edit({ lines: [] })).status, 400);
    assert.equal((await edit({ transactionDate: '2026-02-30' })).status, 400);
    globalThis.__transferTestUser = { id: 1, role: 'all_admin', companyIds: [], email: 'owner@test.local' };
    assert.equal((await edit({ lines: [{ ...initial.lines[0], quantity: 12 }] })).status, 200);
    state = await snapshot();
    assert.equal(state.items[0].quantity, 4);
    const logs = (await database.query("SELECT details FROM audit_log WHERE entity_type = 'transaction' AND entity_id = $1 AND action = 'updated' ORDER BY id", [id])).rows;
    assert.equal(logs.length, 2);
    assert.equal(JSON.parse(logs[0].details).actor.name, 'Purchase Admin');
    assert.equal((await database.query('SELECT count(*)::int AS n FROM journal_entries WHERE transaction_id = $1', [id])).rows[0].n, 1);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM inventory_movements WHERE transaction_id = $1', [id])).rows[0].n, 1);
    revision = (await detail()).revision;
    before = await snapshot();
    await database.exec("CREATE FUNCTION reject_purchase_edit_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'updated' AND NEW.entity_type = 'transaction' THEN RAISE EXCEPTION 'Test edit audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_purchase_edit_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_purchase_edit_audit()");
    assert.equal((await edit({ lines: [{ ...initial.lines[0], quantity: 15 }] })).status, 500);
    assert.deepEqual(await snapshot(), before);
    await database.exec('DROP TRIGGER reject_purchase_edit_audit ON audit_log; DROP FUNCTION reject_purchase_edit_audit()');
    // A subsequent purchase remains the source of the last purchase price.
    assert.equal((await POST(request('POST', { ...initial, number: 'LATER-BILL', transactionDate: '2026-09-11', lines: [{ ...initial.lines[0], quantity: 1, unitPrice: 200 }] }))).status, 201);
    assert.equal((await edit()).status, 200);
    assert.equal((await snapshot()).items[0].last_purchase_price, 734);
    await database.query("UPDATE transactions SET status = 'converted' WHERE id = $1", [id]);
    revision = (await detail()).revision;
    assert.equal((await edit()).status, 409);
  } finally { delete globalThis.__transferTestUser; }
});

test('customer payments debit the selected company bank and reject invalid deposit accounts before writing', async () => {
  const companyId = (await database.query("INSERT INTO companies (name) VALUES ('Deposit bank test') RETURNING id")).rows[0].id;
  const otherId = (await database.query("INSERT INTO companies (name) VALUES ('Other bank company') RETURNING id")).rows[0].id;
  await database.query("INSERT INTO accounts (company_id, code, name, type, system_role, currency, active) VALUES ($1, 'B1', 'Default Bank', 'Bank', 'BANK', 'AED', true), ($1, 'B2', 'Selected USD Bank', 'Bank', NULL, 'USD', true), ($1, 'B3', 'Closed Bank', 'Bank', NULL, 'AED', false), ($1, 'E1', 'Expense only', 'Expense', 'EXPENSE', 'AED', true), ($2, 'B4', 'Foreign Company Bank', 'Bank', 'BANK', 'AED', true)", [companyId, otherId]);
  await database.query("INSERT INTO contacts (company_id, type, name, currency, balance) VALUES ($1, 'customer', 'Payment Customer', 'USD', 100)", [companyId]);
  const { POST } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const pay = (account) => POST(new Request('https://app.test/api/records', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'transactions', companyId, type: 'customer payment', account, number: 'PAY-SELECTED', party: 'Payment Customer', currency: 'USD', exchangeRate: 3.675, transactionDate: '2026-09-11', lines: [{ description: 'Payment received', quantity: 1, unitPrice: 100, unitCost: 0, vatCode: 'ZERO' }] }) }));
  for (const account of ['', 'Missing Bank', 'Closed Bank', 'Expense only', 'Foreign Company Bank']) assert.equal((await pay(account)).status, 400);
  assert.equal((await database.query('SELECT count(*)::int AS n FROM transactions WHERE company_id = $1', [companyId])).rows[0].n, 0);
  const response = await pay('Selected USD Bank');
  assert.equal(response.status, 201);
  const record = (await response.json()).record;
  assert.equal(record.account, 'Selected USD Bank');
  const lines = (await database.query('SELECT jl.account_name, jl.debit, jl.credit FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id WHERE je.transaction_id = $1 ORDER BY jl.id', [record.id])).rows;
  assert.deepEqual(lines, [{ account_name: 'Selected USD Bank', debit: 367.5, credit: 0 }, { account_name: 'Accounts Receivable', debit: 0, credit: 367.5 }]);
  assert.equal((await database.query('SELECT balance FROM contacts WHERE company_id = $1', [companyId])).rows[0].balance, 0);
});

test('cheques credit the chosen currency bank and debit the selected AP or expense account', async () => {
  const companyId = (await database.query("INSERT INTO companies (name) VALUES ('Cheque bank test') RETURNING id")).rows[0].id;
  const rows = (await database.query("INSERT INTO accounts (company_id, code, name, type, system_role, currency) VALUES ($1, 'AED', 'Cheque AED Bank', 'Bank', 'BANK', 'AED'), ($1, 'USD', 'Cheque USD Bank', 'Bank', 'BANK', 'USD'), ($1, 'AP', 'Cheque USD AP', 'Accounts Payable', 'AP', 'USD'), ($1, 'EXP', 'Cheque Expense', 'Expense', 'EXPENSE', 'AED') RETURNING id, name", [companyId])).rows;
  const bankAccountId = rows.find(r => r.name === 'Cheque USD Bank').id;
  await database.query("INSERT INTO contacts (company_id, type, name, currency, balance) VALUES ($1, 'vendor', 'Cheque Supplier', 'USD', 500)", [companyId]);
  const { POST } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const pay = (changes = {}) => POST(new Request('https://app.test/api/records', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'transactions', companyId, type: 'cheque', number: 'CHQ-TEST', party: 'Cheque Supplier', account: 'Cheque USD AP', bankAccountId, currency: 'USD', exchangeRate: 3.675, transactionDate: '2026-09-11', lines: [{ description: 'Cheque', quantity: 1, unitPrice: 100, unitCost: 0, vatCode: 'ZERO' }], ...changes }) }));
  for (const changes of [{ bankAccountId: null }, { bankAccountId: rows[0].id }, { bankAccountId: rows[2].id }, { account: 'Missing AP' }]) assert.equal((await pay(changes)).status, 400);
  assert.equal((await database.query('SELECT count(*)::int AS n FROM transactions WHERE company_id=$1', [companyId])).rows[0].n, 0);
  for (const account of ['Cheque USD AP', 'Cheque Expense']) {
    const response = await pay({ account }); assert.equal(response.status, 201);
    const id = (await response.json()).record.id;
    const journal = (await database.query('SELECT jl.account_name, jl.debit, jl.credit FROM journal_lines jl JOIN journal_entries je ON jl.journal_entry_id=je.id WHERE je.transaction_id=$1 ORDER BY jl.id', [id])).rows;
    assert.deepEqual(journal, [{ account_name: account, debit: 367.5, credit: 0 }, { account_name: 'Cheque USD Bank', debit: 0, credit: 367.5 }]);
  }
  assert.equal((await database.query('SELECT balance FROM contacts WHERE company_id=$1', [companyId])).rows[0].balance, 400);
  await database.query('UPDATE accounts SET active=false WHERE id=$1', [bankAccountId]);
  assert.equal((await pay()).status, 400);
});

test('new currency accounts link to matching contacts and a new bank receives payments', async () => {
  const companyId = (await database.query("INSERT INTO companies (name) VALUES ('Currency accounts test') RETURNING id")).rows[0].id;
  await database.query("INSERT INTO contacts (company_id, type, name, currency, balance) VALUES ($1, 'customer', 'USD customer', 'USD', 100), ($1, 'customer', 'AED customer', 'AED', 0), ($1, 'vendor', 'USD vendor', 'USD', 0)", [companyId]);
  const { POST } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const create = (payload) => POST(new Request('https://app.test/api/records', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ companyId, ...payload }) }));
  const bankResponse = await create({ kind: 'accounts', code: 'USD-BANK', name: 'New USD Bank', type: 'Bank', currency: 'USD' });
  assert.equal(bankResponse.status, 201);
  assert.equal((await bankResponse.json()).record.currency, 'USD');
  for (const [systemRole, type, name] of [['AR', 'Accounts Receivable', 'USD Receivables'], ['AP', 'Accounts Payable', 'USD Payables']]) {
    const response = await create({ kind: 'accounts', code: systemRole, name, type, systemRole, currency: 'USD' });
    assert.equal(response.status, 201);
    const record = (await response.json()).record;
    const contact = (await database.query('SELECT ledger_account_id FROM contacts WHERE company_id=$1 AND type=$2 AND currency=$3', [companyId, systemRole === 'AR' ? 'customer' : 'vendor', 'USD'])).rows[0];
    assert.equal(contact.ledger_account_id, record.id);
  }
  assert.equal((await database.query("SELECT ledger_account_id FROM contacts WHERE company_id=$1 AND currency='AED'", [companyId])).rows[0].ledger_account_id, null);
  const payment = await create({ kind: 'transactions', type: 'customer payment', number: 'NEW-BANK-PAY', account: 'New USD Bank', party: 'USD customer', currency: 'USD', exchangeRate: 3.675, lines: [{ description: 'Payment', quantity: 1, unitPrice: 100, vatCode: 'ZERO' }] });
  assert.equal(payment.status, 201);
  const id = (await payment.json()).record.id;
  const journal = (await database.query('SELECT jl.account_name, jl.debit, jl.credit FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id WHERE je.transaction_id=$1 ORDER BY jl.id', [id])).rows;
  assert.deepEqual(journal, [{ account_name: 'New USD Bank', debit: 367.5, credit: 0 }, { account_name: 'USD Receivables', debit: 0, credit: 367.5 }]);
});

test('journal edit and delete are admin-only, balanced, scoped, audited and atomic', async () => {
  const companyId = (await database.query("INSERT INTO companies (name) VALUES ('Journal changes test') RETURNING id")).rows[0].id;
  const locationId = (await database.query("INSERT INTO inventory_locations (company_id, code, name, invoice_prefix) VALUES ($1, 'J-EDIT', 'Journal inventory', 'J-EDIT') RETURNING id", [companyId])).rows[0].id;
  const accts = (await database.query("INSERT INTO accounts (company_id, code, name, type) VALUES ($1, 'J1', 'Journal Bank', 'Bank'), ($1, 'J2', 'Journal Equity', 'Equity') RETURNING id", [companyId])).rows;
  const { GET, POST, PATCH, DELETE } = await vite.ssrLoadModule('/app/api/journal-entries/route.ts');
  const req = (method, payload) => new Request('https://app.test/api/journal-entries', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const original = { companyId, locationId, reference: 'GJ-EDIT', entryDate: '2026-09-11', description: 'Original manual journal', lines: [{ accountId: accts[0].id, debit: 100, credit: 0 }, { accountId: accts[1].id, debit: 0, credit: 100 }] };
  const created = await POST(req('POST', original)); assert.equal(created.status, 201);
  const id = (await created.json()).entry.id;
  const listing = async () => (await GET(new Request(`https://app.test/api/journal-entries?companyId=${companyId}&locationId=${locationId}`))).json();
  let revision = (await listing()).entries.find(e => e.id === id).revision;
  const edit = (changes = {}, token = revision) => PATCH(req('PATCH', { ...original, id, revision: token, ...changes }));
  const remove = (token = revision, entryId = id) => DELETE(req('DELETE', { companyId, locationId, id: entryId, revision: token }));
  const snapshot = async () => ({ entry: (await database.query('SELECT * FROM journal_entries WHERE id=$1', [id])).rows, lines: (await database.query('SELECT * FROM journal_lines WHERE journal_entry_id=$1 ORDER BY id', [id])).rows });
  try {
    for (const role of ['accountant', 'viewer', 'sales', 'purchasing', 'inventory']) {
      globalThis.__transferTestUser = { id: 7, role, companyIds: [companyId] };
      assert.equal((await edit()).status, 403); assert.equal((await remove()).status, 403);
      assert.equal((await listing()).entries.find(e => e.id === id).canManage, false);
    }
    globalThis.__transferTestUser = { id: 7, role: 'admin', companyIds: [] };
    assert.equal((await edit()).status, 403); assert.equal((await remove()).status, 403);
    globalThis.__transferTestUser = { id: 7, role: 'admin', companyIds: [companyId], email: 'journal-admin@test.local' };
    assert.equal((await listing()).entries.find(e => e.id === id).canManage, true);
    const before = await snapshot();
    assert.equal((await edit({ lines: [{ ...original.lines[0], debit: 101 }, original.lines[1]] })).status, 409);
    assert.equal((await edit({ entryDate: '2026-02-30' })).status, 400);
    assert.deepEqual(await snapshot(), before);
    assert.equal((await edit({ description: 'Corrected', lines: [{ ...original.lines[0], debit: 200 }, { ...original.lines[1], credit: 200 }] })).status, 200);
    const corrected = await snapshot();
    assert.equal(corrected.entry[0].description, 'Corrected');
    assert.deepEqual(corrected.entry[0].created_at, before.entry[0].created_at);
    assert.equal(corrected.lines.reduce((sum, line) => sum + line.debit, 0), 200);
    assert.equal((await remove()).status, 409); assert.equal((await edit()).status, 409);
    revision = (await listing()).entries.find(e => e.id === id).revision;
    // Automatic journals, including stock revaluations with no transaction ID, are protected.
    const automatic = (await database.query("INSERT INTO journal_entries (company_id, location_id, entry_date, reference, description) VALUES ($1, $2, '2026-09-11', 'REV-TEST', 'Stock revaluation: item') RETURNING id", [companyId, locationId])).rows[0].id;
    const auto = (await listing()).entries.find(e => e.id === automatic);
    assert.equal(auto.source, 'Stock revaluation'); assert.equal(auto.canManage, false);
    assert.equal((await remove(auto.revision, automatic)).status, 409);
    assert.equal((await edit({ id: automatic }, auto.revision)).status, 409);
    await database.exec("CREATE FUNCTION reject_journal_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type = 'journal_entry' AND NEW.action IN ('deleted','previous_version') THEN RAISE EXCEPTION 'Test journal audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_journal_change BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_journal_change()");
    assert.equal((await edit()).status, 500); assert.deepEqual(await snapshot(), corrected);
    assert.equal((await remove()).status, 500); assert.deepEqual(await snapshot(), corrected);
    await database.exec('DROP TRIGGER reject_journal_change ON audit_log; DROP FUNCTION reject_journal_change()');
    globalThis.__transferTestUser = { id: 1, role: 'all_admin', companyIds: [], email: 'owner@test.local' };
    assert.equal((await remove()).status, 200);
    assert.deepEqual(await snapshot(), { entry: [], lines: [] });
    const audit = (await database.query("SELECT details FROM audit_log WHERE entity_type='journal_entry' AND entity_id=$1 AND action='deleted'", [id])).rows[0];
    assert.equal(JSON.parse(audit.details).actor.email, 'owner@test.local');
    assert.equal(JSON.parse(audit.details).lines.length, 2);
  } finally { delete globalThis.__transferTestUser; }
});

test('foreign currency journals preserve original amounts, balance converted split lines and edit without double conversion', async () => {
  const companyId = (await database.query("INSERT INTO companies (name, base_currency) VALUES ('Foreign journal test', 'AED') RETURNING id")).rows[0].id;
  const locationId = (await database.query("INSERT INTO inventory_locations (company_id, code, name, invoice_prefix) VALUES ($1, 'FX-J', 'FX journal inventory', 'FX-J') RETURNING id", [companyId])).rows[0].id;
  const accts = (await database.query("INSERT INTO accounts (company_id, code, name, type) VALUES ($1, 'FX1', 'FX bank', 'Bank'), ($1, 'FX2', 'FX expense', 'Expense') RETURNING id", [companyId])).rows;
  const { GET, POST, PATCH, DELETE } = await vite.ssrLoadModule('/app/api/journal-entries/route.ts');
  const req = (method, body) => new Request('https://app.test/api/journal-entries', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const payload = { companyId, locationId, entryDate: '2026-09-11', reference: 'FX-JOURNAL', description: 'USD journal', currency: 'USD', exchangeRate: 3.675, lines: [{ accountId: accts[0].id, debit: 100, credit: 0 }, { accountId: accts[1].id, debit: 0, credit: 100 }] };
  for (const changes of [{ exchangeRate: 0 }, { exchangeRate: -1 }, { exchangeRate: '' }, { exchangeRate: null }, { currency: 'AED', exchangeRate: 3.675 }, { currency: 'INVALID' }]) assert.equal((await POST(req('POST', { ...payload, ...changes }))).status, 400);
  const created = await POST(req('POST', payload)); assert.equal(created.status, 201);
  const id = (await created.json()).entry.id;
  const list = async () => (await (await GET(new Request(`https://app.test/api/journal-entries?companyId=${companyId}&locationId=${locationId}`))).json()).entries;
  let entry = (await list()).find(e => e.id === id);
  assert.equal(entry.currency, 'USD'); assert.equal(entry.exchangeRate, 3.675);
  assert.equal(entry.debit, 367.5); assert.equal(entry.credit, 367.5);
  assert.equal(entry.lines[0].originalDebit, 100);
  const updated = await PATCH(req('PATCH', { ...payload, id, revision: entry.revision, exchangeRate: 3.7 }));
  assert.equal(updated.status, 200);
  entry = (await list()).find(e => e.id === id);
  assert.equal(entry.debit, 370); assert.equal(entry.lines[0].originalDebit, 100);
  assert.equal((await POST(req('POST', { ...payload, reference: 'FX-SPLIT', lines: [{ accountId: accts[0].id, debit: 0.01 }, { accountId: accts[0].id, debit: 0.01 }, { accountId: accts[1].id, credit: 0.02 }] }))).status, 201);
  const split = (await list()).find(e => e.reference === 'FX-SPLIT');
  assert.equal(split.debit, 0.07); assert.equal(split.credit, 0.07);
  assert.equal(split.lines.reduce((sum, line) => sum + line.originalDebit, 0), 0.02);
  assert.equal((await DELETE(req('DELETE', { id, companyId, locationId, revision: entry.revision }))).status, 200);
  assert.equal((await list()).some(e => e.id === id), false);
});
