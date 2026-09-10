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
