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
const post = (body) => new Request("https://app.test/api", { method: "POST", headers: { origin: "https://app.test", "content-type": "application/json" }, body: JSON.stringify(body) });

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

let companyId, locationId, otherCompanyId, otherLocationId;
test("company creation atomically provisions its inventory and control accounts", async () => {
  const routes = await vite.ssrLoadModule("/app/api/workspaces/route.ts");
  for (const name of ["Test Company", "Other Company"]) {
    const response = await routes.POST(post({ type: "company", name, baseCurrency: "AED" }));
    const result = await response.json();
    assert.equal(response.status, 201, JSON.stringify(result));
    if (!companyId) { companyId = result.company.id; locationId = result.company.locations[0].id; }
    else { otherCompanyId = result.company.id; otherLocationId = result.company.locations[0].id; }
  }
  const result = await database.query("SELECT count(*)::int AS count FROM accounts WHERE company_id = $1", [companyId]);
  assert.equal(result.rows[0].count, 14);
});

test("foreign-company inventory references are rejected for purchases and item creation", async () => {
  const routes = await vite.ssrLoadModule("/app/api/records/route.ts");
  const foreign = await database.query("INSERT INTO items (company_id, location_id, sku, name) VALUES ($1, $2, 'FOREIGN', 'Other stock') RETURNING id", [otherCompanyId, otherLocationId]);
  for (const payload of [
    { kind: "items", companyId, locationId: otherLocationId, name: "Wrong inventory" },
    { kind: "transactions", type: "bill", companyId, locationId, party: "Vendor", lines: [{ itemId: foreign.rows[0].id, quantity: 1, unitPrice: 1 }] },
  ]) {
    const response = await routes.POST(post(payload));
    assert.equal(response.status, 400, await response.text());
  }
});

test("currency conversion posts balanced rounded journal amounts", async () => {
  const routes = await vite.ssrLoadModule("/app/api/records/route.ts");
  const response = await routes.POST(post({ kind: "transactions", type: "invoice", companyId, locationId, party: "Customer", currency: "USD", exchangeRate: 1.1, lines: [{ description: "Rounding boundary", quantity: 1, unitPrice: 0.1, vatCode: "STANDARD" }] }));
  const result = await response.json();
  assert.equal(response.status, 201, JSON.stringify(result));
  const journal = await database.query("SELECT sum(debit) AS debit, sum(credit) AS credit FROM journal_lines l JOIN journal_entries e ON e.id = l.journal_entry_id WHERE e.transaction_id = $1", [result.record.id]);
  assert.ok(Math.abs(journal.rows[0].debit - journal.rows[0].credit) < 1e-9);
  assert.equal(result.record.baseTotal, 0.12);
});

test("a late audit failure rolls back invoice, journal, and invoice sequence", async () => {
  const routes = await vite.ssrLoadModule("/app/api/records/route.ts");
  assert.ok(companyId && locationId, "Company fixture must be initialized");
  const before = await database.query("SELECT next_invoice_number FROM inventory_locations WHERE id = $1", [locationId]);
  const countBefore = await database.query("SELECT count(*)::int AS count FROM transactions WHERE company_id = $1", [companyId]);
  await database.exec("ALTER TABLE audit_log ADD CONSTRAINT reject_test_audit CHECK (entity_type <> 'transaction') NOT VALID");
  try {
    const response = await routes.POST(post({ kind: "transactions", type: "invoice", companyId, locationId, party: "Customer", lines: [{ description: "Forced failure", quantity: 1, unitPrice: 100 }] }));
    assert.equal(response.status, 500);
  } finally { await database.exec("ALTER TABLE audit_log DROP CONSTRAINT reject_test_audit"); }
  assert.deepEqual((await database.query("SELECT next_invoice_number FROM inventory_locations WHERE id = $1", [locationId])).rows, before.rows);
  assert.deepEqual((await database.query("SELECT count(*)::int AS count FROM transactions WHERE company_id = $1", [companyId])).rows, countBefore.rows);
});

test("transfer rejects combined shortages without partially moving stock", async () => {
  assert.ok(companyId && locationId);
  const routes = await vite.ssrLoadModule("/app/api/transfers/route.ts");
  const item = await database.query("INSERT INTO items (company_id, location_id, sku, name, quantity) VALUES ($1, $2, 'TRANSFER', 'Transfer stock', 5) RETURNING id", [companyId, locationId]);
  const itemId = item.rows[0].id;
  const response = await routes.POST(post({ reference: "TRF-TEST", transferDate: "2026-09-10", lines: [
    { itemId, sourceLocationId: locationId, destinationLocationId: otherLocationId, quantity: 4 },
    { itemId, sourceLocationId: locationId, destinationLocationId: otherLocationId, quantity: 2 },
  ] }));
  assert.equal(response.status, 409, await response.text());
  assert.equal((await database.query("SELECT quantity FROM items WHERE id = $1", [itemId])).rows[0].quantity, 5);
  const success = await routes.POST(post({ reference: "TRF-TEST", transferDate: "2026-09-10", lines: [{ itemId, sourceLocationId: locationId, destinationLocationId: otherLocationId, quantity: 2 }] }));
  assert.equal(success.status, 201, await success.text());
  assert.equal((await database.query("SELECT quantity FROM items WHERE id = $1", [itemId])).rows[0].quantity, 3);
  assert.equal((await database.query("SELECT quantity FROM items WHERE company_id = $1 AND sku = 'TRANSFER'", [otherCompanyId])).rows[0].quantity, 2);
});

test("profit and loss respects the requested period", async () => {
  assert.ok(companyId && locationId);
  const { GET } = await vite.ssrLoadModule("/app/api/reports/route.ts");
  const response = await GET(new Request(`https://app.test/api/reports?companyId=${companyId}&locationId=${locationId}&type=profit-loss&periodStart=2000-01-01&periodEnd=2000-12-31`));
  assert.equal(response.status, 200);
  const result = await response.json();
  for (const row of result.report.rows) for (const value of Object.values(row)) if (typeof value === "number") assert.equal(value, 0);
});

test("invalid user changes preserve company assignments and the last All-Admin", async () => {
  assert.ok(companyId && otherCompanyId);
  await database.exec("UPDATE app_users SET role = 'all_admin', active = true WHERE id = 1");
  const routes = await vite.ssrLoadModule("/app/api/admin-users/route.ts");
  const created = await routes.POST(post({ fullName: "Test viewer", email: "viewer@example.test", role: "viewer", password: "temporary password 123", companyIds: [companyId] }));
  const result = await created.json();
  assert.equal(created.status, 201, JSON.stringify(result));
  const patch = (payload) => new Request("https://app.test/api/admin-users", { method: "PATCH", headers: { origin: "https://app.test", "content-type": "application/json" }, body: JSON.stringify(payload) });
  const invalid = await routes.PATCH(patch({ id: result.user.id, companyIds: [otherCompanyId], password: "short" }));
  assert.equal(invalid.status, 400);
  const memberships = await database.query("SELECT company_id FROM app_user_companies WHERE user_id = $1", [result.user.id]);
  assert.deepEqual(memberships.rows, [{ company_id: companyId }]);
  const demote = await routes.PATCH(patch({ id: 1, role: "admin", companyIds: [companyId] }));
  assert.equal(demote.status, 409);
  assert.equal((await database.query("SELECT role FROM app_users WHERE id = 1")).rows[0].role, "all_admin");
});

test("attachments commit with invoices, download safely, and disappear on reversal", async () => {
  const routes = await vite.ssrLoadModule("/app/api/records/route.ts");
  const attachmentRoutes = await vite.ssrLoadModule("/app/api/attachments/route.ts");
  const payload = { kind: "transactions", type: "invoice", companyId, locationId, party: "Attached invoice", lines: [{ description: "Service", quantity: 1, unitPrice: 10 }], attachments: [{ fileName: "note.txt", mimeType: "text/plain", fileData: "data:text/plain;base64,aGVsbG8=", fileSize: 5 }] };
  const invalid = await routes.POST(post({ ...payload, attachments: [{ ...payload.attachments[0], fileSize: 1 }] }));
  assert.equal(invalid.status, 400);
  assert.equal((await database.query("SELECT count(*)::int AS count FROM transactions WHERE party = 'Attached invoice'")).rows[0].count, 0);
  const response = await routes.POST(post(payload));
  const result = await response.json();
  assert.equal(response.status, 201, JSON.stringify(result));
  const url = `https://app.test/api/attachments?companyId=${companyId}&entityType=transaction&entityId=${result.record.id}`;
  const files = await (await attachmentRoutes.GET(new Request(url))).json();
  assert.equal(files.attachments.length, 1);
  const download = await attachmentRoutes.GET(new Request(`${url}&attachmentId=${files.attachments[0].id}`));
  assert.equal(download.status, 200);
  assert.match(download.headers.get("content-disposition"), /^attachment;/);
  assert.equal(await download.text(), "hello");
  await routes.DELETE(new Request("https://app.test/api/records", { method: "DELETE", headers: { origin: "https://app.test", "content-type": "application/json" }, body: JSON.stringify({ kind: "transactions", companyId, id: result.record.id }) }));
  assert.equal((await attachmentRoutes.GET(new Request(`${url}&attachmentId=${files.attachments[0].id}`))).status, 404);
});

test("multi-source transfers combine a SKU before upserting the destination", async () => {
  const { POST } = await vite.ssrLoadModule("/app/api/transfers/route.ts");
  const location = await database.query("INSERT INTO inventory_locations (company_id, code, name, invoice_prefix) VALUES ($1, 'QA2', 'Second source', 'QA2') RETURNING id", [companyId]);
  const first = await database.query("INSERT INTO items (company_id, location_id, sku, name, quantity) VALUES ($1, $2, 'MULTI-SOURCE', 'Product', 5) RETURNING id", [companyId, locationId]);
  const second = await database.query("INSERT INTO items (company_id, location_id, sku, name, quantity) VALUES ($1, $2, 'MULTI-SOURCE', 'Product', 5) RETURNING id", [companyId, location.rows[0].id]);
  const response = await POST(post({ reference: "TRF-MULTI-SOURCE", lines: [
    { itemId: first.rows[0].id, sourceLocationId: locationId, destinationLocationId: otherLocationId, quantity: 2 },
    { itemId: second.rows[0].id, sourceLocationId: location.rows[0].id, destinationLocationId: otherLocationId, quantity: 3 },
  ] }));
  assert.equal(response.status, 201, await response.text());
  assert.equal((await database.query("SELECT quantity FROM items WHERE sku = 'MULTI-SOURCE' AND location_id = $1", [otherLocationId])).rows[0].quantity, 5);
});

test("base currency follows initial company setup and cannot relabel posted amounts", async () => {
  const routes = await vite.ssrLoadModule("/app/api/workspaces/route.ts");
  const created = await routes.POST(post({ type: "company", name: "Dollar company", baseCurrency: "USD" }));
  const result = await created.json();
  assert.equal(created.status, 201);
  const currencies = await database.query("SELECT DISTINCT currency FROM accounts WHERE company_id = $1", [result.company.id]);
  assert.deepEqual(currencies.rows, [{ currency: "USD" }]);
  const changed = await routes.PATCH(new Request("https://app.test/api/workspaces", { method: "PATCH", headers: { origin: "https://app.test", "content-type": "application/json" }, body: JSON.stringify({companyId, baseCurrency:"USD"}) }));
  assert.equal(changed.status, 409);
});

test("retrying a successful request replays its invoice without posting twice", async () => {
  const { POST } = await vite.ssrLoadModule("/app/api/records/route.ts");
  const payload = {kind:"transactions",type:"invoice",companyId,locationId,party:"Retry Customer",lines:[{description:"Service",quantity:1,unitPrice:15}]};
  const request = (body) => new Request("https://app.test/api/records", { method:"POST",headers:{origin:"https://app.test","content-type":"application/json","idempotency-key":"test-idempotency-key-1234"},body:JSON.stringify(body) });
  const first = await POST(request(payload));
  const original = await first.json();
  assert.equal(first.status, 201);
  const replayed = await POST(request(payload));
  assert.equal(replayed.status, 201);
  assert.equal(replayed.headers.get("idempotency-replayed"), "true");
  assert.equal((await replayed.json()).record.id, original.record.id);
  assert.equal((await database.query("SELECT count(*)::int AS count FROM transactions WHERE party = 'Retry Customer'")).rows[0].count, 1);
  const conflicting = await POST(request({...payload,party:"Changed Customer"}));
  assert.equal(conflicting.status,409);
});

test("shared login budgets saturate and reset without trusting client IP headers", async () => {
  const { consumeRateLimit } = await vite.ssrLoadModule("/lib/rate-limit.ts");
  assert.equal((await consumeRateLimit("test-budget",2,60)).allowed,true);
  assert.equal((await consumeRateLimit("test-budget",2,60)).allowed,true);
  const rejected = await consumeRateLimit("test-budget",2,60);
  assert.equal(rejected.allowed,false);
  assert.ok(rejected.retryAfter > 0);
  await consumeRateLimit("test-budget",2,60);
  assert.equal((await database.query("SELECT attempts FROM auth_rate_limits WHERE bucket = 'test-budget'")).rows[0].attempts,3);
  await database.exec("UPDATE auth_rate_limits SET reset_at = now() - interval '1 second' WHERE bucket = 'test-budget'");
  assert.equal((await consumeRateLimit("test-budget",2,60)).allowed,true);
});

test("new companies copy only main accounts at zero and start with no history", async () => {
  const routes = await vite.ssrLoadModule("/app/api/workspaces/route.ts");
  const source = (await database.query("INSERT INTO companies (name,base_currency) VALUES ('Chart Copy Source','AED') RETURNING id")).rows[0];
  const sourceLocation = (await database.query("INSERT INTO inventory_locations (company_id,name,code,invoice_prefix) VALUES ($1,'Main Inventory','MAIN','MAIN') RETURNING id", [source.id])).rows[0];
  const parent = (await database.query("INSERT INTO accounts (company_id,code,name,type,currency,balance) VALUES ($1,'COPY-7000','Copy parent','Expense','AED',725) RETURNING id", [source.id])).rows[0];
  await database.query("INSERT INTO accounts (company_id,code,name,type,currency,parent_account_id,balance) VALUES ($1,'COPY-7010','Do not copy sub-account','Expense','AED',$2,80)", [source.id, parent.id]);
  await database.query("INSERT INTO transactions (company_id,location_id,number,type,party,transaction_date,total) VALUES ($1,$2,'COPY-HISTORY','invoice','History customer','2026-09-21',725)", [source.id, sourceLocation.id]);
  const response = await routes.POST(post({ type: "company", name: "Clean Chart Copy", baseCurrency: "USD", sourceCompanyId: source.id }));
  const result = await response.json();
  assert.equal(response.status, 201, JSON.stringify(result));
  const copied = await database.query("SELECT code,name,type,system_role,currency,parent_account_id,balance,active FROM accounts WHERE company_id=$1 ORDER BY code", [result.company.id]);
  const sourceMain = await database.query("SELECT code,name,type,system_role,'USD'::text AS currency,NULL::integer AS parent_account_id,0::double precision AS balance,active FROM accounts WHERE company_id=$1 AND parent_account_id IS NULL ORDER BY code", [source.id]);
  assert.deepEqual(copied.rows, sourceMain.rows);
  assert.equal(copied.rows.some((account) => account.code === "COPY-7010"), false);
  for (const table of ["transactions", "journal_entries", "audit_log"]) {
    assert.equal((await database.query(`SELECT count(*)::int AS count FROM ${table} WHERE company_id=$1`, [result.company.id])).rows[0].count, 0);
  }
});

test("stock adjustments post quantity and multi-currency value changes and reverse cleanly", async () => {
  const workspaces = await vite.ssrLoadModule("/app/api/workspaces/route.ts");
  const company = (await (await workspaces.POST(post({ type: "company", name: "Stock Adjustment Company", baseCurrency: "AED" }))).json()).company;
  const companyId = company.id, locationId = company.locations[0].id;
  const routes = await vite.ssrLoadModule("/app/api/stock-adjustments/route.ts");
  const records = await vite.ssrLoadModule("/app/api/records/route.ts");
  const a = (await database.query("INSERT INTO items (company_id, location_id, sku, name, quantity, cost) VALUES ($1, $2, 'ADJ-A', 'Adjust A', 10, 5) RETURNING id", [companyId, locationId])).rows[0].id;
  const b = (await database.query("INSERT INTO items (company_id, location_id, sku, name, quantity, cost) VALUES ($1, $2, 'ADJ-B', 'Adjust B', 4, 5) RETURNING id", [companyId, locationId])).rows[0].id;
  const account = (await database.query("INSERT INTO accounts (company_id, code, name, type, currency) VALUES ($1, 'ADJ-5030', 'Stock adjustment test', 'Cost of Goods Sold', 'AED') RETURNING id", [companyId])).rows[0].id;
  await database.query("INSERT INTO exchange_rates (company_id, currency_code, rate) VALUES ($1, 'USD', 3.6725) ON CONFLICT DO NOTHING", [companyId]);
  const workspace = await (await routes.GET(new Request(`https://app.test/api/stock-adjustments?companyId=${companyId}&locationId=${locationId}`))).json();
  assert.equal(workspace.items.find((item) => item.id === a).unitCost, 5, JSON.stringify(workspace).slice(0, 400));
  const balance = async (id) => (await database.query("SELECT coalesce(sum(l.debit - l.credit), 0)::float AS value FROM journal_lines l JOIN journal_entries e ON e.id = l.journal_entry_id WHERE e.transaction_id = $1", [id])).rows[0].value;
  const quantity = async (id) => (await database.query("SELECT quantity FROM items WHERE id = $1", [id])).rows[0].quantity;

  const created = await routes.POST(post({ companyId, locationId, type: "quantity", date: "2026-10-17", reference: "ADJ-T1", accountId: account, currency: "AED", lines: [{ itemId: a, newQuantity: 7, expectedQuantity: 10 }, { itemId: b, quantityDifference: 2, expectedQuantity: 4 }] }));
  const result = await created.json();
  assert.equal(created.status, 201, JSON.stringify(result));
  assert.equal(result.adjustment.totalValue, -5);
  assert.equal(await quantity(a), 7);
  assert.equal(await quantity(b), 6);
  assert.ok(Math.abs(await balance(result.adjustment.id)) < 1e-9);
  const credited = await database.query("SELECT l.debit, l.credit FROM journal_lines l JOIN journal_entries e ON e.id = l.journal_entry_id WHERE e.transaction_id = $1 AND l.account_id = $2", [result.adjustment.id, account]);
  assert.deepEqual(credited.rows, [{ debit: 5, credit: 0 }]);
  assert.equal((await database.query("SELECT count(*)::int AS count FROM inventory_movements WHERE transaction_id = $1", [result.adjustment.id])).rows[0].count, 2);

  const duplicate = await routes.POST(post({ companyId, locationId, type: "quantity", date: "2026-10-17", reference: "adj-t1", accountId: account, lines: [{ itemId: a, newQuantity: 6 }] }));
  assert.equal(duplicate.status, 409);
  const stale = await routes.POST(post({ companyId, locationId, type: "quantity", date: "2026-10-17", accountId: account, lines: [{ itemId: a, newQuantity: 6, expectedQuantity: 10 }] }));
  assert.equal(stale.status, 409);
  assert.equal(await quantity(a), 7);

  const valued = await routes.POST(post({ companyId, locationId, type: "value", date: "2026-10-17", accountId: account, currency: "USD", exchangeRate: 3.6725, lines: [{ itemId: a, newValue: 10 }] }));
  const valuedResult = await valued.json();
  assert.equal(valued.status, 201, JSON.stringify(valuedResult));
  assert.equal(valuedResult.adjustment.totalValue, 1.73);
  const entry = (await database.query("SELECT currency, exchange_rate FROM journal_entries WHERE transaction_id = $1", [valuedResult.adjustment.id])).rows[0];
  assert.deepEqual(entry, { currency: "USD", exchange_rate: 3.6725 });
  assert.equal((await database.query("SELECT cost FROM items WHERE id = $1", [a])).rows[0].cost, 5.2471);

  const generic = await records.POST(post({ kind: "transactions", type: "inventory adjustment", companyId, locationId, party: "x", lines: [] }));
  assert.equal(generic.status, 409);

  const del = (body) => new Request("https://app.test/api/stock-adjustments", { method: "DELETE", headers: { origin: "https://app.test", "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await routes.DELETE(del({ companyId, id: result.adjustment.id }))).status, 400);
  const removed = await routes.DELETE(del({ companyId, id: valuedResult.adjustment.id, reason: "Test reversal" }));
  assert.equal(removed.status, 200, await removed.text());
  assert.equal((await database.query("SELECT cost FROM items WHERE id = $1", [a])).rows[0].cost, 5);
  assert.equal((await routes.DELETE(del({ companyId, id: result.adjustment.id, reason: "Test reversal" }))).status, 200);
  assert.equal(await quantity(a), 10);
  assert.equal(await quantity(b), 4);
  assert.equal((await database.query("SELECT count(*)::int AS count FROM transactions WHERE company_id = $1 AND type = 'inventory adjustment'", [companyId])).rows[0].count, 0);
});

test("a cheque paying a bill through Accounts Payable is not counted as a second purchase", async () => {
  const workspaces = await vite.ssrLoadModule("/app/api/workspaces/route.ts");
  const company = (await (await workspaces.POST(post({ type: "company", name: "Cheque Purchase Company", baseCurrency: "AED" }))).json()).company;
  const id = company.id, location = company.locations[0].id;
  const payable = (await database.query("SELECT name FROM accounts WHERE company_id = $1 AND system_role = 'AP' AND currency = 'AED'", [id])).rows[0].name;
  const insert = (number, type, account, subtotal, billId = null) => database.query("INSERT INTO transactions (company_id, location_id, number, type, party, account, transaction_date, status, subtotal, total, base_total, bill_id) VALUES ($1, $2, $3, $4, 'Supplier', $5, '2026-10-01', 'paid', $6, $6, $6, $7) RETURNING id", [id, location, number, type, account, subtotal, billId]);
  const bill = (await insert("BILL-1", "bill", payable, 1000)).rows[0].id;
  await insert("BILL-2", "bill", payable, 500);
  await insert("CHQ-LINKED", "cheque", payable, 1000, bill);
  await insert("CHQ-AP", "cheque", payable, 500);
  await insert("CHQ-EXPENSE", "cheque", "Operating Expenses", 200);
  const { GET } = await vite.ssrLoadModule("/app/api/reports/route.ts");
  const report = async (type) => (await (await GET(new Request(`https://app.test/api/reports?companyId=${id}&locationId=${location}&type=${type}&periodStart=2026-01-01&periodEnd=2026-12-31`))).json()).report;
  const final = await report("business-final");
  assert.equal(final.rows.find((row) => row.metric === "Purchase spend").amount, 1700);
  const bySupplier = await report("purchases-by-vendor");
  assert.equal(bySupplier.rows.reduce((sum, row) => sum + Number(row.purchases ?? 0), 0), 1700);
  const detail = await report("purchases-by-supplier-detail");
  assert.deepEqual(detail.rows.map((row) => row.number).sort(), ["BILL-1", "BILL-2", "CHQ-EXPENSE"]);
});

test("reports tag foreign-currency accounts with their own-currency balance", async () => {
  const workspaces = await vite.ssrLoadModule("/app/api/workspaces/route.ts");
  const company = (await (await workspaces.POST(post({ type: "company", name: "Currency Report Company", baseCurrency: "AED" }))).json()).company;
  const id = company.id, location = company.locations[0].id;
  await database.query("INSERT INTO exchange_rates (company_id, currency_code, rate) VALUES ($1, 'USD', 3.67) ON CONFLICT DO NOTHING", [id]);
  const usd = (await database.query("INSERT INTO accounts (company_id, code, name, type, currency) VALUES ($1, 'NBD-USD', 'NBD-USD', 'Bank', 'USD') RETURNING id", [id])).rows[0].id;
  const equity = (await database.query("SELECT id FROM accounts WHERE company_id = $1 AND type = 'Equity' LIMIT 1", [id])).rows[0].id;
  const journals = await vite.ssrLoadModule("/app/api/journal-entries/route.ts");
  const posted = await journals.POST(post({ companyId: id, locationId: location, entryDate: "2026-10-01", reference: "FX-1", description: "USD capital", currency: "USD", exchangeRate: 3.67, lines: [{ accountId: usd, debit: 1000 }, { accountId: equity, credit: 1000 }] }));
  assert.equal(posted.status, 201, await posted.text());
  const { GET } = await vite.ssrLoadModule("/app/api/reports/route.ts");
  const report = (await (await GET(new Request(`https://app.test/api/reports?companyId=${id}&locationId=${location}&type=balance-sheet-detail&periodStart=2026-01-01&periodEnd=2026-12-31`))).json()).report;
  const row = report.rows.find((entry) => entry.account === "NBD-USD");
  assert.ok(row, JSON.stringify(report.rows.map((entry) => entry.account)));
  assert.equal(row.originalCurrency, "USD", JSON.stringify(row));
  assert.equal(Math.round(Number(row.amount) / row.originalRate * 100) / 100, 1000);
  assert.equal(report.rows.filter((entry) => entry.originalCurrency).every((entry) => entry.originalCurrency !== "AED"), true);
});
