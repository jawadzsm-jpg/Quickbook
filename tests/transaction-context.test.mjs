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
  const customer = await edit({kind:'contacts',id:contact,name:'Updated customer',phone:'+971501234567',whatsapp:'+971501234568',balance:999,currency:'USD',type:'vendor'});
  assert.equal(customer.status,200,await customer.text());
  assert.deepEqual((await database.query('SELECT name, phone, type, balance, currency FROM contacts WHERE id = $1',[contact])).rows,[{name:'Updated customer',phone:'+971501234567',type:'customer',balance:50,currency:'AED'}]);
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

test('Chart of Accounts system roles stay connected to their accounting purpose', async () => {
  const companyId=(await database.query("INSERT INTO companies(name,base_currency) VALUES('COA purpose audit','AED') RETURNING id")).rows[0].id;
  const locationId=(await database.query("INSERT INTO inventory_locations(company_id,name,code,invoice_prefix) VALUES($1,'Main','COA','COA') RETURNING id",[companyId])).rows[0].id;
  const rows=(await database.query(`INSERT INTO accounts(company_id,code,name,type,system_role,currency) VALUES
    ($1,'1000','Audit Bank','Bank','BANK','AED'),
    ($1,'1100','Audit AR','Accounts Receivable','AR','AED'),
    ($1,'1200','Audit Inventory','Other Current Asset','INVENTORY','AED'),
    ($1,'1300','Audit Input VAT','Other Current Asset','INPUT_VAT','AED'),
    ($1,'2000','Audit AP','Accounts Payable','AP','AED'),
    ($1,'2100','Audit Output VAT','Other Current Liability','OUTPUT_VAT','AED'),
    ($1,'3000','Audit Equity','Equity','EQUITY','AED'),
    ($1,'4000','Audit Sales','Income','SALES','AED'),
    ($1,'4100','Audit Other Income','Other Income','OTHER_INCOME','AED'),
    ($1,'5000','Audit COGS','Cost of Goods Sold','COGS','AED'),
    ($1,'6000','Audit Purchases','Expense','PURCHASES','AED'),
    ($1,'6100','Audit Expense','Expense','EXPENSE','AED'),
    ($1,'6200','Audit Payroll','Expense','PAYROLL','AED'),
    ($1,'9999','Audit Suspense','Other Current Asset','SUSPENSE','AED')
    RETURNING id,name,system_role,type`,[companyId])).rows;
  const byRole=(role)=>rows.find(row=>row.system_role===role);
  assert.deepEqual(
    Object.fromEntries(rows.map(row=>[row.system_role,row.type])),
    {BANK:'Bank',AR:'Accounts Receivable',INVENTORY:'Other Current Asset',INPUT_VAT:'Other Current Asset',AP:'Accounts Payable',OUTPUT_VAT:'Other Current Liability',EQUITY:'Equity',SALES:'Income',OTHER_INCOME:'Other Income',COGS:'Cost of Goods Sold',PURCHASES:'Expense',EXPENSE:'Expense',PAYROLL:'Expense',SUSPENSE:'Other Current Asset'}
  );
  const {POST}=await vite.ssrLoadModule('/app/api/records/route.ts');
  const req=(body)=>new Request('https://app.test/api/records',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const wrongCogs=await POST(req({kind:'items',companyId,locationId,itemType:'stock-part',name:'Wrong COGS',quantity:0,cost:0,salesPrice:0,assetAccountId:byRole('INVENTORY').id,cogsAccountId:byRole('PURCHASES').id,incomeAccountId:byRole('SALES').id}));
  assert.equal(wrongCogs.status,400);
  const wrongIncome=await POST(req({kind:'items',companyId,locationId,itemType:'stock-part',name:'Wrong income',quantity:0,cost:0,salesPrice:0,assetAccountId:byRole('INVENTORY').id,cogsAccountId:byRole('COGS').id,incomeAccountId:byRole('EXPENSE').id}));
  assert.equal(wrongIncome.status,400);
  const good=await POST(req({kind:'items',companyId,locationId,itemType:'stock-part',name:'Correct links',quantity:0,cost:0,salesPrice:0,assetAccountId:byRole('INVENTORY').id,cogsAccountId:byRole('COGS').id,incomeAccountId:byRole('SALES').id}));
  assert.equal(good.status,201,await good.clone().text());
});

test('stock item links Inventory Asset and calculates average purchase cost in home currency', async () => {
  const companyId = (await database.query("INSERT INTO companies (name,base_currency) VALUES ('Item costing test','AED') RETURNING id")).rows[0].id;
  const locationId = (await database.query("INSERT INTO inventory_locations (company_id,name,code,invoice_prefix) VALUES ($1,'Main','AVG','AVG') RETURNING id",[companyId])).rows[0].id;
  const accounts = (await database.query("INSERT INTO accounts (company_id,code,name,type,system_role,currency) VALUES ($1,'1200','Inventory Asset','Other Current Asset','INVENTORY','AED'),($1,'1300','Recoverable VAT','Other Current Asset','INPUT_VAT','AED'),($1,'2000','Accounts Payable','Accounts Payable','AP','AED'),($1,'5000','Cost of Goods Sold','Cost of Goods Sold','COGS','AED'),($1,'4000','Sales Revenue','Income','SALES','AED') RETURNING id,name",[companyId])).rows;
  const inventoryId = accounts.find(a=>a.name==='Inventory Asset').id;
  const vatId = accounts.find(a=>a.name==='Recoverable VAT').id;
  const {POST,GET}=await vite.ssrLoadModule('/app/api/records/route.ts');
  const req=(body)=>new Request('https://app.test/api/records',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const bad=await POST(req({kind:'items',companyId,locationId,itemType:'stock-part',name:'Bad asset item',assetAccountId:vatId,quantity:0,cost:0,salesPrice:0}));
  assert.equal(bad.status,400);
  const good=await POST(req({kind:'items',companyId,locationId,itemType:'stock-part',name:'Average cost item',assetAccountId:inventoryId,quantity:0,cost:0,salesPrice:0}));
  assert.equal(good.status,201,await good.clone().text());
  const item=(await good.json()).record;
  await database.query("INSERT INTO contacts(company_id,type,name,currency) VALUES ($1,'vendor','Average Vendor','AED')",[companyId]);
  for (const [number,qty,price,rate,freight] of [['AVG-1',2,100,1,20],['AVG-2',1,200,1,0]]) {
    const purchase=await POST(req({kind:'transactions',type:'bill',companyId,locationId,number,party:'Average Vendor',currency:'AED',exchangeRate:rate,lines:[{itemId:item.id,description:'Average cost item',quantity:qty,unitPrice:price,unitCost:price,freightCharge:freight,vatCode:'ZERO'}]}));
    assert.equal(purchase.status,201,await purchase.clone().text());
  }
  const response=await GET(new Request(`https://app.test/api/records?kind=items&companyId=${companyId}&locationId=${locationId}`));
  assert.equal(response.status,200);
  const saved=(await response.json()).records.find(row=>row.id===item.id);
  assert.equal(saved.assetAccountId,inventoryId);
  assert.equal(saved.quantity,3);
  assert.equal(saved.averageCost,140);
  await database.query('DELETE FROM transactions WHERE company_id=$1',[companyId]);
  await database.query('UPDATE items SET last_purchase_price=175,cost=0 WHERE id=$1',[item.id]);
  const fallback=await GET(new Request(`https://app.test/api/records?kind=items&companyId=${companyId}&locationId=${locationId}`));
  assert.equal((await fallback.json()).records.find(row=>row.id===item.id).averageCost,175);
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
  assert.deepEqual(lines, [{ account_name: 'Selected USD Bank', debit: 367.5, credit: 0 }, { account_name: 'Accounts Receivable - USD', debit: 0, credit: 367.5 }]);
  assert.equal((await database.query('SELECT balance FROM contacts WHERE company_id = $1', [companyId])).rows[0].balance, 0);
});

test('cheques credit the chosen currency bank and debit the selected AP or expense account', async () => {
  const companyId = (await database.query("INSERT INTO companies (name) VALUES ('Cheque bank test') RETURNING id")).rows[0].id;
  const rows = (await database.query("INSERT INTO accounts (company_id, code, name, type, system_role, currency) VALUES ($1, 'AED', 'Cheque AED Bank', 'Bank', 'BANK', 'AED'), ($1, 'USD', 'Cheque USD Bank', 'Bank', 'BANK', 'USD'), ($1, 'AP', 'Cheque USD AP', 'Accounts Payable', 'AP', 'USD'), ($1, 'EXP', 'Cheque Expense', 'Expense', 'EXPENSE', 'AED'), ($1, 'DIRECT', 'Direct Expense', 'Expense', NULL, 'AED') RETURNING id, name", [companyId])).rows;
  const bankAccountId = rows.find(r => r.name === 'Cheque USD Bank').id;
  await database.query("INSERT INTO contacts (company_id, type, name, currency, balance) VALUES ($1, 'vendor', 'Cheque Supplier', 'USD', 500), ($1, 'employee', 'Salary Employee', 'USD', 0)", [companyId]);
  const { POST } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const pay = (changes = {}) => POST(new Request('https://app.test/api/records', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'transactions', companyId, type: 'cheque', number: 'CHQ-TEST', party: 'Cheque Supplier', account: 'Cheque USD AP', bankAccountId, chequeBankKey: 'emirates-nbd-business', currency: 'USD', exchangeRate: 3.675, transactionDate: '2026-09-11', lines: [{ description: 'Cheque', quantity: 1, unitPrice: 100, unitCost: 0, vatCode: 'ZERO' }], ...changes }) }));
  for (const changes of [{ bankAccountId: null }, { bankAccountId: rows[0].id }, { bankAccountId: rows[2].id }, { account: 'Missing AP' }, { chequeBankKey: 'not-a-uae-bank' }]) assert.equal((await pay(changes)).status, 400);
  assert.equal((await pay({ party: '', chequeType: 'supplier' })).status, 400);
  assert.equal((await database.query('SELECT count(*)::int AS n FROM transactions WHERE company_id=$1', [companyId])).rows[0].n, 0);
  const savedChequeIds = [];
  for (const account of ['Cheque USD AP', 'Cheque Expense', 'Direct Expense']) {
    const response = await pay({ account }); assert.equal(response.status, 201);
    const savedCheque = (await response.json()).record;
    assert.equal(savedCheque.status, 'paid');
    assert.equal(savedCheque.chequeBankKey, 'emirates-nbd-business');
    assert.ok(savedCheque.paidAt);
    const id = savedCheque.id;
    savedChequeIds.push(id);
    const journal = (await database.query('SELECT jl.account_name, jl.debit, jl.credit FROM journal_lines jl JOIN journal_entries je ON jl.journal_entry_id=je.id WHERE je.transaction_id=$1 ORDER BY jl.id', [id])).rows;
    assert.deepEqual(journal, [{ account_name: account, debit: 367.5, credit: 0 }, { account_name: 'Cheque USD Bank', debit: 0, credit: 367.5 }]);
  }
  assert.equal((await database.query("SELECT balance FROM contacts WHERE company_id=$1 AND name='Cheque Supplier'", [companyId])).rows[0].balance, 400);
  const salary = await pay({ party: 'Salary Employee', account: 'Direct Expense', number: 'CHQ-SALARY', memo: 'September payroll', lines: [{ description: 'September 2026 salary', quantity: 1, unitPrice: 200, vatCode: 'ZERO' }] });
  assert.equal(salary.status, 201);
  const salaryId = (await salary.json()).record.id;
  assert.deepEqual((await database.query('SELECT jl.account_name, jl.debit, jl.credit FROM journal_lines jl JOIN journal_entries je ON jl.journal_entry_id=je.id WHERE je.transaction_id=$1 ORDER BY jl.id', [salaryId])).rows, [{ account_name: 'Direct Expense', debit: 735, credit: 0 }, { account_name: 'Cheque USD Bank', debit: 0, credit: 735 }]);
  const unnamedExpense = await pay({ party: '', chequeType: 'salary', account: 'Direct Expense', number: 'CHQ-NAMELESS', lines: [{ description: 'General salary expense', quantity: 1, unitPrice: 50, vatCode: 'ZERO' }] });
  assert.equal(unnamedExpense.status, 201);
  assert.equal((await unnamedExpense.json()).record.party, 'General expense');
  const vendorExpense = await pay({ party: 'Cheque Supplier', account: 'Direct Expense', number: 'CHQ-EXPENSE-VAT', memo: 'Vendor expense', lines: [{ description: 'Taxable vendor expense', quantity: 1, unitPrice: 100, vatCode: 'STANDARD' }] });
  assert.equal(vendorExpense.status, 201);
  const vendorExpenseId = (await vendorExpense.json()).record.id;
  assert.deepEqual((await database.query('SELECT jl.account_name, jl.debit, jl.credit FROM journal_lines jl JOIN journal_entries je ON jl.journal_entry_id=je.id WHERE je.transaction_id=$1 ORDER BY jl.id', [vendorExpenseId])).rows, [{ account_name: 'Direct Expense', debit: 367.5, credit: 0 }, { account_name: 'Recoverable VAT', debit: 18.38, credit: 0 }, { account_name: 'Cheque USD Bank', debit: 0, credit: 385.88 }]);
  const { GET, PATCH, DELETE } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const accountRecords = (await (await GET(new Request(`https://app.test/api/records?kind=accounts&companyId=${companyId}`))).json()).records;
  const listedUsdBank = accountRecords.find(account => account.name === 'Cheque USD Bank');
  assert.equal(listedUsdBank.balance, -655);
  assert.equal(listedUsdBank.baseBalance, -2407.13);
  const chequeDetail = await (await GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${companyId}&id=${savedChequeIds[0]}`))).json();
  const renameCheque = (id, revision, number) => PATCH(new Request('https://app.test/api/records', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'transactions', companyId, id, revision, editMode: 'cheque-number', number }) }));
  const renamed = await renameCheque(savedChequeIds[0], chequeDetail.revision, 'CHQ-EDITED');
  assert.equal(renamed.status, 200);
  const renamedPayload = await renamed.json();
  const renamedRecord = renamedPayload.record;
  assert.equal(renamedRecord.number, 'CHQ-EDITED');
  const renamedRevision = renamedPayload.revision;
  assert.ok(renamedRevision);
  assert.equal((await database.query('SELECT reference FROM journal_entries WHERE transaction_id=$1', [savedChequeIds[0]])).rows[0].reference, 'CHQ-EDITED');
  assert.equal((await renameCheque(savedChequeIds[0], renamedRevision, 'CHQ-EDITED-2')).status, 200);
  const duplicateDetail = await (await GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${companyId}&id=${savedChequeIds[1]}`))).json();
  assert.equal((await renameCheque(savedChequeIds[1], duplicateDetail.revision, 'CHQ-EDITED-2')).status, 409);
  const legacyId = (await database.query("UPDATE transactions SET status='open',paid_at=NULL WHERE company_id=$1 RETURNING id", [companyId])).rows[0].id;
  const legacyDetail = await (await GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${companyId}&id=${legacyId}`))).json();
  assert.equal(legacyDetail.record.status,'paid');
  const legacyList = await (await GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${companyId}`))).json();
  assert.ok(legacyList.records.every((record) => record.status === 'paid'));
  const locationId = (await database.query("INSERT INTO inventory_locations (company_id,name,code,invoice_prefix) VALUES ($1,'Cheque stock','CHQ','CHQ-INV') RETURNING id", [companyId])).rows[0].id;
  const billId = (await database.query("INSERT INTO transactions (company_id,location_id,type,number,party,account,total,subtotal,currency,exchange_rate,transaction_date,status) VALUES ($1,$2,'bill','CHQ-BILL','Cheque Supplier','Cheque USD AP',200,200,'USD',3.675,'2026-09-11','open') RETURNING id", [companyId,locationId])).rows[0].id;
  const state = async () => (await database.query('SELECT status FROM transactions WHERE id=$1',[billId])).rows[0].status;
  const unpaid = async () => (await (await GET(new Request(`https://app.test/api/records?kind=unpaid-bills&companyId=${companyId}&locationId=${locationId}&party=Cheque%20Supplier&currency=USD`))).json()).records;
  assert.equal((await pay({billId,locationId,account:'Cheque Expense'})).status,400);
  const partial = await pay({billId,locationId}); assert.equal(partial.status,201);
  const partialId = (await partial.json()).record.id;
  assert.equal(await state(),'partially paid'); assert.equal((await unpaid())[0].remaining,100);
  assert.equal((await pay({billId,locationId,lines:[{description:'Overpayment',quantity:1,unitPrice:101,vatCode:'ZERO'}]})).status,409);
  const final = await pay({billId,locationId}); assert.equal(final.status,201);
  const finalId = (await final.json()).record.id;
  assert.equal(await state(),'paid'); assert.equal((await unpaid()).length,0);
  for (const id of [finalId,partialId]) assert.equal((await DELETE(new Request('https://app.test/api/records',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'transactions',companyId,id})}))).status,200);
  assert.equal((await unpaid())[0].remaining,200);
  const secondBillId = (await database.query("INSERT INTO transactions (company_id,location_id,type,number,party,account,total,subtotal,currency,exchange_rate,transaction_date,status) VALUES ($1,$2,'bill','CHQ-BILL-2','Cheque Supplier','Cheque USD AP',150,150,'USD',3.675,'2026-09-12','open') RETURNING id", [companyId,locationId])).rows[0].id;
  const multiple = (amount, extras = {}) => pay({locationId,billIds:[secondBillId,billId],memo:'Supplier settlement',lines:[{description:'Bills',quantity:1,unitPrice:amount,vatCode:'ZERO'}],...extras});
  assert.equal((await multiple(351)).status,409);
  assert.equal((await multiple(250,{account:'Cheque Expense'})).status,400);
  assert.equal((await multiple(250,{billIds:[billId,billId]})).status,400);
  const multi = await multiple(250); assert.equal(multi.status,201); const multiRecord=(await multi.json()).record;
  assert.equal(multiRecord.billId,null);
  assert.equal(multiRecord.memo,'Supplier settlement · Bill references: CHQ-BILL, CHQ-BILL-2');
  assert.deepEqual((await database.query('SELECT bill_id,amount FROM bill_payment_allocations WHERE payment_id=$1 ORDER BY bill_id',[multiRecord.id])).rows,[{bill_id:billId,amount:200},{bill_id:secondBillId,amount:50}]);
  assert.equal(await state(),'paid'); assert.equal((await unpaid())[0].remaining,100);
  const remove = (id) => DELETE(new Request('https://app.test/api/records',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'transactions',companyId,id})}));
  assert.equal((await remove(secondBillId)).status,409);
  const finalBill = await pay({locationId,billIds:[secondBillId]}); assert.equal(finalBill.status,201);
  const finalBillId=(await finalBill.json()).record.id;
  assert.equal((await unpaid()).length,0);
  assert.equal((await remove(finalBillId)).status,200);
  assert.equal((await remove(multiRecord.id)).status,200);
  assert.deepEqual((await unpaid()).map((bill)=>bill.remaining),[200,150]);
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

test('stock pricing allocates freight, converts home costs and avoids adding GRN to billed cost', async () => {
  const { stockPricingRows } = await vite.ssrLoadModule('/lib/stock-pricing.ts');
  const item = { id: 1, locationId: 1, sku: 'STOCK-PRICE', itemNumber: '13001', name: 'Laptop', quantity: 4, cost: 300, lastPurchasePrice: 0, salesPrice: 500 };
  const line = { transactionId: 1, itemId: 1, description: 'Laptop', quantity: 10, subtotal: 1000, type: 'bill', date: '2026-09-11', number: 'BILL-FX', exchangeRate: 3.675 };
  const lines = [line, { ...line, itemId: 2, quantity: 5, subtotal: 1000 }, { ...line, itemId: null, description: 'Freight Charges', quantity: 1, subtotal: 200 }, { ...line, transactionId: 2, type: 'item receipt', number: 'GRN-FX', subtotal: 800, date: '2026-09-10' }];
  const [first, second] = stockPricingRows([item, { ...item, id: 2, salesPrice: 700 }], lines, [{ id: 1, name: 'Main' }]);
  assert.equal(first.purchaseCost, 367.5); assert.equal(first.freightCost, 36.75); assert.equal(first.grnCost, 294);
  assert.equal(first.totalCost, 404.25); assert.equal(first.unitProfit, 95.75); assert.equal(first.margin, '19.15%');
  assert.equal(first.stockCost, 1617); assert.equal(first.potentialProfit, 383);
  assert.equal(second.freightCost, 73.5); assert.equal(second.totalCost, 808.5); assert.equal(second.unitProfit, -108.5);
  const [receipt] = stockPricingRows([item], lines.filter(l => l.type === 'item receipt'), []);
  assert.equal(receipt.totalCost, 294); assert.equal(receipt.purchaseCost, '—'); assert.equal(receipt.costSource, 'GRN GRN-FX');
  const [unknown] = stockPricingRows([{ ...item, cost: 0 }], [], []); assert.equal(unknown.unitProfit, '—');
  const [zeroPrice] = stockPricingRows([{ ...item, quantity: 0, salesPrice: 0 }], [], []); assert.equal(zeroPrice.margin, '—'); assert.equal(zeroPrice.potentialProfit, 0);
  const [quantityAllocation] = stockPricingRows([item], [{ ...line, subtotal: 0 }, { ...line, itemId: 2, quantity: 10, subtotal: 0 }, { ...line, itemId: null, description: 'Freight Charges', quantity: 1, subtotal: 100 }], []);
  assert.equal(quantityAllocation.freightCost, 18.38);
  // An edited latest bill replaces the old basis instead of accumulating historical costs.
  const [newest] = stockPricingRows([item], [...lines, { ...line, transactionId: 3, number: 'NEW-BILL', subtotal: 1200 }], []);
  assert.equal(newest.totalCost, 441); assert.equal(newest.costSource, 'Bill NEW-BILL');
});

test('stock pricing report is scoped by company and inventory and always labels home currency', async () => {
  const companyId = (await database.query("INSERT INTO companies (name, base_currency) VALUES ('Pricing report', 'EUR') RETURNING id")).rows[0].id;
  const locationId = (await database.query("INSERT INTO inventory_locations (company_id, code, name, invoice_prefix) VALUES ($1, 'PRICE', 'Pricing Inventory', 'PRICE') RETURNING id", [companyId])).rows[0].id;
  await database.query("INSERT INTO items (company_id, location_id, sku, name, quantity, cost, sales_price) VALUES ($1, $2, 'PRICE-API', 'Report Laptop', 3, 20, 30)", [companyId, locationId]);
  const { GET } = await vite.ssrLoadModule('/app/api/reports/route.ts');
  const request = () => new Request(`https://app.test/api/reports?type=stock-pricing-profit&companyId=${companyId}&locationId=${locationId}&currency=USD`);
  const response = await GET(request()); assert.equal(response.status, 200);
  const report = (await response.json()).report;
  assert.equal(report.currency, 'EUR'); assert.equal(report.rows.length, 1); assert.equal(report.rows[0].inventory, 'Pricing Inventory');
  assert.equal(report.rows[0].potentialProfit, 30);
  try {
    globalThis.__transferTestUser = { id: 7, role: 'admin', companyIds: [] };
    assert.equal((await GET(request())).status, 403);
    globalThis.__transferTestUser = { id: 7, role: 'sales', companyIds: [companyId] };
    assert.equal((await GET(request())).status, 403);
  } finally { delete globalThis.__transferTestUser; }
});

test("stock pricing saves company item prices, rejects stale and unauthorized edits, and leaves ledger cost intact", async () => {
  const { PATCH } = await vite.ssrLoadModule('/app/api/stock-pricing/route.ts');
  const { stockPricingRows } = await vite.ssrLoadModule('/lib/stock-pricing.ts');
  const company = (await database.query("INSERT INTO companies (name) VALUES ('Price editor') RETURNING id")).rows[0].id;
  const locationId = (await database.query("INSERT INTO inventory_locations (company_id, code, name, invoice_prefix) VALUES ($1, 'PRICE', 'Price inventory', 'PRICE') RETURNING id", [company])).rows[0].id;
  const itemId = (await database.query("INSERT INTO items (company_id, location_id, sku, name, cost, sales_price, quantity) VALUES ($1, $2, 'PRICE-EDIT', 'Price test', 10, 20, 5) RETURNING id", [company, locationId])).rows[0].id;
  const body = { companyId: company, itemId, salesPrice: 30, grnPrice: 12, expectedPrice: 20, expectedGrnPrice: null };
  const save = (payload = body) => PATCH(new Request('http://localhost/api/stock-pricing', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
  try {
    globalThis.__transferTestUser = { id: 1, role: 'accountant', companyIds: [company] };
    assert.equal((await save()).status, 403);
    globalThis.__transferTestUser = { id: 1, role: 'admin', companyIds: [] };
    assert.equal((await save()).status, 403);
    globalThis.__transferTestUser = { id: 1, role: 'admin', companyIds: [company] };
    assert.equal((await save({ ...body, grnPrice: -1 })).status, 400);
    assert.equal((await save({ ...body, companyId: company + 1000 })).status, 403);
    assert.equal((await save()).status, 200);
    assert.equal((await save()).status, 409);
    const saved = (await database.query('SELECT * FROM items WHERE id=$1', [itemId])).rows[0];
    assert.equal(saved.sales_price, 30); assert.equal(saved.grn_price, 12); assert.equal(saved.cost, 10); assert.equal(saved.quantity, 5);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM journal_entries WHERE company_id=$1', [company])).rows[0].n, 0);
    assert.equal((await database.query("SELECT count(*)::int AS n FROM audit_log WHERE company_id=$1 AND entity_id=$2", [company, itemId])).rows[0].n, 1);
    const item = { id: itemId, locationId: null, sku: 'PRICE-EDIT', name: 'Price test', itemNumber: null, quantity: 5, cost: 10, lastPurchasePrice: 0, salesPrice: 30, grnPrice: 12 };
    let row = stockPricingRows([item], [], [])[0];
    assert.equal(row.totalCost, 12); assert.equal(row.potentialProfit, 90);
    const line = { transactionId: 1, itemId, description: 'Price test', quantity: 1, subtotal: 15, type: 'bill', date: '2026-09-11', number: 'B1', exchangeRate: 1 };
    row = stockPricingRows([item], [line], [])[0];
    assert.equal(row.totalCost, 15); assert.equal(row.grnCost, 12);
    assert.equal(stockPricingRows([{ ...item, grnPrice: 0 }], [], [])[0].totalCost, 0);
    assert.equal((await save({ ...body, grnPrice: null, expectedPrice: 30, expectedGrnPrice: 12 })).status, 200);
    assert.equal((await database.query('SELECT grn_price FROM items WHERE id=$1', [itemId])).rows[0].grn_price, null);
    assert.equal(stockPricingRows([{ ...item, grnPrice: null }], [{ ...line, type: 'item receipt' }], [])[0].totalCost, 15);
  } finally { delete globalThis.__transferTestUser; }
});

test('company stock pricing lists only its inventories and saves selected prices atomically', async () => {
  const { GET, PATCH } = await vite.ssrLoadModule('/app/api/stock-pricing/route.ts');
  const company = (await database.query("INSERT INTO companies (name, base_currency) VALUES ('Batch prices', 'USD') RETURNING id")).rows[0].id;
  const location = (await database.query("INSERT INTO inventory_locations (company_id, code, name, invoice_prefix) VALUES ($1, 'BP', 'Batch', 'BP') RETURNING id", [company])).rows[0].id;
  const ids = (await database.query("INSERT INTO items (company_id, location_id, sku, name, sales_price, quantity) VALUES ($1, $2, 'BP1', 'First', 10, 1), ($1, $2, 'BP2', 'Second', 20, 2) RETURNING id", [company, location])).rows.map(r => r.id);
  const zeroStockId = (await database.query("INSERT INTO items (company_id, location_id, sku, name, sales_price, quantity) VALUES ($1, $2, 'BP-ZERO', 'Zero stock', 30, 0) RETURNING id", [company, location])).rows[0].id;
  const records = ids.map((itemId, i) => ({ itemId, companyId: company, salesPrice: 100, grnPrice: 50, expectedPrice: (i + 1) * 10, expectedGrnPrice: null }));
  const save = records => PATCH(new Request('http://localhost/api/stock-pricing', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ records }) }));
  const get = id => GET(new Request(`http://localhost/api/stock-pricing?companyId=${id}`));
  try {
    globalThis.__transferTestUser = { id: 1, role: 'admin', companyIds: [company] };
    const data = await (await get(company)).json();
    assert.deepEqual(data.records.map(r => r.id), ids);
    assert.ok(data.records.every(r => r.homeCurrency === 'USD' && r.companyId === company));
    assert.equal((await get(company + 1)).status, 403);
    assert.equal((await save([])).status, 400);
    assert.equal((await save([records[0], records[0]])).status, 400);
    assert.equal((await save([records[0], { ...records[1], expectedPrice: 999 }])).status, 409);
    assert.equal((await database.query('SELECT sales_price FROM items WHERE id=$1', [ids[0]])).rows[0].sales_price, 10);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM audit_log WHERE company_id=$1', [company])).rows[0].n, 0);
    assert.equal((await save(records)).status, 200);
    assert.ok((await database.query('SELECT sales_price, grn_price FROM items WHERE id = ANY($1::int[])', [ids])).rows.every(r => r.sales_price === 100 && r.grn_price === 50));
    assert.deepEqual((await database.query('SELECT sales_price, grn_price FROM items WHERE id=$1', [zeroStockId])).rows[0], { sales_price: 30, grn_price: null });
    globalThis.__transferTestUser = { id: 1, role: 'inventory', companyIds: [company] };
    assert.equal((await get(company)).status, 403);
    assert.equal((await save(records)).status, 403);
  } finally { delete globalThis.__transferTestUser; }
});

test('stock selection capability is limited to admin and all-admin', async () => {
  const { GET } = await vite.ssrLoadModule('/app/api/inventory-overview/route.ts');
  try {
    for (const role of ['all_admin', 'admin', 'accountant', 'sales', 'purchasing', 'inventory', 'viewer']) {
      globalThis.__transferTestUser = { id: 1, role, companyIds: [] };
      const response = await GET(new Request('http://localhost/api/inventory-overview'));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).canSelectItems, ['all_admin', 'admin'].includes(role));
    }
  } finally { delete globalThis.__transferTestUser; }
});

test('purchase to sale inventory lifecycle blocks shortages and safely reverses stock and latest cost', async () => {
  const { POST, DELETE } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const companyId = (await database.query("INSERT INTO companies (name) VALUES ('Stock lifecycle') RETURNING id")).rows[0].id;
  const locationId = (await database.query("INSERT INTO inventory_locations (company_id, code, name, invoice_prefix) VALUES ($1, 'LIFE', 'Lifecycle', 'LIFE') RETURNING id", [companyId])).rows[0].id;
  const itemId = (await database.query("INSERT INTO items (company_id, location_id, sku, name, quantity, cost) VALUES ($1, $2, 'LIFE', 'Laptop', 0, 20) RETURNING id", [companyId, locationId])).rows[0].id;
  const request = (method, body) => new Request('https://app.test/api/records', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const create = (type, quantity, extra = {}) => POST(request('POST', { kind: 'transactions', companyId, locationId, type, party: 'Lifecycle party', number: `LIFE-${type}`, transactionDate: '2026-09-12', currency: 'USD', exchangeRate: 3.675, account: type === 'bill' ? 'Purchases' : 'Sales Revenue', lines: [{ itemId, description: 'Laptop', quantity, unitPrice: 100, unitCost: 20, vatCode: 'ZERO' }], ...extra }));
  const stock = async () => (await database.query('SELECT quantity, last_purchase_price FROM items WHERE id=$1', [itemId])).rows[0];
  const remove = id => DELETE(request('DELETE', { kind: 'transactions', companyId, id }));
  const billResponse = await create('bill', 10); assert.equal(billResponse.status, 201);
  const bill = (await billResponse.json()).record;
  assert.deepEqual(await stock(), { quantity: 10, last_purchase_price: 367.5 });
  const orderResponse = await create('sales order', 3); assert.equal(orderResponse.status, 201);
  const order = (await orderResponse.json()).record;
  assert.equal((await stock()).quantity, 10);
  const invoiceResponse = await create('invoice', 3, { sourceTransactionId: order.id }); assert.equal(invoiceResponse.status, 201);
  const invoice = (await invoiceResponse.json()).record;
  assert.equal((await stock()).quantity, 7);
  assert.equal((await create('invoice', 3, { sourceTransactionId: order.id })).status, 409);
  assert.equal((await create('invoice', 8)).status, 409);
  assert.equal((await stock()).quantity, 7);
  assert.equal((await remove(bill.id)).status, 409);
  assert.equal((await stock()).quantity, 7);
  assert.equal((await database.query('SELECT count(*)::int AS n FROM transactions WHERE id=$1', [bill.id])).rows[0].n, 1);
  assert.equal((await remove(invoice.id)).status, 200);
  assert.equal((await stock()).quantity, 10);
  const secondResponse = await create('bill', 2, { exchangeRate: 4 }); assert.equal(secondResponse.status, 201);
  const second = (await secondResponse.json()).record;
  assert.equal((await stock()).last_purchase_price, 400);
  assert.equal((await remove(second.id)).status, 200);
  assert.deepEqual(await stock(), { quantity: 10, last_purchase_price: 367.5 });
  assert.equal((await remove(bill.id)).status, 200);
  assert.deepEqual(await stock(), { quantity: 0, last_purchase_price: 20 });
});

test("unpaid bill lookup scopes vendor, currency, inventory and company and excludes closed documents", async () => {
  const company = (await database.query("INSERT INTO companies (name) VALUES ('Unpaid lookup') RETURNING id")).rows[0].id;
  const other = (await database.query("INSERT INTO companies (name) VALUES ('Unpaid other') RETURNING id")).rows[0].id;
  const location = async (companyId, code) => (await database.query("INSERT INTO inventory_locations (company_id, code, name, invoice_prefix) VALUES ($1, $2, $2, $2) RETURNING id", [companyId, code])).rows[0].id;
  const source = await location(company, 'UNPAID-A'), second = await location(company, 'UNPAID-B'), foreign = await location(other, 'UNPAID-C');
  const cases = [
    ['OPEN', company, source, 'Vendor A', 'AED', 'bill', 'open'],
    ['OVERDUE', company, source, 'Vendor A', 'AED', 'received item bill', 'overdue'],
    ['PAID', company, source, 'Vendor A', 'AED', 'bill', 'paid'],
    ['VOID', company, source, 'Vendor A', 'AED', 'bill', 'void'],
    ['DRAFT', company, source, 'Vendor A', 'AED', 'bill', 'draft'],
    ['ORDER', company, source, 'Vendor A', 'AED', 'purchase order', 'open'],
    ['CURRENCY', company, source, 'Vendor A', 'USD', 'bill', 'open'],
    ['VENDOR', company, source, 'Vendor B', 'AED', 'bill', 'open'],
    ['INVENTORY', company, second, 'Vendor A', 'AED', 'bill', 'open'],
    ['COMPANY', other, foreign, 'Vendor A', 'AED', 'bill', 'open'],
  ];
  for (const values of cases) await database.query("INSERT INTO transactions (number, company_id, location_id, party, currency, type, status, transaction_date, total, base_total) VALUES ($1,$2,$3,$4,$5,$6,$7,'2026-09-12',100,367)", values);
  const { GET } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const read = (changes = {}) => GET(new Request('https://app.test/api/records?' + new URLSearchParams({ kind: 'unpaid-bills', companyId: String(company), locationId: String(source), party: 'Vendor A', currency: 'AED', ...changes })));
  const response = await read();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { records } = await response.json();
  assert.deepEqual(records.map((r) => r.number), ['OPEN', 'OVERDUE']);
  assert.equal(records[0].total, 100);
  assert.equal((await read({ locationId: String(foreign) })).status, 400);
  assert.equal((await read({ party: '' })).status, 400);
  try {
    globalThis.__transferTestUser = { id: 1, role: 'admin', companyIds: [other] };
    assert.equal((await read()).status, 403);
  } finally { delete globalThis.__transferTestUser; }
});

test('bill payments credit the selected currency bank and preserve the sales rep', async () => {
  const companyId = (await database.query("INSERT INTO companies (name) VALUES ('Bill bank test') RETURNING id")).rows[0].id;
  const otherId = (await database.query("INSERT INTO companies (name) VALUES ('Other bill bank company') RETURNING id")).rows[0].id;
  await database.query("INSERT INTO accounts (company_id, code, name, type, system_role, currency, active) VALUES ($1, 'B1', 'Default Bank', 'Bank', 'BANK', 'AED', true), ($1, 'B2', 'Selected USD Bank', 'Bank', NULL, 'USD', true), ($1, 'B3', 'Closed Bank', 'Bank', NULL, 'AED', false), ($1, 'E1', 'Expense only', 'Expense', 'EXPENSE', 'AED', true), ($2, 'B4', 'Foreign Company Bank', 'Bank', 'BANK', 'AED', true)", [companyId, otherId]);
  await database.query("INSERT INTO contacts (company_id, type, name, currency, balance) VALUES ($1, 'vendor', 'Payment Customer', 'USD', 100)", [companyId]);
  const { POST } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const pay = (account) => POST(new Request('https://app.test/api/records', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'transactions', companyId, type: 'bill payment', salesman: 'Rep One', account, number: 'PAY-SELECTED', party: 'Payment Customer', currency: 'USD', exchangeRate: 3.675, transactionDate: '2026-09-11', lines: [{ description: 'Payment received', quantity: 1, unitPrice: 100, unitCost: 0, vatCode: 'ZERO' }] }) }));
  for (const account of ['', 'Missing Bank', 'Closed Bank', 'Expense only', 'Foreign Company Bank', 'Default Bank']) assert.equal((await pay(account)).status, 400);
  assert.equal((await database.query('SELECT count(*)::int AS n FROM transactions WHERE company_id = $1', [companyId])).rows[0].n, 0);
  const response = await pay('Selected USD Bank');
  assert.equal(response.status, 201);
  const record = (await response.json()).record;
  assert.equal(record.account, 'Selected USD Bank');
  assert.equal(record.salesman, 'Rep One');
  const lines = (await database.query('SELECT jl.account_name, jl.debit, jl.credit FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id WHERE je.transaction_id = $1 ORDER BY jl.id', [record.id])).rows;
  assert.deepEqual(lines, [{ account_name: 'Accounts Payable', debit: 367.5, credit: 0 }, { account_name: 'Selected USD Bank', debit: 0, credit: 367.5 }]);
  assert.equal((await database.query('SELECT balance FROM contacts WHERE company_id = $1', [companyId])).rows[0].balance, 0);
});

test('selected bill payments track partial balances, prevent overpayment and reverse on edit and delete', async () => {
  const companyId = (await database.query("INSERT INTO companies (name) VALUES ('Bill allocation test') RETURNING id")).rows[0].id;
  const locationId = (await database.query("INSERT INTO inventory_locations (company_id, code, name, invoice_prefix) VALUES ($1, 'ALLOC', 'Allocation', 'ALLOC') RETURNING id", [companyId])).rows[0].id;
  await database.query("INSERT INTO accounts (company_id, code, name, type, system_role, currency) VALUES ($1, 'BANK', 'Allocation Bank', 'Bank', 'BANK', 'USD'), ($1, 'AP', 'Allocation AP', 'Accounts Payable', 'AP', 'USD')", [companyId]);
  await database.query("INSERT INTO contacts (company_id, type, name, currency, balance) VALUES ($1, 'vendor', 'Allocation Vendor', 'USD', 100)", [companyId]);
  const billId = (await database.query("INSERT INTO transactions (company_id, location_id, number, type, party, transaction_date, total, base_total, currency, exchange_rate) VALUES ($1,$2,'ALLOC-BILL','bill','Allocation Vendor','2026-09-12',100,367.5,'USD',3.675) RETURNING id", [companyId, locationId])).rows[0].id;
  const { POST, GET, PATCH, DELETE } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const request = (method, body) => new Request('https://app.test/api/records', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const payload = (amount, changes = {}) => ({ kind: 'transactions', companyId, locationId, type: 'bill payment', billId, account: 'Allocation Bank', number: 'ALLOC-PAY', party: 'Allocation Vendor', currency: 'USD', exchangeRate: 3.675, transactionDate: '2026-09-12', lines: [{ description: 'Selected bill', quantity: 1, unitPrice: amount, unitCost: 0, vatCode: 'ZERO' }], ...changes });
  const unpaid = async () => (await (await GET(new Request('https://app.test/api/records?' + new URLSearchParams({ kind:'unpaid-bills',companyId:String(companyId),locationId:String(locationId),party:'Allocation Vendor',currency:'USD' })))).json()).records;
  const status = async () => (await database.query('SELECT status FROM transactions WHERE id=$1', [billId])).rows[0].status;
  assert.equal((await POST(request('POST', payload(40, { party: 'Wrong Vendor' })))).status, 400);
  const first = await POST(request('POST', payload(40))); assert.equal(first.status, 201);
  const firstId = (await first.json()).record.id;
  assert.equal(await status(), 'partially paid'); assert.equal((await unpaid())[0].remaining, 60);
  assert.equal((await POST(request('POST', payload(61)))).status, 409);
  assert.equal((await DELETE(request('DELETE', { kind:'transactions',companyId,id:billId }))).status, 409);
  const second = await POST(request('POST', payload(60))); assert.equal(second.status, 201);
  const secondId = (await second.json()).record.id;
  assert.equal(await status(), 'paid'); assert.equal((await unpaid()).length, 0);
  const detail = await (await GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${companyId}&id=${firstId}`))).json();
  const edited = await PATCH(request('PATCH', payload(20, { id:firstId, revision:detail.revision }))); assert.equal(edited.status, 200);
  assert.equal(await status(), 'partially paid'); assert.equal((await unpaid())[0].remaining, 20);
  assert.equal((await DELETE(request('DELETE', { kind:'transactions',companyId,id:secondId }))).status, 200);
  assert.equal((await unpaid())[0].remaining, 80);
  assert.equal((await DELETE(request('DELETE', { kind:'transactions',companyId,id:firstId }))).status, 200);
  assert.equal((await unpaid())[0].remaining, 100);
  assert.equal((await database.query('SELECT balance FROM contacts WHERE company_id=$1', [companyId])).rows[0].balance, 100);
});

test('selected customer payments track partial balances and timestamp full settlement', async () => {
  const companyId = (await database.query("INSERT INTO companies (name) VALUES ('Invoice allocation test') RETURNING id")).rows[0].id;
  const locationId = (await database.query("INSERT INTO inventory_locations (company_id, code, name, invoice_prefix) VALUES ($1, 'ALLOC', 'Allocation', 'ALLOC') RETURNING id", [companyId])).rows[0].id;
  await database.query("INSERT INTO accounts (company_id, code, name, type, system_role, currency) VALUES ($1, 'BANK', 'Allocation Bank', 'Bank', 'BANK', 'USD'), ($1, 'AR', 'Allocation AR', 'Accounts Receivable', 'AR', 'USD')", [companyId]);
  await database.query("INSERT INTO contacts (company_id, type, name, currency, balance) VALUES ($1, 'customer', 'Allocation Customer', 'USD', 100)", [companyId]);
  const invoiceId = (await database.query("INSERT INTO transactions (company_id, location_id, number, type, party, transaction_date, total, base_total, currency, exchange_rate) VALUES ($1,$2,'ALLOC-BILL','invoice','Allocation Customer','2026-09-12',100,367.5,'USD',3.675) RETURNING id", [companyId, locationId])).rows[0].id;
  const { POST, GET, DELETE } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const request = (method, body) => new Request('https://app.test/api/records', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const payload = (amount, changes = {}) => ({ kind: 'transactions', companyId, locationId, type: 'customer payment', invoiceId, account: 'Allocation Bank', number: 'ALLOC-PAY', party: 'Allocation Customer', currency: 'USD', exchangeRate: 3.675, transactionDate: '2026-09-12', lines: [{ description: 'Selected invoice', quantity: 1, unitPrice: amount, unitCost: 0, vatCode: 'ZERO' }], ...changes });
  const unpaid = async () => (await (await GET(new Request('https://app.test/api/records?' + new URLSearchParams({ kind:'unpaid-invoices',companyId:String(companyId),locationId:String(locationId),party:'Allocation Customer',currency:'USD' })))).json()).records;
  const status = async () => (await database.query('SELECT status FROM transactions WHERE id=$1', [invoiceId])).rows[0].status;
  assert.equal((await POST(request('POST', payload(40, { party: 'Wrong Customer' })))).status, 400);
  const first = await POST(request('POST', payload(40))); assert.equal(first.status, 201);
  const firstRecord = (await first.json()).record;
  const firstId = firstRecord.id;
  assert.equal(firstRecord.status, 'paid');
  assert.ok(firstRecord.paidAt);
  assert.equal(await status(), 'partially paid'); assert.equal((await unpaid())[0].remaining, 60);
  assert.equal((await POST(request('POST', payload(61)))).status, 409);
  assert.equal((await DELETE(request('DELETE', { kind:'transactions',companyId,id:invoiceId }))).status, 409);
  const second = await POST(request('POST', payload(60))); assert.equal(second.status, 201);
  const secondId = (await second.json()).record.id;
  assert.equal(await status(), 'paid'); assert.equal((await unpaid()).length, 0);
  const paidAt = (await database.query('SELECT paid_at FROM transactions WHERE id=$1', [invoiceId])).rows[0].paid_at;
  assert.ok(paidAt);
  assert.ok(Math.abs(Date.now() - new Date(paidAt).getTime()) < 60000);
  assert.equal((await DELETE(request('DELETE', { kind:'transactions',companyId,id:secondId }))).status, 200);
  assert.equal((await unpaid())[0].remaining, 60);
  assert.equal((await database.query('SELECT paid_at FROM transactions WHERE id=$1', [invoiceId])).rows[0].paid_at, null);
  assert.equal((await DELETE(request('DELETE', { kind:'transactions',companyId,id:firstId }))).status, 200);
  assert.equal((await unpaid())[0].remaining, 100);
  assert.equal((await database.query('SELECT balance FROM contacts WHERE company_id=$1', [companyId])).rows[0].balance, 100);
});

test('one customer payment allocates multiple invoices atomically and reverses every allocation', async () => {
  const companyId = (await database.query("INSERT INTO companies (name) VALUES ('Multi invoice test') RETURNING id")).rows[0].id;
  const locationId = (await database.query("INSERT INTO inventory_locations (company_id, code, name, invoice_prefix) VALUES ($1, 'MULTI', 'Multi', 'MULTI') RETURNING id", [companyId])).rows[0].id;
  await database.query("INSERT INTO accounts (company_id, code, name, type, system_role, currency) VALUES ($1, 'BANK', 'Multi Bank', 'Bank', 'BANK', 'USD'), ($1, 'AR', 'Multi AR', 'Accounts Receivable', 'AR', 'USD')", [companyId]);
  await database.query("INSERT INTO contacts (company_id, type, name, currency, balance) VALUES ($1, 'customer', 'Multi Customer', 'USD', 300)", [companyId]);
  const invoice = async (number, date, total) => (await database.query("INSERT INTO transactions (company_id, location_id, number, type, party, transaction_date, total, base_total, currency, exchange_rate) VALUES ($1,$2,$3,'invoice','Multi Customer',$4,$5,$5::double precision*3.675,'USD',3.675) RETURNING id", [companyId, locationId, number, date, total])).rows[0].id;
  const newer = await invoice('NEWER', '2026-09-12', 200);
  const older = await invoice('OLDER', '2026-09-11', 100);
  const { POST, DELETE } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const request = (method, body) => new Request('https://app.test/api/records', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const pay = (amount, ids = [newer, older]) => POST(request('POST', { kind:'transactions',companyId,locationId,type:'customer payment',invoiceIds:JSON.stringify(ids),account:'Multi Bank',number:'MULTI-PAY',party:'Multi Customer',currency:'USD',exchangeRate:3.675,transactionDate:'2026-09-12',lines:[{description:'Multiple invoices',quantity:1,unitPrice:amount,vatCode:'ZERO'}] }));
  assert.equal((await pay(301)).status, 409);
  assert.equal((await pay(100, [older, older])).status, 400);
  assert.equal((await pay(100, [older, 999999])).status, 400);
  assert.equal((await database.query('SELECT count(*)::int AS count FROM invoice_payment_allocations a JOIN transactions t ON t.id=a.payment_id WHERE t.company_id=$1', [companyId])).rows[0].count, 0);
  const response = await pay(150); assert.equal(response.status, 201);
  const paymentId = (await response.json()).record.id;
  const allocations = (await database.query('SELECT invoice_id, amount FROM invoice_payment_allocations WHERE payment_id=$1 ORDER BY amount DESC', [paymentId])).rows;
  assert.deepEqual(allocations, [{invoice_id:older,amount:100},{invoice_id:newer,amount:50}]);
  const states = async () => (await database.query('SELECT id,status,paid_at FROM transactions WHERE id IN ($1,$2) ORDER BY id', [newer,older])).rows;
  assert.equal((await states())[0].status, 'partially paid');
  assert.equal((await states())[1].status, 'paid');
  assert.ok((await states())[1].paid_at);
  assert.equal((await DELETE(request('DELETE', {kind:'transactions',companyId,id:older}))).status, 409);
  const full = await pay(150, [newer]); assert.equal(full.status, 201);
  const fullId = (await full.json()).record.id;
  assert.equal((await states())[0].status, 'paid');
  assert.equal((await DELETE(request('DELETE', {kind:'transactions',companyId,id:paymentId}))).status, 200);
  assert.ok((await states()).every((row) => row.status !== 'paid' && row.paid_at === null));
  assert.equal((await database.query('SELECT balance FROM contacts WHERE company_id=$1', [companyId])).rows[0].balance, 150);
  assert.equal((await DELETE(request('DELETE', {kind:'transactions',companyId,id:fullId}))).status, 200);
});

test('partial PO receipts retain remaining quantities, block overreceipt and reverse safely', async () => {
  const companyId = (await database.query("INSERT INTO companies (name) VALUES ('Partial receipts') RETURNING id")).rows[0].id;
  const locationId = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES ($1,'PR','Receiving','PR') RETURNING id",[companyId])).rows[0].id;
  const itemId = (await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity,cost) VALUES ($1,$2,'PR','Laptop',0,20) RETURNING id",[companyId,locationId])).rows[0].id;
  const { POST, GET, DELETE } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const request = (method, body) => new Request('https://app.test/api/records',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const base = {kind:'transactions',companyId,locationId,party:'Receiving vendor',currency:'USD',exchangeRate:3.675,transactionDate:'2026-09-12'};
  const poResponse = await POST(request('POST',{...base,type:'purchase order',number:'PO-PART',lines:[{itemId,description:'Laptop',quantity:50,unitPrice:100,unitCost:20,vatCode:'ZERO'}]}));
  assert.equal(poResponse.status,201); const po = (await poResponse.json()).record;
  const read = async () => (await (await GET(new Request('https://app.test/api/records?kind=po-receiving&companyId='+companyId+'&orderId='+po.id))).json());
  const openOrders = async (party = base.party, company = companyId) => {
    const response = await GET(new Request('https://app.test/api/records?kind=open-purchase-orders&companyId='+company+'&party='+encodeURIComponent(party)));
    assert.equal(response.status, 200);
    return (await response.json()).orders;
  };
  assert.deepEqual((await openOrders()).map((order) => order.id), [po.id]);
  assert.equal((await openOrders('Different vendor')).length, 0);
  assert.equal((await openOrders(base.party, companyId + 10000)).length, 0);
  const line = (await read()).lines[0];
  const receive = (quantity, changes={}) => POST(request('POST',{...base,type:'item receipt',purchaseOrderId:po.id,lines:[{orderLineId:line.id,quantity,unitPrice:1}],...changes}));
  const stock = async () => (await database.query('SELECT quantity FROM items WHERE id=$1',[itemId])).rows[0].quantity;
  assert.equal(await stock(),0);
  const first = await receive(20); assert.equal(first.status,201); const firstRecord = (await first.json()).record;
  assert.equal(firstRecord.total,2000);
  assert.equal(await stock(),20);
  assert.equal((await read()).order.status,'partially received');
  assert.deepEqual((await openOrders()).map((order) => order.id), [po.id]);
  assert.equal((await read()).lines[0].remaining,30);
  assert.equal((await receive(31)).status,409);
  assert.equal((await receive(1,{lines:[{orderLineId:line.id,quantity:1},{orderLineId:line.id,quantity:1}]})).status,400);
  assert.equal((await POST(request('POST',{...base,type:'bill',sourceTransactionId:po.id}))).status,409);
  assert.equal((await DELETE(request('DELETE',{kind:'transactions',companyId,id:po.id}))).status,409);
  const last = await receive(30); assert.equal(last.status,201); const lastRecord = (await last.json()).record;
  assert.equal(await stock(),50);
  assert.equal((await read()).order.status,'received');
  assert.equal((await openOrders()).length, 0);
  assert.equal((await read()).lines[0].remaining,0);
  assert.equal((await receive(1)).status,409);
  assert.equal((await DELETE(request('DELETE',{kind:'transactions',companyId,id:lastRecord.id}))).status,200);
  assert.equal((await read()).order.status,'partially received');
  assert.deepEqual((await openOrders()).map((order) => order.id), [po.id]);
  assert.equal((await read()).lines[0].remaining,30);
  assert.equal(await stock(),20);
  assert.equal((await DELETE(request('DELETE',{kind:'transactions',companyId,id:firstRecord.id}))).status,200);
  assert.equal((await read()).order.status,'open');
  assert.equal((await read()).lines[0].remaining,50);
});

test('partial PO bills keep orders open until fully received and restore quantities on deletion', async () => {
  const companyId = (await database.query("INSERT INTO companies (name) VALUES ('Partial bills') RETURNING id")).rows[0].id;
  const locationId = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES ($1,'PR','Receiving','PR') RETURNING id",[companyId])).rows[0].id;
  const itemId = (await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity,cost) VALUES ($1,$2,'PR','Laptop',0,20) RETURNING id",[companyId,locationId])).rows[0].id;
  const { POST, GET, DELETE } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const request = (method, body) => new Request('https://app.test/api/records',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const base = {kind:'transactions',companyId,locationId,party:'Receiving vendor',currency:'USD',exchangeRate:3.675,transactionDate:'2026-09-12'};
  const poResponse = await POST(request('POST',{...base,type:'purchase order',number:'PO-PART',lines:[{itemId,description:'Laptop',quantity:50,unitPrice:100,unitCost:20,vatCode:'ZERO'}]}));
  assert.equal(poResponse.status,201); const po = (await poResponse.json()).record;
  const read = async () => (await (await GET(new Request('https://app.test/api/records?kind=po-receiving&companyId='+companyId+'&orderId='+po.id))).json());
  const openOrders = async (party = base.party, company = companyId) => {
    const response = await GET(new Request('https://app.test/api/records?kind=open-purchase-orders&companyId='+company+'&party='+encodeURIComponent(party)));
    assert.equal(response.status, 200);
    return (await response.json()).orders;
  };
  assert.deepEqual((await openOrders()).map((order) => order.id), [po.id]);
  assert.equal((await openOrders('Different vendor')).length, 0);
  assert.equal((await openOrders(base.party, companyId + 10000)).length, 0);
  const line = (await read()).lines[0];
  const receive = (quantity, changes={}) => POST(request('POST',{...base,type:'bill',purchaseOrderId:po.id,lines:[{orderLineId:line.id,quantity,unitPrice:1,comments:"PO bill comment",serialNumber:"PO-SN-1\nPO-SN-2"}],...changes}));
  const stock = async () => (await database.query('SELECT quantity FROM items WHERE id=$1',[itemId])).rows[0].quantity;
  assert.equal(await stock(),0);
  const first = await receive(20); assert.equal(first.status,201); const firstRecord = (await first.json()).record;
  assert.equal(firstRecord.total,2000);
  assert.deepEqual((await database.query("SELECT comments,serial_number FROM transaction_lines WHERE transaction_id=$1",[firstRecord.id])).rows[0],{comments:"PO bill comment",serial_number:"PO-SN-1\nPO-SN-2"});
  assert.equal(await stock(),20);
  assert.equal((await read()).order.status,'partially received');
  assert.deepEqual((await openOrders()).map((order) => order.id), [po.id]);
  assert.equal((await read()).lines[0].remaining,30);
  assert.equal((await receive(31)).status,409);
  assert.equal((await receive(1,{lines:[{orderLineId:line.id,quantity:1},{orderLineId:line.id,quantity:1}]})).status,400);
  assert.equal((await POST(request('POST',{...base,type:'bill',sourceTransactionId:po.id}))).status,409);
  assert.equal((await DELETE(request('DELETE',{kind:'transactions',companyId,id:po.id}))).status,409);
  const last = await receive(30); assert.equal(last.status,201); const lastRecord = (await last.json()).record;
  assert.equal(await stock(),50);
  assert.equal((await read()).order.status,'received');
  assert.equal((await openOrders()).length, 0);
  assert.equal((await read()).lines[0].remaining,0);
  assert.equal((await receive(1)).status,409);
  assert.equal((await DELETE(request('DELETE',{kind:'transactions',companyId,id:lastRecord.id}))).status,200);
  assert.equal((await read()).order.status,'partially received');
  assert.deepEqual((await openOrders()).map((order) => order.id), [po.id]);
  assert.equal((await read()).lines[0].remaining,30);
  assert.equal(await stock(),20);
  assert.equal((await DELETE(request('DELETE',{kind:'transactions',companyId,id:firstRecord.id}))).status,200);
  assert.equal((await read()).order.status,'open');
  assert.equal((await read()).lines[0].remaining,50);
});

test('PO receipts target selected inventory, reuse SKU and reverse only destination stock', async () => {
  const companyId = (await database.query("INSERT INTO companies(name) VALUES ('Receipt destinations') RETURNING id")).rows[0].id;
  const otherCompany = (await database.query("INSERT INTO companies(name) VALUES ('Other receipt company') RETURNING id")).rows[0].id;
  const location = async (company, code) => (await database.query('INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES ($1,$2,$2,$2) RETURNING id',[company,code])).rows[0].id;
  const source = await location(companyId,'PO-SRC'); const destination = await location(companyId,'PO-DST'); const foreign = await location(otherCompany,'PO-OTHER');
  const itemId = (await database.query("INSERT INTO items(company_id,location_id,sku,item_number,name,quantity,cost,hs_code) VALUES ($1,$2,'PO-DEST-SKU','PO-DEST-NO','Laptop',5,20,'847130') RETURNING id",[companyId,source])).rows[0].id;
  const { POST, GET, DELETE } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const request = (method, body) => new Request('https://app.test/api/records',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const base = {kind:'transactions',companyId,locationId:source,party:'Destination vendor',currency:'USD',exchangeRate:3.675,transactionDate:'2026-09-12'};
  const poResponse = await POST(request('POST',{...base,type:'purchase order',number:'PO-DEST',lines:[{itemId,description:'Laptop',quantity:10,unitPrice:100,unitCost:20,vatCode:'ZERO'}]}));
  assert.equal(poResponse.status,201); const po = (await poResponse.json()).record;
  const read = async () => (await (await GET(new Request('https://app.test/api/records?kind=po-receiving&companyId='+companyId+'&orderId='+po.id))).json());
  const data = await read(); const orderLineId = data.lines[0].id;
  assert.deepEqual(data.locations.map(l=>l.id).sort((a,b)=>a-b),[source,destination].sort((a,b)=>a-b));
  const receive = (locationId, quantity) => POST(request('POST',{...base,type:'item receipt',purchaseOrderId:po.id,locationId,lines:[{orderLineId,quantity}]}));
  assert.equal((await receive(foreign,3)).status,400);
  assert.equal((await receive(0,3)).status,400);
  const first = await receive(destination,3); assert.equal(first.status,201); const firstRecord=(await first.json()).record;
  assert.equal(firstRecord.locationId,destination);
  const stock = async () => (await database.query('SELECT id,location_id,quantity,sku,hs_code,last_purchase_price FROM items WHERE company_id=$1 ORDER BY location_id',[companyId])).rows;
  let rows=await stock(); assert.equal(rows.length,2); assert.equal(rows.find(r=>r.location_id===source).quantity,5); assert.equal(rows.find(r=>r.location_id===destination).quantity,3); assert.equal(rows.find(r=>r.location_id===destination).hs_code,'847130'); assert.equal(rows.find(r=>r.location_id===destination).last_purchase_price,367.5);
  assert.equal((await database.query('SELECT location_id FROM journal_entries WHERE transaction_id=$1',[firstRecord.id])).rows[0].location_id,destination);
  assert.equal((await receive(destination,8)).status,409);
  const second = await receive(destination,2); assert.equal(second.status,201);
  assert.equal((await receive(source,5)).status,201);
  assert.equal((await read()).order.status,'received');
  rows=await stock(); assert.equal(rows.length,2); assert.equal(rows.find(r=>r.location_id===destination).quantity,5); assert.equal(rows.find(r=>r.location_id===source).quantity,10);
  assert.equal((await DELETE(request('DELETE',{kind:'transactions',companyId,id:firstRecord.id}))).status,200);
  assert.equal((await read()).lines[0].remaining,3); assert.equal((await read()).order.status,'partially received');
  rows=await stock(); assert.equal(rows.find(r=>r.location_id===destination).quantity,2); assert.equal(rows.find(r=>r.location_id===source).quantity,10);
});

for (const sourceType of ['estimate', 'proforma invoice', 'sales order']) test(`${sourceType} invoices available stock in parts, keeps balances and reverses safely`, async () => {
  const companyId=(await database.query('INSERT INTO companies(name) VALUES ($1) RETURNING id',['Partial '+sourceType])).rows[0].id;
  const otherCompany=(await database.query("INSERT INTO companies(name) VALUES ($1) RETURNING id", ["Unrelated " + sourceType])).rows[0].id;
  const location=async(company,code)=>(await database.query('INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES ($1,$2,$2,$2) RETURNING id',[company,code])).rows[0].id;
  const sourceLocation=await location(companyId,'SRC'); const destination=await location(companyId,'DST'); const foreign=await location(otherCompany,'OTHER');
  const item=async(locationId,qty)=>(await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity,cost) VALUES ($1,$2,'PARTIAL-SALE','Laptop',$3,73.5) RETURNING id",[companyId,locationId,qty])).rows[0].id;
  const sourceItem=await item(sourceLocation,5); const destinationItem=await item(destination,3);
  await database.query("INSERT INTO contacts(company_id,type,name,currency) VALUES ($1,'customer','Partial customer','USD')",[companyId]);
  const { POST, GET, PATCH, DELETE }=await vite.ssrLoadModule('/app/api/records/route.ts');
  const request=(method,body)=>new Request('https://app.test/api/records',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const base={kind:'transactions',companyId,locationId:sourceLocation,party:'Partial customer',currency:'USD',exchangeRate:3.675,transactionDate:'2026-09-12'};
  const originalLine={itemId:sourceItem,description:'Laptop',quantity:10,unitPrice:100,unitCost:20,vatCode:'STANDARD'};
  let response=await POST(request('POST',{...base,type:sourceType,number:'PARTIAL',lines:[originalLine]})); assert.equal(response.status,201);
  const source=(await response.json()).record;
  const available = async (party = base.party, company = companyId) => {
    const response = await GET(new Request('https://app.test/api/records?kind=open-sales-documents&companyId='+company+'&party='+encodeURIComponent(party)));
    assert.equal(response.status, 200);
    return (await response.json()).documents;
  };
  assert.deepEqual((await available()).map((row) => row.id), [source.id]);
  assert.equal((await available('Unrelated customer')).length, 0);
  assert.equal((await available(base.party, otherCompany)).length, 0);

  assert.equal((await database.query('SELECT count(*)::int AS count FROM journal_entries WHERE transaction_id=$1',[source.id])).rows[0].count, 0);
  assert.equal((await database.query('SELECT quantity FROM items WHERE id=$1',[sourceItem])).rows[0].quantity, 5);
  assert.equal((await database.query('SELECT balance FROM contacts WHERE company_id=$1',[companyId])).rows[0].balance, 0);
  const detail=async()=>(await (await GET(new Request('https://app.test/api/records?kind=transactions&companyId='+companyId+'&id='+source.id))).json());
  const read=async(locationId=destination)=>(await (await GET(new Request('https://app.test/api/records?kind=sales-invoicing&companyId='+companyId+'&sourceId='+source.id+'&locationId='+locationId))).json());
  const initial=await read(); const sourceLineId=initial.lines[0].id;
  assert.equal(initial.lines[0].remaining,10); assert.equal(initial.lines[0].available,3); assert.equal(initial.lines[0].stockItemId,destinationItem); assert.equal(initial.locations.length,2);
  const invoice=(quantity,changes={})=>POST(request('POST',{...base,locationId:destination,type:'invoice',salesSourceId:source.id,lines:[{sourceLineId,quantity,unitPrice:1,itemId:sourceItem}],...changes}));
  const stock=async(id)=>(await database.query('SELECT quantity FROM items WHERE id=$1',[id])).rows[0].quantity;
  assert.equal((await invoice(4,{allowNegativeStock:true})).status,409);
  assert.equal((await invoice(1,{locationId:foreign})).status,400);
  assert.equal((await invoice(1,{transactionDate:'2026-02-30'})).status,400);
  assert.equal((await invoice(1,{lines:[{sourceLineId,quantity:1},{sourceLineId,quantity:1}]})).status,400);
  response=await invoice(3,{lines:[{sourceLineId,quantity:3,comments:"Source invoice item",serialNumber:"SOURCE-1"}]});assert.equal(response.status,201); const first=(await response.json()).record;
  assert.deepEqual((await database.query('SELECT comments,serial_number FROM transaction_lines WHERE transaction_id=$1',[first.id])).rows[0],{comments:'Source invoice item',serial_number:'SOURCE-1'});
  assert.equal(first.total,315);assert.equal(first.currency,'USD');assert.equal(first.salesSourceId,source.id);assert.equal(first.sourceTransactionId,null);
  assert.equal(await stock(destinationItem),0); assert.equal(await stock(sourceItem),5);
  assert.deepEqual((await available()).map((row) => row.id), [source.id]);assert.equal((await read()).source.status,'partially invoiced');assert.equal((await read()).lines[0].remaining,7);
  assert.equal((await database.query('SELECT location_id FROM journal_entries WHERE transaction_id=$1',[first.id])).rows[0].location_id,destination);
  assert.equal((await database.query('SELECT unit_cost FROM transaction_lines WHERE transaction_id=$1',[first.id])).rows[0].unit_cost,20);
  assert.equal((await POST(request('POST',{...base,type:'invoice',sourceTransactionId:source.id}))).status,409);
  assert.equal((await DELETE(request('DELETE',{kind:'transactions',companyId,id:source.id}))).status,409);
  let current=await detail();
  assert.equal((await PATCH(request('PATCH',{...base,id:source.id,type:sourceType,number:'CHANGED',revision:current.revision,lines:[originalLine]}))).status,409);
  await database.query('UPDATE items SET quantity=10 WHERE id=$1',[destinationItem]);
  assert.equal((await invoice(8)).status,409);
  response=await invoice(7);assert.equal(response.status,201);const last=(await response.json()).record;
  assert.notEqual(last.number,first.number);assert.equal((await available()).length,0);assert.equal((await read()).source.status,'invoiced');assert.equal((await read()).lines[0].remaining,0);assert.equal((await read()).invoices.length,2);
  assert.equal((await invoice(1)).status,409);
  assert.equal((await DELETE(request('DELETE',{kind:'transactions',companyId,id:last.id}))).status,200);
  assert.deepEqual((await available()).map((row) => row.id), [source.id]);
  assert.equal((await read()).lines[0].remaining,7);assert.equal(await stock(destinationItem),10);
  assert.equal((await DELETE(request('DELETE',{kind:'transactions',companyId,id:first.id}))).status,200);
  assert.equal((await read()).source.status,'open');assert.equal((await read()).lines[0].remaining,10);assert.equal(await stock(sourceItem),5);assert.equal(await stock(destinationItem),13);
  assert.equal((await database.query("SELECT balance FROM contacts WHERE company_id=$1 AND name='Partial customer'",[companyId])).rows[0].balance,0);
  current=await detail();
  const edited={...base,id:source.id,type:sourceType,number:'EDITED',revision:current.revision,lines:[originalLine]};
  try {
    globalThis.__transferTestUser={id:2,role:'sales',companyIds:[companyId]};
    assert.equal((await PATCH(request('PATCH',edited))).status,403);
    globalThis.__transferTestUser={id:3,role:'admin',companyIds:[otherCompany]};
    assert.equal((await GET(new Request('https://app.test/api/records?kind=sales-invoicing&companyId='+companyId+'&sourceId='+source.id))).status,403);
    assert.equal((await invoice(1)).status,403);
  } finally {delete globalThis.__transferTestUser;}
  assert.equal((await PATCH(request('PATCH',edited))).status,200);
  assert.equal((await DELETE(request('DELETE',{kind:'transactions',companyId,id:source.id}))).status,200);
});

test("SKU reservations exclude other users across workflows only in the same inventory, and release/expiry are enforced", async () => {
  const company = (await database.query("INSERT INTO companies (name) VALUES ('SKU lock test') RETURNING id")).rows[0].id;
  const location = async (code) => (await database.query("INSERT INTO inventory_locations (company_id,code,name,invoice_prefix) VALUES ($1,$2,$2,$2) RETURNING id", [company, code])).rows[0].id;
  const main = await location('LOCK-MAIN'), other = await location('LOCK-OTHER');
  const addItem = async (loc, sku) => (await database.query("INSERT INTO items (company_id,location_id,sku,name,quantity,cost,sales_price) VALUES ($1,$2,$3,$3,10,5,10) RETURNING id", [company, loc, sku])).rows[0].id;
  const first = await addItem(main, 'SHARED-SKU'), second = await addItem(other, 'SHARED-SKU'), unrelated = await addItem(main, 'ANOTHER-SKU');
  const lockApi = await vite.ssrLoadModule('/app/api/sku-locks/route.ts');
  const pricing = await vite.ssrLoadModule('/app/api/stock-pricing/route.ts');
  const records = await vite.ssrLoadModule('/app/api/records/route.ts');
  const transfers = await vite.ssrLoadModule('/app/api/transfers/route.ts');
  const tokenA = '11111111-1111-4111-8111-111111111111', tokenB = '22222222-2222-4222-8222-222222222222';
  const request = (path, method, payload, token) => new Request(`https://app.test/api/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { 'X-SKU-Lock': token } : {}) }, body: JSON.stringify(payload) });
  const reserve = (itemId, token, renew = false) => lockApi.POST(request('sku-locks', 'POST', { token, renew, input: { resource: 'records', kind: 'items', id: itemId } }));
  const release = (token) => lockApi.DELETE(request('sku-locks', 'DELETE', { token }));
  const price = (itemId, token) => pricing.PATCH(request('stock-pricing', 'PATCH', { companyId: company, itemId, salesPrice: 12, expectedPrice: 10, grnPrice: null, expectedGrnPrice: null }, token));
  const user = (id, companyIds = [company], role = 'admin') => { globalThis.__transferTestUser = { id, role, companyIds, email: `user${id}@example.test` }; };
  try {
    user(1);
    assert.equal((await reserve(first, tokenA)).status, 200);
    assert.equal((await reserve(first, tokenA, true)).status, 200, 'owner heartbeat succeeds');
    assert.equal((await lockApi.POST(request('sku-locks', 'POST', { token: tokenA, input: { resource: 'stock-pricing', records: [{ itemId: first }, { itemId: unrelated }] } }))).status, 200);
    user(2);
    assert.equal((await reserve(unrelated, tokenB)).status, 409, 'adding a selection preserves both reservations');
    user(1);
    assert.equal((await reserve(first, tokenA)).status, 200, 'removing a selection releases only that SKU');

    user(2);
    assert.equal((await reserve(first, tokenB)).status, 409);
    assert.equal((await price(first)).status, 409, 'direct API save cannot bypass a lease');
    assert.equal((await price(first, tokenA)).status, 409, 'another user cannot impersonate the owner token');
    assert.equal((await records.DELETE(request('records', 'DELETE', { kind: 'items', id: first, companyId: company }))).status, 409);
    assert.equal((await records.POST(request('records', 'POST', { kind: 'transactions', type: 'estimate', companyId: company, locationId: main, lines: [{ itemId: first, quantity: 1 }] }))).status, 409);
    assert.equal((await transfers.POST(request('transfers', 'POST', { lines: [{ itemId: second, sourceLocationId: other, destinationLocationId: main, quantity: 1 }] }))).status, 409, 'destination SKU is protected');
    assert.equal((await release(tokenA)).status, 200);
    assert.equal((await reserve(first, tokenB)).status, 409, 'non-owner release changes nothing');
    assert.equal((await reserve(second, tokenB)).status, 200, 'same SKU in a different inventory remains available');
    assert.equal((await price(second, tokenB)).status, 200);
    await release(tokenB);
    assert.equal((await reserve(unrelated, tokenB)).status, 200, 'another SKU in same inventory remains available');
    await release(tokenB);
    const batch = await lockApi.POST(request('sku-locks', 'POST', { token: tokenB, input: { resource: 'stock-pricing', records: [{ itemId: unrelated }, { itemId: first }] } }));
    assert.equal(batch.status, 409);
    assert.equal((await database.query('SELECT * FROM sku_work_locks WHERE token=$1', [tokenB])).rows.length, 0, 'failed batch does not leave partial reservations');
    user(3, []);
    assert.equal((await reserve(first, tokenB)).status, 403);
    user(3, [company], 'viewer');
    assert.equal((await reserve(first, tokenB)).status, 403);
    user(1);
    assert.equal((await price(first, tokenA)).status, 200, 'owning editor can save');
    await release(tokenA);
    user(2);
    assert.equal((await reserve(first, tokenB)).status, 200, 'Cancel releases the item for the next user');
    await database.query("UPDATE sku_work_locks SET expires_at=now()-interval '1 second' WHERE token=$1", [tokenB]);
    assert.equal((await reserve(first, tokenB, true)).status, 409, 'expired heartbeat cannot silently revive stale edits');
    user(1);
    assert.equal((await reserve(first, tokenA)).status, 200, 'abandoned lease can be reclaimed after expiry');
    user(2);
    assert.equal((await price(first, tokenB)).status, 409, 'stale editor cannot save after handover');
    const result = (await database.query('SELECT quantity,sales_price FROM items WHERE id=$1', [first])).rows[0];
    assert.deepEqual(result, { quantity: 10, sales_price: 12 });
  } finally {
    user(1); await release(tokenA); user(2); await release(tokenB);
    delete globalThis.__transferTestUser;
  }
});

test("invoice and customer payment details can be edited without changing posted amounts, allocations or paid stamps", async () => {
  const company = (await database.query("INSERT INTO companies(name) VALUES ('Sales details test') RETURNING id")).rows[0].id;
  const location = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES ($1,'DETAIL','Details','DETAIL') RETURNING id", [company])).rows[0].id;
  const item = (await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity,cost) VALUES ($1,$2,'EDIT-INV','Laptop',8,5) RETURNING id", [company,location])).rows[0].id;
  await database.query("INSERT INTO contacts(company_id,type,name,status) VALUES ($1,'employee','Sales Person','active')", [company]);
  const document = async (type, number, status='open') => (await database.query("INSERT INTO transactions(company_id,location_id,type,number,party,transaction_date,status,total,base_total,subtotal,vat_amount) VALUES ($1,$2,$3,$4,'Customer','2026-09-01',$5,20,20,20,0) RETURNING id", [company,location,type,number,status])).rows[0].id;
  const source = await document('estimate','EST-DETAIL','invoiced');
  const invoice = await document('invoice','INV-DETAIL','paid');
  const payment = await document('customer payment','PAY-DETAIL');
  await database.query("UPDATE transactions SET sales_source_id=$1,paid_at='2026-09-02T10:00:00Z' WHERE id=$2", [source,invoice]);
  const line = async (id) => (await database.query("INSERT INTO transaction_lines(transaction_id,item_id,description,quantity,unit_price,unit_cost,subtotal,total) VALUES ($1,$2,'Laptop',2,10,5,20,20) RETURNING id", [id,item])).rows[0].id;
  const sourceLine = await line(source); await line(invoice);
  await database.query("INSERT INTO sales_invoice_allocations(invoice_id,source_line_id,quantity) VALUES ($1,$2,2)", [invoice,sourceLine]);
  await database.query("INSERT INTO invoice_payment_allocations(payment_id,invoice_id,amount) VALUES ($1,$2,20)", [payment,invoice]);
  for (const id of [invoice,payment]) await database.query("INSERT INTO journal_entries(company_id,location_id,transaction_id,entry_date,reference) VALUES ($1,$2,$3,'2026-09-01','OLD')", [company,location,id]);
  await database.query("INSERT INTO inventory_movements(item_id,transaction_id,movement_date,movement_type,quantity,unit_cost,reference) VALUES ($1,$2,'2026-09-01','invoice',-2,5,'INV-DETAIL')", [item,invoice]);
  const { GET, PATCH } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const load = async (id) => (await (await GET(new Request(`https://app.test/api/records?kind=transactions&id=${id}&companyId=${company}`))).json());
  const edit = (id, revision, changes={}) => PATCH(new Request('https://app.test/api/records', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({kind:'transactions',id,companyId:company,editMode:'details',revision,number:`EDITED-${id}`,transactionDate:'2026-09-03',dueDate:'2026-09-30',salesman:'Sales Person',memo:'Corrected details',...changes}) }));
  try {
    for (const id of [invoice,payment]) {
      globalThis.__transferTestUser = { id:1,role:'admin',companyIds:[company] };
      const before = await load(id);
      globalThis.__transferTestUser = { id:2,role:'sales',companyIds:[company] };
      assert.equal((await edit(id,before.revision)).status,403);
      globalThis.__transferTestUser = { id:2,role:'admin',companyIds:[] };
      assert.equal((await edit(id,before.revision)).status,403);
      globalThis.__transferTestUser = { id:1,role:'all_admin',companyIds:[] };
      assert.equal((await edit(id,before.revision,{total:1})).status,400,'financial changes are rejected');
      assert.equal((await edit(id,before.revision,{transactionDate:'2026-02-30'})).status,400);
      assert.equal((await edit(id,before.revision)).status,200);
      assert.equal((await edit(id,before.revision)).status,409,'stale edits are rejected');
      const after = await load(id);
      for (const field of ['total','baseTotal','currency','exchangeRate','status','paidAt','salesSourceId','invoiceId','party','locationId']) assert.deepEqual(after.record[field],before.record[field],field);
      assert.deepEqual(after.lines,before.lines,'posted lines remain intact');
      assert.equal(after.record.memo,'Corrected details');
      const journal=(await database.query('SELECT reference,entry_date FROM journal_entries WHERE transaction_id=$1',[id])).rows[0];
      assert.deepEqual(journal,{reference:`EDITED-${id}`,entry_date:'2026-09-03'});
    }
    assert.equal((await database.query('SELECT quantity FROM items WHERE id=$1',[item])).rows[0].quantity,8);
    assert.equal((await database.query('SELECT amount FROM invoice_payment_allocations WHERE payment_id=$1',[payment])).rows[0].amount,20);
    assert.equal((await database.query('SELECT quantity FROM sales_invoice_allocations WHERE invoice_id=$1',[invoice])).rows[0].quantity,2);
    assert.deepEqual((await database.query('SELECT reference,movement_date,quantity FROM inventory_movements WHERE transaction_id=$1',[invoice])).rows[0],{reference:`EDITED-${invoice}`,movement_date:'2026-09-03',quantity:-2});
  } finally { delete globalThis.__transferTestUser; }
});

test("inventory removal requires company admin access and preserves used inventories and the last active location", async () => {
  const { DELETE } = await vite.ssrLoadModule('/app/api/workspaces/route.ts');
  const company = (await database.query("INSERT INTO companies(name) VALUES ('Remove inventory test') RETURNING id")).rows[0].id;
  const add = async (code) => (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES ($1,$2,$2,$2) RETURNING id",[company,code])).rows[0].id;
  const main = await add('REMOVE-MAIN'), empty = await add('REMOVE-EMPTY'), used = await add('REMOVE-USED');
  const remove = (id) => DELETE(new Request('https://app.test/api/workspaces',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'location',companyId:company,locationId:id})}));
  try {
    for (const role of ['viewer','sales','inventory','purchasing','accountant']) {
      globalThis.__transferTestUser={id:1,role,companyIds:[company]};
      assert.equal((await remove(empty)).status,403);
    }
    globalThis.__transferTestUser={id:1,role:'admin',companyIds:[]};
    assert.equal((await remove(empty)).status,403);
    globalThis.__transferTestUser={id:1,role:'admin',companyIds:[company]};
    await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity) VALUES ($1,$2,'KEEP','Keep even zero stock',0)",[company,used]);
    assert.equal((await remove(used)).status,409);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM items WHERE location_id=$1',[used])).rows[0].n,1);
    const history = await add('REMOVE-HISTORY');
    await database.query("INSERT INTO transactions(company_id,location_id,type,number,party,transaction_date) VALUES ($1,$2,'estimate','KEEP-EST','Customer','2026-09-12')",[company,history]);
    assert.equal((await remove(history)).status,409);
    assert.equal((await remove(empty)).status,200);
    assert.equal((await database.query('SELECT id FROM inventory_locations WHERE id=$1',[empty])).rows.length,0);
    assert.equal((await database.query("SELECT id FROM audit_log WHERE entity_type='inventory' AND entity_id=$1",[empty])).rows.length,1);
    assert.equal((await remove(empty)).status,404);
    await database.query('UPDATE inventory_locations SET active=false WHERE company_id=$1 AND id<>$2',[company,main]);
    assert.equal((await remove(main)).status,409);
    const another = await add('REMOVE-ALL-ADMIN');
    globalThis.__transferTestUser={id:2,role:'all_admin',companyIds:[]};
    assert.equal((await remove(another)).status,200);
  } finally { delete globalThis.__transferTestUser; }
});

test("company deletion is restricted to all-admin and requires exact confirmation", async () => {
  const { DELETE } = await vite.ssrLoadModule('/app/api/workspaces/route.ts');
  const target = (await database.query("INSERT INTO companies(name) VALUES ('Delete Company Test') RETURNING id")).rows[0].id;
  const targetLocation = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES ($1,'DELETE','Delete inventory','DELETE') RETURNING id", [target])).rows[0].id;
  await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity) VALUES ($1,$2,'DELETE-SKU','Delete item',1)", [target,targetLocation]);
  const other = (await database.query("INSERT INTO companies(name) VALUES ('Delete Company Keep') RETURNING id")).rows[0].id;
  const otherLocation = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES ($1,'KEEP-CO','Keep inventory','KEEP-CO') RETURNING id", [other])).rows[0].id;
  await database.query("INSERT INTO stock_transfers(reference,source_company_id,source_location_id,destination_company_id,destination_location_id,sku,item_name,quantity,transfer_date) VALUES ('DELETE-BLOCK',$1,$2,$3,$4,'DELETE-SKU','Delete item',1,'2026-09-20')", [target,targetLocation,other,otherLocation]);
  const remove = (confirmName) => DELETE(new Request('https://app.test/api/workspaces',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'company',companyId:target,confirmName})}));
  try {
    globalThis.__transferTestUser={id:1,role:'admin',companyIds:[target]};
    assert.equal((await remove('Delete Company Test')).status,403);
    globalThis.__transferTestUser={id:2,role:'all_admin',companyIds:[]};
    assert.equal((await remove('Wrong name')).status,400);
    assert.equal((await remove('Delete Company Test')).status,200);
    assert.equal((await database.query("SELECT id FROM stock_transfers WHERE reference='DELETE-BLOCK'")).rows.length,0);
    assert.equal((await database.query('SELECT id FROM companies WHERE id=$1',[target])).rows.length,0);
    assert.equal((await database.query('SELECT id FROM companies WHERE id=$1',[other])).rows.length,1);
    assert.equal((await database.query('SELECT id FROM inventory_locations WHERE company_id=$1',[target])).rows.length,0);
    assert.equal((await database.query('SELECT id FROM items WHERE company_id=$1',[target])).rows.length,0);
  } finally { delete globalThis.__transferTestUser; }
});

test("account history scopes posted ledger entries to the account company, aggregates split lines and paginates", async () => {
  const { GET } = await vite.ssrLoadModule('/app/api/account-history/route.ts');
  const company = (await database.query("INSERT INTO companies(name,base_currency) VALUES ('Account history test','AED') RETURNING id")).rows[0].id;
  const other = (await database.query("INSERT INTO companies(name) VALUES ('Other history') RETURNING id")).rows[0].id;
  const account = (await database.query("INSERT INTO accounts(company_id,code,name,type,currency) VALUES ($1,'HIST','History Bank','Bank','USD') RETURNING id",[company])).rows[0].id;
  const foreignAccount = (await database.query("INSERT INTO accounts(company_id,code,name,type) VALUES ($1,'HIST','History Bank','Bank') RETURNING id",[other])).rows[0].id;
  const location = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES ($1,'HIST','History warehouse','HIST') RETURNING id",[company])).rows[0].id;
  const source = (await database.query("INSERT INTO transactions(company_id,location_id,type,number,party,transaction_date,memo) VALUES ($1,$2,'customer payment','PAY-HISTORY','History Customer','2026-09-12','Payment memo') RETURNING id",[company,location])).rows[0].id;
  await database.query("INSERT INTO journal_entries(company_id,location_id,entry_date,reference) SELECT $1,$2,'2026-09-11','HIST-' || n FROM generate_series(1,50) n",[company,location]);
  await database.query("INSERT INTO journal_lines(journal_entry_id,account_name,debit,credit) SELECT id,'History Bank',10,0 FROM journal_entries WHERE company_id=$1",[company]);
  const newest = (await database.query("INSERT INTO journal_entries(company_id,location_id,transaction_id,entry_date,reference) VALUES ($1,$2,$3,'2026-09-12','PAY-HISTORY') RETURNING id",[company,location,source])).rows[0].id;
  await database.query("INSERT INTO journal_lines(journal_entry_id,account_name,debit,credit) VALUES ($1,'History Bank',2,0),($1,'History Bank',3,0),($1,'Other Account',0,5)",[newest]);
  const hidden = (await database.query("INSERT INTO journal_entries(company_id,entry_date,reference,posted) VALUES ($1,'2026-09-13','DRAFT',false),($2,'2026-09-13','FOREIGN',true) RETURNING id",[company,other])).rows;
  for (const row of hidden) await database.query("INSERT INTO journal_lines(journal_entry_id,account_name,debit) VALUES ($1,'History Bank',999)",[row.id]);
  const read = (id=account,page=1) => GET(new Request(`https://app.test/api/account-history?companyId=${company}&accountId=${id}&page=${page}`));
  try {
    globalThis.__transferTestUser={id:1,role:'accountant',companyIds:[company]};
    const response = await read(); assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    const data = await response.json();
    assert.equal(data.total,51); assert.equal(data.rows.length,50); assert.equal(data.currency,'AED');
    assert.equal(data.rows[0].id,newest); assert.equal(Number(data.rows[0].debit),5); assert.equal(Number(data.rows[0].credit),0);
    assert.equal(data.rows[0].transaction_id,source); assert.equal(data.rows[0].memo,'Payment memo'); assert.equal(data.rows[0].inventory,'History warehouse');
    const second = await (await read(account,2)).json(); assert.equal(second.rows.length,1);
    assert.ok(!data.rows.some((row)=>row.id===second.rows[0].id));
    assert.equal((await read(foreignAccount)).status,404);
    assert.equal((await read(account,0)).status,400);
    globalThis.__transferTestUser={id:1,role:'admin',companyIds:[]}; assert.equal((await read()).status,403);
    globalThis.__transferTestUser={id:1,role:'sales',companyIds:[company]}; assert.equal((await read()).status,403);
    globalThis.__transferTestUser={id:1,role:'all_admin',companyIds:[]}; assert.equal((await read()).status,200);
  } finally { delete globalThis.__transferTestUser; }
});

test('receivable postings match document company and currency even when customer defaults differ', async () => {
  const companyId = (await database.query("INSERT INTO companies (name) VALUES ('AR currency audit') RETURNING id")).rows[0].id;
  const locationId = (await database.query("INSERT INTO inventory_locations(company_id,name,code,invoice_prefix) VALUES ($1,'Audit stock','AUD','AUD') RETURNING id", [companyId])).rows[0].id;
  const arId = (await database.query("INSERT INTO accounts(company_id,code,name,type,system_role,currency) VALUES ($1,'AR-AED','Audit AED Receivable','Accounts Receivable','AR','AED') RETURNING id",[companyId])).rows[0].id;
  await database.query("INSERT INTO accounts(company_id,code,name,type,system_role,currency) VALUES ($1,'BANK-USD','Audit USD Bank','Bank','BANK','USD')",[companyId]);
  await database.query("INSERT INTO contacts(company_id,name,type,currency,ledger_account_id) VALUES ($1,'Audit Customer','customer','AED',$2)",[companyId,arId]);
  const { POST } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const save = async (type, currency = 'USD') => {
    const response = await POST(new Request('https://app.test/api/records',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'transactions',companyId,locationId,type,party:'Audit Customer',currency,exchangeRate:currency==='USD'?3.675:1,account:type==='customer payment'?'Audit USD Bank':'Sales Revenue',lines:[{description:'AR audit',quantity:1,unitPrice:100,vatCode:'ZERO'}]})}));
    assert.equal(response.status,201,JSON.stringify(await response.clone().json()));
    const record=(await response.json()).record;
    return (await database.query("SELECT jl.account_name,jl.debit,jl.credit FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id JOIN accounts a ON a.name=jl.account_name AND a.company_id=je.company_id WHERE je.transaction_id=$1 AND a.type='Accounts Receivable'",[record.id])).rows;
  };
  for(const type of ['invoice','customer payment','credit memo','statement charge','finance charge']) {
    const lines=await save(type);assert.equal(lines.length,1);assert.equal(lines[0].account_name,'Accounts Receivable - USD');
    assert.equal(lines[0].debit+lines[0].credit,367.5);
  }
  assert.equal((await save('invoice','AED'))[0].account_name,'Audit AED Receivable');
  assert.equal((await database.query("SELECT count(*)::int n FROM accounts WHERE company_id=$1 AND system_role='AR' AND currency='USD'",[companyId])).rows[0].n,1);
  assert.equal((await database.query("SELECT ledger_account_id FROM contacts WHERE company_id=$1",[companyId])).rows[0].ledger_account_id,arId);
  await database.query("UPDATE accounts SET type='Bank' WHERE company_id=$1 AND system_role='AR' AND currency='USD'",[companyId]);
  const before=(await database.query('SELECT count(*)::int n FROM transactions WHERE company_id=$1',[companyId])).rows[0].n;
  const blocked=await POST(new Request('https://app.test/api/records',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'transactions',companyId,locationId,type:'invoice',party:'Audit Customer',currency:'USD',exchangeRate:3.675,lines:[{description:'AR audit',quantity:1,unitPrice:100,vatCode:'ZERO'}]})}));
  assert.equal(blocked.status,409);
  assert.equal((await database.query('SELECT count(*)::int n FROM transactions WHERE company_id=$1',[companyId])).rows[0].n,before);

});

test('P&L posting uses home-currency revenue and blocks wrongly classified linked accounts atomically', async () => {
  const companyId = (await database.query("INSERT INTO companies (name,base_currency) VALUES ('P&L links','AED') RETURNING id")).rows[0].id;
  const locationId = (await database.query("INSERT INTO inventory_locations (company_id,code,name,invoice_prefix) VALUES ($1,'PNL','PNL','PNL') RETURNING id",[companyId])).rows[0].id;
  await database.query("INSERT INTO accounts (company_id,code,name,type,system_role,currency) VALUES ($1,'4001','Home Sales','Income','SALES','AED'),($1,'4002','USD Sales','Income','SALES','USD')", [companyId]);
  const { POST } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const save = () => POST(new Request('https://app.test/api/records',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'transactions',companyId,locationId,type:'invoice',party:'P&L customer',currency:'USD',exchangeRate:3.675,lines:[{description:'Service',quantity:1,unitPrice:100,vatCode:'ZERO'}]})}));
  const good = await save(); assert.equal(good.status,201,JSON.stringify(await good.clone().json()));
  const id = (await good.json()).record.id;
  const rows = (await database.query("SELECT jl.account_name,jl.credit FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id WHERE je.transaction_id=$1 AND jl.credit>0", [id])).rows;
  assert.equal(rows[0].account_name,'Home Sales'); assert.equal(rows[0].credit,367.5);
  await database.query("UPDATE accounts SET type='Bank' WHERE company_id=$1 AND name='Home Sales'",[companyId]);
  const bad = await save(); assert.equal(bad.status,409); assert.match((await bad.json()).error,/must use account type Income/);
  assert.equal((await database.query('SELECT count(*)::int n FROM transactions WHERE company_id=$1',[companyId])).rows[0].n,1);
  assert.equal((await database.query('SELECT count(*)::int n FROM journal_entries WHERE company_id=$1',[companyId])).rows[0].n,1);
});

test('bank transfers save as paid and legacy open transfers display paid without clearing cancelled records', async () => {
  const companyId = (await database.query("INSERT INTO companies (name) VALUES ('Transfer paid status') RETURNING id")).rows[0].id;
  const locationId = (await database.query("INSERT INTO inventory_locations (company_id,code,name,invoice_prefix) VALUES ($1,'TP','TP','TP') RETURNING id",[companyId])).rows[0].id;
  await database.query("INSERT INTO accounts (company_id,code,name,type) VALUES ($1,'1001','Transfer From','Bank'),($1,'1002','Transfer To','Bank')",[companyId]);
  const { POST, GET } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const result = await POST(new Request('https://app.test/api/records',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'transactions',companyId,locationId,type:'transfer',account:'Transfer From',party:'Transfer To',currency:'AED',exchangeRate:1,lines:[{description:'Transfer',quantity:1,unitPrice:100,vatCode:'ZERO'}]})}));
  assert.equal(result.status,201,JSON.stringify(await result.clone().json()));
  const {record}=await result.json(); assert.equal(record.status,'paid'); assert.ok(record.paidAt);
  const balances=(await database.query('SELECT jl.debit,jl.credit FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id WHERE je.transaction_id=$1',[record.id])).rows;
  assert.equal(balances.reduce((n,r)=>n+r.debit,0),100); assert.equal(balances.reduce((n,r)=>n+r.credit,0),100);
  const read=async()=> (await (await GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${companyId}&id=${record.id}`))).json()).record;
  await database.query("UPDATE transactions SET status='open',paid_at=NULL WHERE id=$1",[record.id]); assert.equal((await read()).status,'paid');
  await database.query("UPDATE transactions SET status='cancelled' WHERE id=$1",[record.id]); assert.equal((await read()).status,'cancelled');
});

test('bill line freight is saved, taxed, edited and attributed to items exactly once', async () => {
  const companyId = (await database.query("INSERT INTO companies (name) VALUES ('Line freight') RETURNING id")).rows[0].id;
  const locationId = (await database.query("INSERT INTO inventory_locations (company_id,code,name,invoice_prefix) VALUES ($1,'FRT','FRT','FRT') RETURNING id",[companyId])).rows[0].id;
  const stock = (await database.query("INSERT INTO items (company_id,location_id,sku,name) VALUES ($1,$2,'F-A','Laptop A'),($1,$2,'F-B','Laptop B') RETURNING id",[companyId,locationId])).rows;
  const {POST,GET,PATCH}=await vite.ssrLoadModule('/app/api/records/route.ts');
  const req=(method,body)=>new Request('https://app.test/api/records',{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const payload={kind:'transactions',companyId,locationId,type:'bill',number:'FREIGHT-1',party:'Freight supplier',transactionDate:'2026-09-13',account:'Purchases',currency:'USD',exchangeRate:2,lines:[{itemId:stock[0].id,description:'Laptop A',quantity:3,unitPrice:100,unitCost:100,freightCharge:10,vatCode:'STANDARD'},{itemId:stock[1].id,description:'Laptop B',quantity:2,unitPrice:50,unitCost:50,freightCharge:20,vatCode:'ZERO'}]};
  const res=await POST(req('POST',payload));assert.equal(res.status,201,JSON.stringify(await res.clone().json()));const {record}=await res.json();
  assert.equal(record.subtotal,430);assert.equal(record.vatAmount,15.5);assert.equal(record.total,445.5);assert.equal(record.baseTotal,891);
  const read=async()=> (await (await GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${companyId}&id=${record.id}`))).json());
  let detail=await read();assert.equal(detail.lines.filter(l=>l.isFreightCharge).length,2);assert.equal(detail.lines.find(l=>l.itemId===stock[0].id).freightCharge,10);
  assert.equal(detail.journal.find(line=>line.accountName==='Inventory Asset')?.debit,860);assert.equal(detail.journal.find(line=>line.accountName==='Purchases'),undefined);
  assert.equal(Number((await database.query('SELECT last_purchase_price FROM items WHERE id=$1',[stock[0].id])).rows[0].last_purchase_price),206.66);
  const {stockPricingRows}=await vite.ssrLoadModule('/lib/stock-pricing.ts');
  const costs=stockPricingRows(stock.map((s,i)=>({...s,locationId,sku:`F-${i}`,name:'Laptop',quantity:10,cost:0,lastPurchasePrice:0,salesPrice:400,itemNumber:null})),detail.lines.map(l=>({...l,transactionId:record.id,type:'bill',date:record.transactionDate,number:record.number,exchangeRate:2})),[]);
  assert.equal(costs[0].freightCost,6.67);assert.equal(costs[1].freightCost,20);
  // API clients may return the generated freight rows; rebuilding must not duplicate them.
  let edited=await PATCH(req('PATCH',{...payload,id:record.id,revision:detail.revision,lines:detail.lines}));assert.equal(edited.status,200,JSON.stringify(await edited.clone().json()));assert.equal((await edited.json()).record.total,445.5);
  detail=await read();
  const lines=detail.lines.filter(l=>!l.isFreightCharge).map(l=>({...l,freightCharge:0}));
  edited=await PATCH(req('PATCH',{...payload,id:record.id,revision:detail.revision,lines}));assert.equal(edited.status,200);assert.equal((await edited.json()).record.total,415);
  detail=await read();assert.equal(detail.lines.filter(l=>l.isFreightCharge).length,0);
  const bad=await PATCH(req('PATCH',{...payload,id:record.id,revision:detail.revision,lines:[{...lines[0],freightCharge:-1}]}));assert.equal(bad.status,400);assert.equal((await read()).record.total,415);
  // Existing freight rows retain their original value and tax when editing older bills.
  edited=await PATCH(req('PATCH',{...payload,id:record.id,revision:detail.revision,lines:[...lines,{description:'Freight Charges',quantity:1,unitPrice:7,unitCost:7,vatCode:'ZERO'}]}));assert.equal(edited.status,200);assert.equal((await edited.json()).record.total,422);
});

test('invoice and bill comments and serial numbers persist and remain editable without changing amounts', async () => {
  const companyId = (await database.query("INSERT INTO companies (name) VALUES ('Document extra fields') RETURNING id")).rows[0].id;
  const locationId = (await database.query("INSERT INTO inventory_locations (company_id,code,name,invoice_prefix) VALUES ($1,'EXTRA','EXTRA','EXTRA') RETURNING id",[companyId])).rows[0].id;
  const {POST,GET,PATCH}=await vite.ssrLoadModule('/app/api/records/route.ts');
  const req=(method,body)=>new Request('https://app.test/api/records',{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  for(const type of ['invoice','bill']) {
    const payload={kind:'transactions',companyId,locationId,type,number:`EXTRA-${type}`,party:'Document party',transactionDate:'2026-09-13',currency:'AED',exchangeRate:1,account:type==='bill'?'Purchases':'Sales Revenue',comments:'Handle with care\nCustomer note',serialNumber:'SN-001\nSN-002',lines:[{description:'Laptop',quantity:1,unitPrice:100,unitCost:0,vatCode:'ZERO'}]};
    const saved=await POST(req('POST',payload));assert.equal(saved.status,201,JSON.stringify(await saved.clone().json()));const {record}=await saved.json();
    const read=async()=> (await (await GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${companyId}&id=${record.id}`))).json());
    let detail=await read();assert.equal(detail.record.comments,payload.comments);assert.equal(detail.record.serialNumber,payload.serialNumber);
    const edit=async(changes)=>PATCH(req('PATCH',{...(type==='invoice'?{kind:'transactions',companyId,number:payload.number,transactionDate:payload.transactionDate,editMode:'details'}:payload),id:record.id,revision:detail.revision,...changes}));
    let edited=await edit({comments:'Revised comments',serialNumber:'SN-003'});assert.equal(edited.status,200,JSON.stringify(await edited.clone().json()));
    detail=await read();assert.equal(detail.record.comments,'Revised comments');assert.equal(detail.record.serialNumber,'SN-003');assert.equal(detail.record.total,100);
    const longText='Long text\n'.repeat(2000);const expanded=await edit({comments:longText,serialNumber:longText});assert.equal(expanded.status,200);detail=await read();assert.equal(detail.record.comments,longText);assert.equal(detail.record.serialNumber,longText);
    edited=await edit({comments:'',serialNumber:''});assert.equal(edited.status,200);detail=await read();assert.equal(detail.record.comments,'');assert.equal(detail.record.serialNumber,'');
    assert.equal(detail.journal.reduce((n,l)=>n+l.debit,0),100);assert.equal(detail.journal.reduce((n,l)=>n+l.credit,0),100);
  }
});

test('invoice line comments and serials stay attached to their lines and edit without reposting', async () => {
  const companyId=(await database.query("INSERT INTO companies (name) VALUES ('Invoice line details') RETURNING id")).rows[0].id;
  const locationId=(await database.query("INSERT INTO inventory_locations (company_id,code,name,invoice_prefix) VALUES ($1,'ILD','ILD','ILD') RETURNING id",[companyId])).rows[0].id;
  const {POST,GET,PATCH}=await vite.ssrLoadModule('/app/api/records/route.ts');
  const req=(method,body)=>new Request('https://app.test/api/records',{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const payload={kind:'transactions',companyId,locationId,type:'invoice',number:'ILD-1',party:'Line customer',transactionDate:'2026-09-13',currency:'AED',exchangeRate:1,account:'Sales Revenue',lines:[{description:'Laptop A',quantity:2,unitPrice:100,vatCode:'STANDARD',comments:'Handle carefully',serialNumber:'A-1\nA-2'},{description:'Laptop B',quantity:1,unitPrice:50,vatCode:'ZERO',comments:'Box sealed',serialNumber:'B-1'}]};
  const saved=await POST(req('POST',payload));assert.equal(saved.status,201,JSON.stringify(await saved.clone().json()));const {record}=await saved.json();
  const read=async()=> (await (await GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${companyId}&id=${record.id}`))).json());
  let detail=await read();const before=detail;
  assert.deepEqual(detail.lines.map(l=>[l.comments,l.serialNumber]),[['Handle carefully','A-1\nA-2'],['Box sealed','B-1']]);
  const edit=(lineDetails,revision=detail.revision)=>PATCH(req('PATCH',{kind:'transactions',companyId,id:record.id,editMode:'details',number:payload.number,transactionDate:payload.transactionDate,revision,lineDetails}));
  let result=await edit([{id:detail.lines[0].id,comments:'Updated',serialNumber:'A-3'}]);assert.equal(result.status,200,JSON.stringify(await result.clone().json()));
  detail=await read();assert.equal(detail.lines[0].comments,'Updated');assert.equal(detail.lines[1].serialNumber,'B-1');assert.equal(detail.record.total,260);assert.deepEqual(detail.journal,before.journal);
  assert.equal((await edit([{id:detail.lines[0].id,comments:'stale'}],before.revision)).status,409);
  for (const invalid of [[{id:99999999,comments:'Wrong line'}],[{id:detail.lines[0].id,unitPrice:0}],[{id:detail.lines[0].id},{id:detail.lines[0].id}]]) assert.equal((await edit(invalid)).status,400);
  assert.equal((await read()).lines[0].comments,'Updated');
  result=await edit([{id:detail.lines[0].id,comments:'',serialNumber:''}]);assert.equal(result.status,200);detail=await read();assert.equal(detail.lines[0].serialNumber,'');assert.equal(detail.lines[0].comments,'');assert.equal(detail.record.total,260);
  const expanded=await POST(req('POST',{...payload,number:'ILD-LONG',lines:[{...payload.lines[0],comments:'c'.repeat(20000),serialNumber:'s'.repeat(20000)}]}));assert.equal(expanded.status,201);const expandedId=(await expanded.json()).record.id;const stored=(await (await GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${companyId}&id=${expandedId}`))).json()).lines[0];assert.equal(stored.comments.length,20000);assert.equal(stored.serialNumber.length,20000);
  const editedLong=await edit([{id:detail.lines[0].id,comments:'e'.repeat(20000),serialNumber:'n'.repeat(20000)}]);assert.equal(editedLong.status,200);detail=await read();assert.equal(detail.lines[0].comments.length,20000);assert.equal(detail.lines[0].serialNumber.length,20000);
});

test('bill item comments and serials persist through edits alongside freight and print detail data', async () => {
  const companyId=(await database.query("INSERT INTO companies (name) VALUES ('Bill line details') RETURNING id")).rows[0].id;
  const locationId=(await database.query("INSERT INTO inventory_locations (company_id,code,name,invoice_prefix) VALUES ($1,'BLD','BLD','BLD') RETURNING id",[companyId])).rows[0].id;
  const {POST,GET,PATCH}=await vite.ssrLoadModule('/app/api/records/route.ts');
  const req=(method,body)=>new Request('https://app.test/api/records',{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const payload={kind:'transactions',companyId,locationId,type:'bill',number:'BLD-1',party:'Supplier',transactionDate:'2026-09-13',currency:'AED',exchangeRate:1,account:'Purchases',lines:[{description:'Laptop A',quantity:2,unitPrice:100,freightCharge:10,vatCode:'ZERO',comments:'Sealed boxes',serialNumber:'A-1\nA-2'},{description:'Laptop B',quantity:1,unitPrice:50,vatCode:'ZERO',comments:'Check charger',serialNumber:'B-1'}]};
  const saved=await POST(req('POST',payload));assert.equal(saved.status,201,JSON.stringify(await saved.clone().json()));const {record}=await saved.json();
  const read=async()=> (await (await GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${companyId}&id=${record.id}`))).json());
  let detail=await read();assert.equal(detail.record.total,260);assert.deepEqual(detail.lines.map(l=>[l.comments,l.serialNumber]),[['Sealed boxes','A-1\nA-2'],['Check charger','B-1'],['','']]);
  const edit=(lines)=>PATCH(req('PATCH',{...payload,id:record.id,revision:detail.revision,lines}));
  let result=await edit(detail.lines.map((l,i)=>i===0?{...l,comments:'Updated',serialNumber:'A-3'}:l));assert.equal(result.status,200,JSON.stringify(await result.clone().json()));
  detail=await read();assert.equal(detail.lines[0].comments,'Updated');assert.equal(detail.lines[0].serialNumber,'A-3');assert.equal(detail.lines[1].serialNumber,'B-1');assert.equal(detail.record.total,260);assert.equal(detail.lines.filter(l=>l.isFreightCharge).length,1);
  assert.equal((await edit(detail.lines.map((l,i)=>i===0?{...l,comments:'x'.repeat(20000),serialNumber:'s'.repeat(20000)}:l))).status,200);detail=await read();assert.equal(detail.lines[0].comments.length,20000);assert.equal(detail.lines[0].serialNumber.length,20000);
  result=await edit(detail.lines.map((l,i)=>i===0?{...l,comments:'',serialNumber:''}:l));assert.equal(result.status,200);detail=await read();assert.equal(detail.lines[0].comments,'');assert.equal(detail.lines[0].serialNumber,'');assert.equal(detail.record.total,260);assert.equal(detail.journal.reduce((n,l)=>n+l.debit,0),260);assert.equal(detail.journal.reduce((n,l)=>n+l.credit,0),260);
  const expanded=await POST(req('POST',{...payload,number:'BLD-LONG',lines:[{...payload.lines[0],serialNumber:'x'.repeat(20000)}]}));assert.equal(expanded.status,201);const expandedId=(await expanded.json()).record.id;const stored=(await (await GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${companyId}&id=${expandedId}`))).json()).lines[0];assert.equal(stored.serialNumber.length,20000);
});

test('serial search links sales and purchases across inventories while isolating companies and literal searches', async () => {
  const companyId=(await database.query("INSERT INTO companies (name) VALUES ('Serial search') RETURNING id")).rows[0].id;
  const other=(await database.query("INSERT INTO companies (name) VALUES ('Other serial company') RETURNING id")).rows[0].id;
  const locationId=(await database.query("INSERT INTO inventory_locations (company_id,code,name,invoice_prefix) VALUES ($1,'SS','Serial inventory','SS') RETURNING id",[companyId])).rows[0].id;
  const otherLocation=(await database.query("INSERT INTO inventory_locations (company_id,code,name,invoice_prefix) VALUES ($1,'OS','Other','OS') RETURNING id",[other])).rows[0].id;
  const {POST}=await vite.ssrLoadModule('/app/api/records/route.ts');
  const {GET}=await vite.ssrLoadModule('/app/api/serial-search/route.ts');
  const ids=[];
  for (const [type,company,location,serial,header] of [['bill',companyId,locationId,'SN-ABC\nSN-DEF',''],['invoice',companyId,locationId,'sn-abc',''],['bill',other,otherLocation,'SN-ABC',''],['invoice',companyId,locationId,'','LEGACY-123'],['bill',companyId,locationId,'SN%_literal','']]) {
    const response=await POST(new Request('https://app.test/api/records',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'transactions',companyId:company,locationId:location,type,party:'Serial party',transactionDate:'2026-09-13',currency:'AED',exchangeRate:1,account:type==='bill'?'Purchases':'Sales Revenue',serialNumber:header,lines:[{description:'Serial laptop',quantity:1,unitPrice:100,vatCode:'ZERO',serialNumber:serial}]})}));
    assert.equal(response.status,201);ids.push((await response.json()).record.id);
  }
  const find=(q,company=companyId)=>GET(new Request(`https://app.test/api/serial-search?companyId=${company}&q=${encodeURIComponent(q)}`));
  let response=await find('sn-abc');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');let data=await response.json();assert.deepEqual(data.results.map(r=>r.id).sort((a,b)=>a-b),ids.slice(0,2));assert.ok(data.results.every(r=>r.scope==='item' && r.description==='Serial laptop' && r.inventory==='Serial inventory'));assert.equal(data.truncated,false);
  data=await (await find('LEGACY')).json();assert.equal(data.results[0].scope,'document');assert.equal(data.results[0].lineId,null);assert.equal(data.results[0].id,ids[3]);
  data=await (await find('%_')).json();assert.deepEqual(data.results.map(r=>r.id),[ids[4]]);
  assert.equal((await (await find('not-found')).json()).results.length,0);assert.equal((await find('')).status,400);assert.equal((await find('x'.repeat(201))).status,400);
  try { globalThis.__transferTestUser={id:1,role:'admin',companyIds:[companyId]};assert.equal((await find('SN-ABC',other)).status,403); } finally { delete globalThis.__transferTestUser; }
});

test('company template settings and two logos persist with company/admin isolation and validation', async () => {
  const companyId=(await database.query("INSERT INTO companies (name) VALUES ('Dual logo company') RETURNING id")).rows[0].id;
  const {GET,PATCH}=await vite.ssrLoadModule('/app/api/company-setup/route.ts');
  const {defaultDocumentDesign,defaultElementProperties,validateDocumentDesign}=await vite.ssrLoadModule('/lib/document-design.ts');
  const get=(id=companyId)=>GET(new Request(`https://app.test/api/company-setup?companyId=${id}`));
  const original=(await (await get()).json()).record;
  const logo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  const design=structuredClone(defaultDocumentDesign);design.enabled=true;design.title='Custom Invoice';design.columns.reverse();design.columns.find(c=>c.key==='serialNumber').print=false;design.message='Thank you';design.orientation='landscape';
  design.properties.title={...defaultElementProperties,align:'center',vertical:'middle',bold:true,fill:true,background:'#aabbcc',top:true,pattern:'double',thickness:3,radius:12};
  const {savedTemplates: ignored,...snapshot}=structuredClone(design);void ignored;
  design.savedTemplates=[{id:'company-copy',design:snapshot}];
  const payload={...original,companyId,bankCurrency:'AED',logoData:logo,rightLogoData:logo,documentDesign:JSON.stringify(design)};
  const patch=body=>PATCH(new Request('https://app.test/api/company-setup',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
  let response=await patch(payload);assert.equal(response.status,200,JSON.stringify(await response.clone().json()));let saved=(await (await get()).json()).record;assert.equal(saved.logoData,logo);assert.equal(saved.rightLogoData,logo);assert.deepEqual(JSON.parse(saved.documentDesign),design);
  response=await patch({...payload,rightLogoData:'data:image/svg+xml;base64,abc'});assert.equal(response.status,400);
  response=await patch({...payload,documentDesign:JSON.stringify({...design,font:'bad;css'})});assert.equal(response.status,400);
  assert.throws(()=>validateDocumentDesign(JSON.stringify({...design,columns:[design.columns[0],...design.columns.slice(1).map(()=>design.columns[0])]})));
  assert.throws(()=>validateDocumentDesign(JSON.stringify({...design,margin:100})));
  assert.throws(()=>validateDocumentDesign(JSON.stringify({...design,columns:design.columns.map(c=>({...c,print:false}))})));
  response=await patch({...payload,documentDesign:JSON.stringify({...design,properties:{title:{...design.properties.title,background:'url(unsafe)'}}})});assert.equal(response.status,400);
  response=await patch({...payload,documentDesign:JSON.stringify({...design,savedTemplates:[{id:'nested',design}]})});assert.equal(response.status,400);
  // Old clients omit new fields; both settings must survive.
  const legacy={...payload};delete legacy.rightLogoData;delete legacy.documentDesign;
  assert.equal((await patch(legacy)).status,200);saved=(await (await get()).json()).record;assert.equal(saved.rightLogoData,logo);assert.deepEqual(JSON.parse(saved.documentDesign),design);
  try {
    globalThis.__transferTestUser={id:1,email:'admin@test',role:'admin',companyIds:[]};assert.equal((await get()).status,403);assert.equal((await patch(payload)).status,403);
    globalThis.__transferTestUser={id:1,email:'user@test',role:'sales',companyIds:[companyId]};assert.equal((await patch(payload)).status,403);
    globalThis.__transferTestUser={id:1,email:'admin@test',role:'admin',companyIds:[companyId]};assert.equal((await patch({...payload,rightLogoData:''})).status,200);assert.equal((await (await get()).json()).record.rightLogoData,'');
  } finally {delete globalThis.__transferTestUser;}
});

test('login branding selects one company and protects the shared sign-in page setting', async () => {
  const first = (await database.query("INSERT INTO companies (name) VALUES ('Login Brand One') RETURNING id")).rows[0].id;
  const second = (await database.query("INSERT INTO companies (name) VALUES ('Login Brand Two') RETURNING id")).rows[0].id;
  const { GET, PATCH } = await vite.ssrLoadModule('/app/api/company-setup/route.ts');
  const original = async companyId => (await (await GET(new Request(`https://app.test/api/company-setup?companyId=${companyId}`))).json()).record;
  const save = (body) => PATCH(new Request('https://app.test/api/company-setup', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const firstSetup = { ...(await original(first)), bankCurrency: 'AED' }, secondSetup = { ...(await original(second)), bankCurrency: 'AED' };
  const background = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  try {
    assert.equal((await save({ ...firstSetup, companyId: first, loginBranding: true, loginLogoData: background, loginCompanyLogoData: background, loginDisplayName: 'ComNet International', loginCopyrightYears: '1996-2021', loginBackgroundData: background, loginBackgroundColor: '#123456' })).status, 200);
    assert.equal((await original(first)).loginBackgroundData, background);
    assert.equal((await original(first)).loginLogoData, background);
    assert.equal((await original(first)).loginCompanyLogoData, background);
    assert.equal((await original(first)).loginDisplayName, 'ComNet International');
    assert.equal((await save({ ...secondSetup, companyId: second, loginBranding: true })).status, 200);
    assert.deepEqual((await database.query('SELECT id FROM companies WHERE login_branding=true')).rows.map(row => row.id), [second]);
    assert.equal((await save({ ...firstSetup, companyId: first, loginBackgroundData: 'data:image/svg+xml;base64,abc' })).status, 400);
    assert.equal((await save({ ...firstSetup, companyId: first, loginBackgroundColor: 'red' })).status, 400);
    globalThis.__transferTestUser = { id: 7, email: 'admin@test', role: 'admin', companyIds: [first] };
    assert.equal((await save({ ...firstSetup, companyId: first, loginBranding: true })).status, 403);
    assert.equal((await save({ ...firstSetup, companyId: first, loginBackgroundColor: '#112233' })).status, 200);
    assert.deepEqual((await database.query('SELECT id FROM companies WHERE login_branding=true')).rows.map(row => row.id), [second]);
  } finally { delete globalThis.__transferTestUser; }
});

test('individual login settings save independently of unfinished company changes', async () => {
  const first = (await database.query("INSERT INTO companies (name) VALUES ('Separate Save First') RETURNING id")).rows[0].id;
  const second = (await database.query("INSERT INTO companies (name) VALUES ('Separate Save Second') RETURNING id")).rows[0].id;
  const { PATCH } = await vite.ssrLoadModule('/app/api/company-setup/branding/route.ts');
  const save = (companyId, field, value) => PATCH(new Request('https://app.test/api/company-setup/branding', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ companyId, field, value, name: 'Unfinished name', bankName: 'Unfinished bank' }) }));
  const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  try {
    assert.equal((await save(first, 'logoData', logo)).status, 200);
    assert.equal((await save(first, 'loginLogoData', logo)).status, 200);
    assert.equal((await save(first, 'loginCompanyLogoData', logo)).status, 200);
    assert.equal((await save(first, 'loginDisplayName', 'ComNet International L.L.C.')).status, 200);
    assert.equal((await save(first, 'loginCopyrightYears', '1996-2021')).status, 200);
    assert.equal((await save(first, 'loginBackgroundColor', '#304050')).status, 200);
    assert.equal((await save(first, 'loginBackgroundData', logo)).status, 200);
    assert.equal((await save(first, 'loginBranding', true)).status, 200);
    assert.equal((await save(second, 'loginBranding', true)).status, 200);
    const row = (await database.query('SELECT name,bank_name,logo_data,login_logo_data,login_company_logo_data,login_display_name,login_copyright_years,login_background_color,login_background_data,login_branding FROM companies WHERE id=$1', [first])).rows[0];
    assert.equal(row.name, 'Separate Save First'); assert.equal(row.bank_name, ''); assert.equal(row.logo_data, logo);
    assert.equal(row.login_logo_data, logo); assert.equal(row.login_company_logo_data, logo); assert.equal(row.login_display_name, 'ComNet International L.L.C.'); assert.equal(row.login_copyright_years, '1996-2021');
    assert.equal(row.login_background_color, '#304050'); assert.equal(row.login_background_data, logo); assert.equal(row.login_branding, false);
    assert.deepEqual((await database.query('SELECT id FROM companies WHERE login_branding=true')).rows.map(row => row.id), [second]);
    assert.equal((await save(first, 'loginBackgroundData', 'data:image/svg+xml;base64,PHN2Zz4=')).status, 400);
    assert.equal((await save(first, 'loginBackgroundColor', 'url(javascript:alert(1))')).status, 400);
    assert.equal((await save(first, 'loginLogoData', 'data:image/svg+xml;base64,PHN2Zz4=')).status, 400);
    assert.equal((await save(first, 'loginCompanyLogoData', 'data:image/svg+xml;base64,PHN2Zz4=')).status, 400);
    assert.equal((await save(first, 'loginDisplayName', 'a'.repeat(121))).status, 400);
    assert.equal((await save(first, 'loginCopyrightYears', '1996-<script>')).status, 400);
    globalThis.__transferTestUser = { id: 9, email: 'admin@test', role: 'admin', companyIds: [first] };
    assert.equal((await save(first, 'loginBranding', true)).status, 403);
    assert.equal((await save(second, 'logoData', logo)).status, 403);
    assert.equal((await save(first, 'loginBackgroundColor', '#405060')).status, 200);
    assert.equal((await database.query('SELECT login_branding FROM companies WHERE id=$1', [second])).rows[0].login_branding, true);
  } finally { delete globalThis.__transferTestUser; }
});

test('named letterheads save per company and reject overlapping document assignments', async () => {
  const first = (await database.query("INSERT INTO companies (name) VALUES ('Letterhead Company') RETURNING id")).rows[0].id;
  const second = (await database.query("INSERT INTO companies (name) VALUES ('Other Letterhead Company') RETURNING id")).rows[0].id;
  const { PATCH } = await vite.ssrLoadModule('/app/api/company-setup/letterhead/route.ts');
  const { defaultLetterhead, letterheadForDocument } = await vite.ssrLoadModule('/lib/letterhead.ts');
  const request = (companyId, value) => PATCH(new Request('https://app.test/api/company-setup/letterhead', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ companyId, value: JSON.stringify(value) }) }));
  const template = { ...defaultLetterhead(), id: 'letter-1', name: 'Official letter', color: '#c82424', heading: 'ComNet', documents: ['tax-invoice', 'statement'], showStamp: true, stampLeft: 120, stampTop: 215 };
  try {
    assert.equal((await request(first, { templates: [template] })).status, 200);
    const stored = (await database.query('SELECT letterhead_design FROM companies WHERE id=$1', [first])).rows[0].letterhead_design;
    assert.equal(letterheadForDocument(stored, 'tax-invoice').name, 'Official letter');
    assert.equal(letterheadForDocument(stored, 'statement').stampTop, 215);
    assert.equal(letterheadForDocument(stored, 'estimate'), undefined);
    assert.equal((await database.query('SELECT letterhead_design FROM companies WHERE id=$1', [second])).rows[0].letterhead_design, '');
    assert.equal((await request(first, { templates: [template, { ...template, id: 'letter-2', documents: ['tax-invoice'] }] })).status, 400);
    assert.equal((await request(first, { templates: [{ ...template, heading: '<script>', color: 'red' }] })).status, 400);
    globalThis.__transferTestUser = { id: 9, email: 'admin@test', role: 'admin', companyIds: [first] };
    assert.equal((await request(second, { templates: [template] })).status, 403);
    assert.equal((await request(first, { templates: [] })).status, 200);
    assert.equal((await database.query('SELECT letterhead_design FROM companies WHERE id=$1', [first])).rows[0].letterhead_design, '{"templates":[]}');
  } finally { delete globalThis.__transferTestUser; }
});

test('company clearing requires administrator password and company access, preserves audit and rolls back linked data', async () => {
  const { POST } = await vite.ssrLoadModule('/app/api/company-setup/clear/route.ts');
  const { hashPassword } = await vite.ssrLoadModule('/lib/password.ts');
  const password = 'Company-clear-test-123';
  const hash = await hashPassword(password);
  const userId = (await database.query("INSERT INTO app_users (email,password_hash,role) VALUES ('clear-test@example.test',$1,'admin') RETURNING id", [hash])).rows[0].id;
  const company = (await database.query("INSERT INTO companies (name,logo_data,right_logo_data,phone) VALUES ('Clear Test','left','right','123') RETURNING id")).rows[0].id;
  const other = (await database.query("INSERT INTO companies (name,phone) VALUES ('Clear Other','456') RETURNING id")).rows[0].id;
  const request = (sections, extra = {}) => new Request('http://localhost/api/company-setup/clear', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({companyId:company,sections,password,confirmation:'Clear Test',...extra})});
  const resetBudget = () => database.query('DELETE FROM auth_rate_limits WHERE bucket=$1', [`company-clear:${userId}`]);
  const tx = async (id,no) => (await database.query("INSERT INTO transactions (company_id,number,type,party,transaction_date) VALUES ($1,$2,'invoice','Customer','2026-09-13') RETURNING id", [id,no])).rows[0].id;
  const first = await tx(company,'CLEAR-1'); const untouched = await tx(other,'OTHER-1');
  try {
    globalThis.__transferTestUser = {id:userId,email:'clear-test@example.test',role:'admin',companyIds:[]};
    assert.equal((await POST(request(['setup']))).status,403);
    globalThis.__transferTestUser.role='all_admin';
    globalThis.__transferTestUser.companyIds=[company];
    assert.equal((await POST(request(['setup']))).status,403);
    globalThis.__transferTestUser.role='admin';
    globalThis.__transferTestUser.companyIds=[company];
    assert.equal((await POST(request(['setup'],{password:'wrong'}))).status,403);
    assert.equal((await POST(request(['setup'],{confirmation:'yes'}))).status,400);
    assert.equal((await POST(request(['bad']))).status,400);
    assert.equal((await POST(request([]))).status,400);
    assert.equal((await POST(request(['setup']))).status,200);
    assert.equal((await database.query('SELECT logo_data,right_logo_data FROM companies WHERE id=$1',[company])).rows[0].logo_data,'');
    assert.equal((await database.query('SELECT id FROM transactions WHERE id=$1',[first])).rows.length,1);
    const loc = async (id,name) => (await database.query('INSERT INTO inventory_locations (company_id,name,code,invoice_prefix) VALUES ($1,$2,$2,$2) RETURNING id',[id,name])).rows[0].id;
    const source=await loc(company,'CLEAR'),dest=await loc(other,'OTHER');
    await database.query("INSERT INTO stock_transfers (reference,source_company_id,source_location_id,destination_company_id,destination_location_id,sku,item_name,quantity,transfer_date) VALUES ('CLEAR-X',$1,$2,$3,$4,'ITEM','Item',1,'2026-09-13')",[company,source,other,dest]);
    assert.equal((await database.query("SELECT id FROM stock_transfers WHERE reference='CLEAR-X'")).rows.length,1);
    assert.equal((await database.query('SELECT id FROM transactions WHERE id=$1',[first])).rows.length,1);
    await resetBudget();
    const invoice=await tx(company,'CLEAR-2');
    await database.query("INSERT INTO transactions (company_id,number,type,party,transaction_date,total) VALUES ($1,'CLEAR-PAY','customer payment','Customer','2026-09-13',10),($1,'CLEAR-CHQ','cheque','Vendor','2026-09-13',20)",[company]);
    const keptAccount=(await database.query("INSERT INTO accounts (company_id,code,name,type,balance) VALUES ($1,'KEEP-100','Kept main account','Bank',250) RETURNING id",[company])).rows[0].id;
    await database.query('UPDATE transactions SET sales_source_id=$1 WHERE id=$2',[first,invoice]);
    await database.query('INSERT INTO invoice_payment_allocations (payment_id,invoice_id,amount) VALUES ($1,$2,10)',[invoice,first]);
    await database.query("INSERT INTO record_attachments (company_id,entity_type,entity_id,file_name,file_data) VALUES ($1,'transaction',$2,'test','data')",[company,first]);
    // A restrict reference from another company must abort the whole clear transaction.
    await database.query('INSERT INTO bill_payment_allocations (payment_id,bill_id,amount) VALUES ($1,$2,10)',[untouched,first]);
    assert.equal((await POST(request(['transactions','inventory','contacts','reports','settings','setup']))).status,409);
    assert.equal((await database.query('SELECT id FROM transactions WHERE company_id=$1',[company])).rows.length,4);
    assert.equal((await database.query('SELECT id FROM invoice_payment_allocations WHERE payment_id=$1',[invoice])).rows.length,1);
    await database.query('DELETE FROM bill_payment_allocations WHERE payment_id=$1',[untouched]);
    assert.equal((await POST(request(['transactions','inventory','contacts','reports','settings','setup']))).status,200);
    for (const table of ['transactions','record_attachments']) assert.equal((await database.query(`SELECT * FROM ${table} WHERE company_id=$1`,[company])).rows.length,0);
    assert.equal((await database.query('SELECT * FROM inventory_locations WHERE company_id=$1 AND active=true',[company])).rows.length,0);
    const preservedTransfer=(await database.query("SELECT source_location_id,destination_location_id FROM stock_transfers WHERE reference='CLEAR-X'")).rows[0];
    assert.ok(preservedTransfer);
    assert.equal(Number(preservedTransfer.source_location_id),Number(source));
    assert.equal(Number(preservedTransfer.destination_location_id),Number(dest));
    assert.equal((await database.query('SELECT active FROM inventory_locations WHERE id=$1',[source])).rows[0].active,false);
    assert.equal((await database.query('SELECT active FROM inventory_locations WHERE id=$1',[dest])).rows[0].active,true);
    assert.equal((await database.query('SELECT id FROM transactions WHERE id=$1',[untouched])).rows.length,1);
    assert.deepEqual((await database.query('SELECT id,balance FROM accounts WHERE id=$1',[keptAccount])).rows,[{id:keptAccount,balance:0}]);
    assert.equal((await database.query('SELECT phone FROM companies WHERE id=$1',[other])).rows[0].phone,'456');
    assert.equal((await database.query('SELECT * FROM audit_log WHERE company_id=$1',[company])).rows.length,2);
    assert.equal((await database.query('SELECT * FROM app_users WHERE id=$1',[userId])).rows.length,1);
    await resetBudget();
    for(let i=0;i<5;i++) assert.equal((await POST(request(['setup'],{password:'wrong'}))).status,403);
    assert.equal((await POST(request(['setup']))).status,429);
    await resetBudget();
    globalThis.__transferTestUser.role='admin';
    globalThis.__transferTestUser.companyIds=[company];
    assert.equal((await POST(request(['setup']))).status,200);
  } finally { delete globalThis.__transferTestUser; }
});

test('Chart of Accounts deletion is limited to unused sub-accounts', async () => {
  const company=(await database.query("INSERT INTO companies (name) VALUES ('Sub-account delete test') RETURNING id")).rows[0].id;
  const main=(await database.query("INSERT INTO accounts (company_id,code,name,type) VALUES ($1,'MAIN-100','Protected main account','Bank') RETURNING id",[company])).rows[0].id;
  const sub=(await database.query("INSERT INTO accounts (company_id,code,name,type,parent_account_id) VALUES ($1,'SUB-110','Deletable sub-account','Bank',$2) RETURNING id",[company,main])).rows[0].id;
  const child=(await database.query("INSERT INTO accounts (company_id,code,name,type,parent_account_id) VALUES ($1,'SUB-111','Nested sub-account','Bank',$2) RETURNING id",[company,sub])).rows[0].id;
  const {DELETE}=await vite.ssrLoadModule('/app/api/records/route.ts');
  const remove=(id)=>DELETE(new Request('https://app.test/api/records',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'accounts',companyId:company,id})}));
  assert.equal((await remove(main)).status,409);
  assert.equal((await remove(sub)).status,409);
  assert.equal((await remove(child)).status,200);
  assert.equal((await remove(sub)).status,200);
  assert.equal((await database.query('SELECT id FROM accounts WHERE id=$1',[main])).rows.length,1);
});

test('shared out-of-stock catalogue crosses assignments but excludes in-stock, inactive and financial data', async () => {
  const company=(await database.query("INSERT INTO companies (name) VALUES ('Shared catalogue company') RETURNING id")).rows[0].id;
  const location=(await database.query("INSERT INTO inventory_locations (company_id,name,code,invoice_prefix) VALUES ($1,'Shared store','SHARED','SHARED') RETURNING id",[company])).rows[0].id;
  const inactive=(await database.query("INSERT INTO inventory_locations (company_id,name,code,invoice_prefix,active) VALUES ($1,'Closed store','CLOSED','CLOSED',false) RETURNING id",[company])).rows[0].id;
  const ids=[];
  for (const [sku,quantity,warehouse] of [['SHARED-ZERO',0,location],['SHARED-NEGATIVE',-1,location],['SHARED-POSITIVE',1,location],['SHARED-CLOSED',0,inactive]]) ids.push((await database.query("INSERT INTO items (company_id,location_id,sku,name,quantity,cost,sales_price) VALUES ($1,$2,$3,$3,$4,987,1234) RETURNING id",[company,warehouse,sku,quantity])).rows[0].id);
  const {GET}=await vite.ssrLoadModule('/app/api/out-of-stock/route.ts');
  try {
    globalThis.__transferTestUser={id:1,email:'viewer@test',role:'viewer',companyIds:[]};
    const response=await GET(new Request('https://app.test/api/out-of-stock'));
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
    const rows=(await response.json()).records.filter(row=>ids.includes(row.id));
    assert.deepEqual(rows.map(row=>row.sku).sort(),['SHARED-NEGATIVE','SHARED-ZERO']);
    for(const row of rows){assert.equal(row.company,'Shared catalogue company');assert.equal(row.inventory,'Shared store');for(const key of ['cost','salesPrice','quantity','lastPurchasePrice','companyId'])assert.equal(key in row,false);}
    await database.query('UPDATE companies SET active=false WHERE id=$1',[company]);
    assert.equal((await (await GET(new Request('https://app.test/api/out-of-stock'))).json()).records.some(row=>ids.includes(row.id)),false);
    globalThis.__transferTestUser=new Response('Unauthorized',{status:401});
    assert.equal((await GET(new Request('https://app.test/api/out-of-stock'))).status,401);
  } finally {delete globalThis.__transferTestUser;}
});

test('shared catalogue exposes zero values and reuses identifiers without source access or stock changes', async () => {
 const sourceCompany=(await database.query("INSERT INTO companies(name) VALUES('Catalogue source') RETURNING id")).rows[0].id;
 const targetCompany=(await database.query("INSERT INTO companies(name) VALUES('Catalogue target') RETURNING id")).rows[0].id;
 const makeLocation=async id=>(await database.query("INSERT INTO inventory_locations(company_id,name,code,invoice_prefix) VALUES($1,'Store','STORE','INV') RETURNING id",[id])).rows[0].id;
 const sourceLocation=await makeLocation(sourceCompany), targetLocation=await makeLocation(targetCompany);
 const sourceId=(await database.query("INSERT INTO items(company_id,location_id,item_number,sku,name,quantity,cost,sales_price,grn_price,last_purchase_price) VALUES($1,$2,'SHARED-130','SHARED-SKU','Shared laptop',15,900,1200,950,880) RETURNING id",[sourceCompany,sourceLocation])).rows[0].id;
 const {GET,POST}=await vite.ssrLoadModule('/app/api/shared-items/route.ts');
 const post=body=>POST(new Request('https://app.test/api/shared-items',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
 try {
  globalThis.__transferTestUser={id:1,email:'target@test',role:'admin',companyIds:[targetCompany]};
  const {GET:outOfStock}=await vite.ssrLoadModule('/app/api/out-of-stock/route.ts');
  const payload={sourceId,companyId:targetCompany,locationId:targetLocation,quantity:999,cost:999};
  assert.equal((await GET(new Request(`https://app.test/api/shared-items?companyId=${sourceCompany}`))).status,403);
  assert.equal((await outOfStock(new Request(`https://app.test/api/out-of-stock?companyId=${sourceCompany}&locationId=${sourceLocation}`))).status,403);
  for(const url of ['https://app.test/api/shared-items',`https://app.test/api/shared-items?companyId=${targetCompany}`])assert.equal((await (await GET(new Request(url))).json()).records.some(row=>row.id===sourceId),false);
  for(const suffix of ['',`?companyId=${targetCompany}&locationId=${targetLocation}`])assert.equal((await (await outOfStock(new Request(`https://app.test/api/out-of-stock${suffix}`))).json()).records.some(row=>row.id===sourceId),false);
  assert.equal((await post(payload)).status,404);
  assert.equal((await database.query('SELECT id FROM items WHERE company_id=$1',[targetCompany])).rows.length,0);
  await database.query('UPDATE items SET quantity=0 WHERE id=$1',[sourceId]);
  assert.equal((await (await outOfStock(new Request(`https://app.test/api/out-of-stock?companyId=${targetCompany}&locationId=${targetLocation}`))).json()).records.some(row=>row.id===sourceId),true);
  const rows=(await (await GET(new Request('https://app.test/api/shared-items'))).json()).records;
  const shared=rows.find(row=>row.id===sourceId);assert(shared);for(const key of ['quantity','cost','salesPrice','grnPrice'])assert.equal(shared[key],0);assert.equal('lastPurchasePrice' in shared,false);
  const response=await post(payload);assert.equal(response.status,201,JSON.stringify(await response.clone().json()));const created=(await response.json()).record;
  const saved=(await database.query('SELECT * FROM items WHERE id=$1',[created.id])).rows[0];assert.equal(saved.sku,'SHARED-SKU');assert.equal(saved.item_number,'SHARED-130');for(const key of ['quantity','cost','sales_price','grn_price','last_purchase_price'])assert.equal(saved[key],0);
  await database.query('UPDATE items SET quantity=3,cost=50 WHERE id=$1',[created.id]);
  // Destination SKU suppression still includes its private in-stock items.
  assert.equal((await (await GET(new Request(`https://app.test/api/shared-items?companyId=${targetCompany}`))).json()).records.some(row=>row.id===sourceId),false);
  await database.query('UPDATE items SET quantity=15 WHERE id=$1',[sourceId]);
  assert.equal((await post(payload)).status,404); // stale listing cannot reuse restocked source
  await database.query('UPDATE items SET quantity=0 WHERE id=$1',[sourceId]);
  const again=await post(payload);assert.equal(again.status,200);assert.equal((await again.json()).record.id,created.id);assert.equal((await database.query('SELECT quantity FROM items WHERE id=$1',[created.id])).rows[0].quantity,3);
  assert.equal((await post({...payload,companyId:sourceCompany,locationId:sourceLocation})).status,403);
  assert.equal((await post({...payload,locationId:sourceLocation})).status,400);
  await database.query("UPDATE items SET item_number='OTHER' WHERE id=$1",[created.id]);assert.equal((await post(payload)).status,409);
  globalThis.__transferTestUser={id:1,email:'viewer@test',role:'viewer',companyIds:[targetCompany]};assert.equal((await post(payload)).status,403);
  const source=(await database.query('SELECT quantity,cost,sales_price,grn_price FROM items WHERE id=$1',[sourceId])).rows[0];assert.deepEqual(source,{quantity:0,cost:900,sales_price:1200,grn_price:950});
 }finally{delete globalThis.__transferTestUser;}
});

test('inventory overview and transfer reads never expose stock from unassigned companies', async () => {
 const makeCompany=async name=>(await database.query('INSERT INTO companies(name) VALUES($1) RETURNING id',[name])).rows[0].id;
 const own=await makeCompany('Private own'),other=await makeCompany('Private other');
 const loc=async company=>(await database.query("INSERT INTO inventory_locations(company_id,name,code,invoice_prefix) VALUES($1,'Store','STORE','INV') RETURNING id",[company])).rows[0].id;
 const ownLoc=await loc(own),otherLoc=await loc(other);
 const item=async(company,location,sku)=>(await database.query('INSERT INTO items(company_id,location_id,sku,name,quantity,sales_price) VALUES($1,$2,$3,$3,9,999) RETURNING id',[company,location,sku])).rows[0].id;
 const ownItem=await item(own,ownLoc,'PRIVATE-OWN'),otherItem=await item(other,otherLoc,'PRIVATE-OTHER');
 await database.query("INSERT INTO contacts(company_id,name,type) VALUES($1,'Private own rep','employee'),($2,'Private other rep','employee')",[own,other]);
 const transfer=async(source,dest,sourceLoc,destLoc,ref)=>(await database.query("INSERT INTO stock_transfers(reference,source_company_id,destination_company_id,source_location_id,destination_location_id,sku,item_name,quantity,transfer_date) VALUES($1,$2,$3,$4,$5,'PRIVATE','Private laptop',1,'2026-09-15') RETURNING id",[ref,source,dest,sourceLoc,destLoc])).rows[0].id;
 const ownTransfer=await transfer(own,own,ownLoc,ownLoc,'PRIVATE-OWN-T'),otherTransfer=await transfer(other,other,otherLoc,otherLoc,'PRIVATE-OTHER-T'),cross=await transfer(own,other,ownLoc,otherLoc,'PRIVATE-CROSS-T');
 const overview=await vite.ssrLoadModule('/app/api/inventory-overview/route.ts'),transfers=await vite.ssrLoadModule('/app/api/transfers/route.ts');
 const recordsApi=await vite.ssrLoadModule('/app/api/records/route.ts');
 const get=async(module,path)=>(await (await module.GET(new Request(`https://app.test/api/${path}`))).json());
 try {
  for(const role of ['admin','inventory','viewer']){
   globalThis.__transferTestUser={id:1,role,companyIds:[own]};
   for(const kind of ['items','transactions','contacts','accounts']){
    const denied=await recordsApi.GET(new Request(`https://app.test/api/records?kind=${kind}&companyId=${other}&locationId=${otherLoc}`));assert.equal(denied.status,403);
   }
   assert.equal((await recordsApi.GET(new Request(`https://app.test/api/records?kind=transactions&id=1&companyId=${other}`))).status,403);
   const ownRecords=await get(recordsApi,`records?kind=items&companyId=${own}&locationId=${ownLoc}`);assert.deepEqual(ownRecords.records.map(r=>r.id),[ownItem]);
   const stock=(await get(overview,'inventory-overview')).records;assert.ok(stock.some(r=>r.id===ownItem));assert.ok(stock.every(r=>r.companyId===own));
   const catalogue=await get(transfers,'transfers?catalog=1');assert.ok(catalogue.records.every(r=>r.companyId===own));assert.ok(catalogue.salesmen.every(r=>r.companyId===own));
   const history=(await get(transfers,'transfers')).records;assert.ok(history.some(r=>r.id===ownTransfer));assert.ok(history.every(r=>r.sourceCompanyId===own&&r.destinationCompanyId===own));assert.ok(!history.some(r=>[otherTransfer,cross].includes(r.id)));
  }
  globalThis.__transferTestUser={id:1,role:'viewer',companyIds:[]};
  assert.equal((await get(overview,'inventory-overview')).records.length,0);assert.deepEqual(await get(transfers,'transfers?catalog=1'),{records:[],salesmen:[]});assert.equal((await get(transfers,'transfers')).records.length,0);
  globalThis.__transferTestUser={id:1,role:'admin',companyIds:[own,other]};assert.ok((await get(transfers,'transfers')).records.some(r=>r.id===cross));
  globalThis.__transferTestUser={id:1,role:'all_admin',companyIds:[]};assert.ok((await get(overview,'inventory-overview')).records.some(r=>r.id===otherItem));assert.ok((await get(transfers,'transfers')).records.some(r=>r.id===otherTransfer));
 }finally{delete globalThis.__transferTestUser;}
});

test('invoice packing lists preserve logistics, calculate cartons and expose only the unpacked balance', async () => {
  await database.query("INSERT INTO app_users(id,email,password_hash,role) VALUES(1,'test@example.test','test','all_admin') ON CONFLICT (id) DO NOTHING");
  const company=(await database.query("INSERT INTO companies(name) VALUES('Packing list company') RETURNING id")).rows[0].id;
  const location=(await database.query("INSERT INTO inventory_locations(company_id,name,code,invoice_prefix) VALUES($1,'Packing store','PACK','INV') RETURNING id",[company])).rows[0].id;
  const item=(await database.query("INSERT INTO items(company_id,location_id,item_number,sku,name,quantity,hs_code,country_of_origin,dimension_text,length_cm,width_cm,height_cm,weight_kg) VALUES($1,$2,'ID-100','PACK-100','Packed router',100,'84718000','CHINA','50 x 40 x 30 cm',50,40,30,0.5) RETURNING id",[company,location])).rows[0].id;
  await database.query("INSERT INTO contacts(company_id,type,name,country) VALUES($1,'customer','Packing customer','AFGHANISTAN')",[company]);
  const invoice=(await database.query("INSERT INTO transactions(company_id,location_id,number,type,party,transaction_date) VALUES($1,$2,'INV-PACK-1','invoice','Packing customer','2026-09-22') RETURNING id",[company,location])).rows[0].id;
  const invoiceLine=(await database.query("INSERT INTO transaction_lines(transaction_id,item_id,description,quantity) VALUES($1,$2,'Packed router',100) RETURNING id",[invoice,item])).rows[0].id;
  const {GET,POST,PATCH}=await vite.ssrLoadModule('/app/api/packing-lists/route.ts');
  const save=(quantity)=>POST(new Request('https://app.test/api/packing-lists',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({companyId:company,invoiceId:invoice,packingDate:'2026-09-22',deliveryAddress:'Kabul Airport',memo:'Export packing',lines:[{invoiceLineId:invoiceLine,packedQuantity:quantity,unitsPerCarton:10,cartonReference:'5',grossWeightKg:quantity*0.5,lengthCm:50,widthCm:40,heightCm:30}]})}));
  let response=await save(20);
  assert.equal(response.status,201,await response.clone().text());
  let data=await response.json();
  assert.equal(data.packingLists[0].number,'PL-INV-PACK-1-01');
  assert.equal(data.packingLists[0].lines[0].cartonCount,2);
  assert.equal(data.packingLists[0].lines[0].cartonReference,'5-6');
  assert.equal(data.packingLists[0].lines[0].totalCbm,0.12);
  assert.equal(data.packingLists[0].lines[0].hsCode,'84718000');
  assert.equal(data.packingLists[0].lines[0].countryOfOrigin,'CHINA');
  assert.equal(data.lines[0].remainingQuantity,80);
  response=await save(81);
  assert.equal(response.status,409);
  assert.match((await response.json()).error,/only 80 remaining/);
  response=await save(30);
  assert.equal(response.status,201,await response.clone().text());
  data=await response.json();
  assert.deepEqual(data.packingLists.map(list=>list.number),['PL-INV-PACK-1-01','PL-INV-PACK-1-02']);
  assert.equal(data.lines[0].packedQuantity,50);
  assert.equal(data.lines[0].remainingQuantity,50);
  const split=(quantities,cartonReference='9')=>POST(new Request('https://app.test/api/packing-lists',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({companyId:company,invoiceId:invoice,packingDate:'2026-09-22',lines:quantities.map(quantity=>({invoiceLineId:invoiceLine,packedQuantity:quantity,unitsPerCarton:quantity,cartonReference,grossWeightKg:quantity*0.5,lengthCm:50,widthCm:40,heightCm:30}))})}));
  response=await split([30,30]);assert.equal(response.status,409);assert.match((await response.json()).error,/only 50 remaining/);
  response=await split([25,25]);assert.equal(response.status,201,await response.clone().text());data=await response.json();
  const repacked=data.packingLists.at(-1);assert.equal(repacked.lines.length,2);assert.ok(repacked.lines.every(line=>line.cartonReference==='9'&&line.cartonCount===1));assert.equal(repacked.lines.reduce((sum,line)=>sum+line.totalCbm,0),0.06);
  assert.equal(data.lines[0].remainingQuantity,0);
  const firstList=data.packingLists[0];
  response=await PATCH(new Request('https://app.test/api/packing-lists',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({companyId:company,invoiceId:invoice,packingListId:firstList.id,packingDate:'2026-09-23',deliveryAddress:'Updated Kabul Airport',memo:'Updated packing',lines:[{invoiceLineId:invoiceLine,packedQuantity:20,unitsPerCarton:10,cartonReference:'20',grossWeightKg:10,lengthCm:55,widthCm:45,heightCm:35}]})}));
  assert.equal(response.status,200,await response.clone().text());data=await response.json();
  assert.equal(data.packingLists.length,3);assert.equal(data.packingLists[0].number,'PL-INV-PACK-1-01');assert.equal(data.packingLists[0].packingDate,'2026-09-23');assert.equal(data.packingLists[0].deliveryAddress,'Updated Kabul Airport');assert.equal(data.packingLists[0].lines.length,1);assert.equal(data.packingLists[0].lines[0].cartonReference,'20-21');assert.equal(data.lines[0].remainingQuantity,0);
  const refreshed=await GET(new Request(`https://app.test/api/packing-lists?companyId=${company}&invoiceId=${invoice}`));
  assert.equal(refreshed.status,200);
  assert.equal((await refreshed.json()).lines[0].remainingQuantity,0);
});
