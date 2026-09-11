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
        export const requireApiUser = async () => ({ id: 1, email: "test@example.test", role: "all_admin", companyIds: [], mustChangePassword: false });
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
});
