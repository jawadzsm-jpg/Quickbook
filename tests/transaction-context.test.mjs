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
        import { salesRouteAllowed } from "/lib/sales-access.ts";
        import { hasPermission, isAdministrator, canAccessCompany } from "/lib/access.ts";
        export const requireApiUser = async (request, required = false) => {
          const user = globalThis.__transferTestUser ?? { id: 1, email: "test@example.test", role: "all_admin", companyIds: [], mustChangePassword: false };
          if (user instanceof Response) return user;
          if (user.role === "sales" && !salesRouteAllowed(new URL(request.url).pathname, request.method)) return Response.json({ error: "Sales workspace only." }, { status: 403 });
          if ((request.method === "DELETE" && !["/api/auth/session", "/api/sku-locks"].includes(new URL(request.url).pathname) && !(user.role === "inventory" && new URL(request.url).pathname === "/api/records") || required === true) && !isAdministrator(user)) return Response.json({ error: "Administrator required." }, { status: 403 });
          if (typeof required === "string" && !hasPermission(user, required)) return Response.json({ error: "Permission denied." }, { status: 403 });
          return user;
        };
        export const requireCompanyAccess = async (request, companyId, required = false) => {
          const user = await requireApiUser(request, required);
          if (user instanceof Response) return user;
          if (user.role === "sales" && !salesRouteAllowed(new URL(request.url).pathname, request.method)) return Response.json({ error: "Sales workspace only." }, { status: 403 });
          return canAccessCompany(user, companyId) ? user : Response.json({ error: "Company denied." }, { status: 403 });
        };
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
      const historyResponse = await GET(new Request('https://app.test/api/transfers'));
      if (role === "sales") assert.equal(historyResponse.status, 403);
      else assert.equal((await historyResponse.json()).records.find((r) => r.id === id).canEdit, false);
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

test("warranty slips link only the selected company's customer and invoice, and keep A4 stamp positions", async () => {
  await database.query("INSERT INTO app_users(id,email,password_hash,role) VALUES(1,'test@example.test','test','admin') ON CONFLICT (id) DO NOTHING");
  await database.query("SELECT setval(pg_get_serial_sequence('app_users','id'), GREATEST(1,(SELECT COALESCE(max(id),1) FROM app_users)))");
  const companyId = (await database.query("INSERT INTO companies(name) VALUES('Warranty test company') RETURNING id")).rows[0].id;
  const otherId = (await database.query("INSERT INTO companies(name) VALUES('Other warranty company') RETURNING id")).rows[0].id;
  const customerId = (await database.query("INSERT INTO contacts(company_id,type,name) VALUES($1,'customer','Warranty Buyer') RETURNING id", [companyId])).rows[0].id;
  const foreignCustomerId = (await database.query("INSERT INTO contacts(company_id,type,name) VALUES($1,'customer','Another Buyer') RETURNING id", [otherId])).rows[0].id;
  const supplierId = (await database.query("INSERT INTO contacts(company_id,type,name,company,billing_name) VALUES($1,'vendor','Warranty Supplier','Warranty Supplier LLC','Warranty Billing') RETURNING id", [companyId])).rows[0].id;
  const otherSupplierId = (await database.query("INSERT INTO contacts(company_id,type,name) VALUES($1,'vendor','Other Supplier') RETURNING id", [companyId])).rows[0].id;
  const foreignSupplierId = (await database.query("INSERT INTO contacts(company_id,type,name) VALUES($1,'vendor','Foreign Supplier') RETURNING id", [otherId])).rows[0].id;
  const invoiceId = (await database.query("INSERT INTO transactions(company_id,number,type,party,transaction_date) VALUES($1,'INV-WAR','invoice','Warranty Buyer','2026-09-25') RETURNING id", [companyId])).rows[0].id;
  const purchaseBillId = (await database.query("INSERT INTO transactions(company_id,number,type,party,transaction_date) VALUES($1,'BILL-WAR','bill','Warranty Supplier LLC','2026-07-01') RETURNING id", [companyId])).rows[0].id;
  const otherBillId = (await database.query("INSERT INTO transactions(company_id,number,type,party,transaction_date) VALUES($1,'BILL-OTHER','bill','Other Supplier','2026-07-01') RETURNING id", [companyId])).rows[0].id;
  const foreignBillId = (await database.query("INSERT INTO transactions(company_id,number,type,party,transaction_date) VALUES($1,'BILL-FOREIGN','bill','Warranty Supplier','2026-07-01') RETURNING id", [otherId])).rows[0].id;
  const invoiceLineId = (await database.query("INSERT INTO transaction_lines(transaction_id,description,serial_number) VALUES($1,'Laptop','SN-123') RETURNING id", [invoiceId])).rows[0].id;
  const { GET, POST, PATCH, DELETE } = await vite.ssrLoadModule('/app/api/warranty-slips/route.ts');
  const values = { companyId, customerId, invoiceId, invoiceLineId, supplierId, purchaseBillId, slipDate: '2026-09-25', problem: 'Screen flickers', brand: 'HP', model: 'EliteBook', contactName: 'Buyer', status: 'Under Process', showStamp: true, stampLeft: 75, stampTop: 210 };
  const write = (input, edit = false) => (edit ? PATCH : POST)(new Request('https://app.test/api/warranty-slips', { method: edit ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }));
  assert.equal((await write({ ...values, customerId: foreignCustomerId })).status, 400);
  assert.equal((await write({ ...values, supplierId: foreignSupplierId })).status, 400);
  assert.equal((await write({ ...values, supplierId: otherSupplierId })).status, 400);
  assert.equal((await write({ ...values, purchaseBillId: otherBillId })).status, 400);
  assert.equal((await write({ ...values, purchaseBillId: foreignBillId })).status, 400);
  assert.equal((await write({ ...values, supplierId: null, purchaseBillId: null, status: 'Returned to Supplier' })).status, 400);
  assert.equal((await write({ ...values, returnedToSupplierDate: '2026-09-26', receivedFromSupplierDate: '2026-09-25' })).status, 400);
  assert.equal((await write({ ...values, stampLeft: 171 })).status, 400);
  const created = await write({ ...values, returnedToSupplierDate: '2026-09-26', receivedFromSupplierDate: '2026-09-30' });
  assert.equal(created.status, 201, await created.clone().text());
  const slip = (await created.json()).slip;
  assert.equal(slip.invoiceNumber, 'INV-WAR');
  assert.equal(slip.supplierName, 'Warranty Supplier');
  assert.equal(slip.purchaseNumber, 'BILL-WAR');
  assert.equal(slip.purchaseDate, '2026-07-01');
  assert.equal(slip.returnedToSupplierDate, '2026-09-26');
  assert.equal(slip.receivedFromSupplierDate, '2026-09-30');
  assert.equal(slip.stampLeft, 75);
  const companyList = await GET(new Request(`https://app.test/api/warranty-slips?companyId=${companyId}`));
  const linked = await companyList.json();
  assert.ok(linked.suppliers.some((supplier) => supplier.id === supplierId));
  assert.equal(linked.purchaseBills.find((bill) => bill.id === purchaseBillId).transactionDate, '2026-07-01');
  assert.equal(linked.purchaseBills.find((bill) => bill.id === purchaseBillId).supplierId, supplierId);
  const foreignList = await GET(new Request(`https://app.test/api/warranty-slips?companyId=${otherId}`));
  assert.equal((await foreignList.json()).slips.length, 0);
  const updated = await write({ ...slip, companyId, revision: slip.updatedAt, stampLeft: 110, status: 'Completed' }, true);
  assert.equal(updated.status, 200, await updated.clone().text());
  assert.equal((await updated.json()).slip.stampLeft, 110);
  assert.equal((await write({ ...slip, companyId, revision: slip.updatedAt, status: 'Returned' }, true)).status, 409);
  let current = (await (await GET(new Request(`https://app.test/api/warranty-slips?companyId=${companyId}`))).json()).slips[0];
  for (const status of ['Returned to Supplier', 'Under Process', 'Completed', 'Returned to Customer']) {
    const response = await write({ ...current, companyId, revision: current.updatedAt, status }, true);
    assert.equal(response.status, 200, `${status}: ${await response.clone().text()}`);
    current = (await response.json()).slip;
    assert.equal(current.status, status);
  }
  assert.equal((await write({ ...current, companyId, revision: current.updatedAt, status: 'Missing' }, true)).status, 400);
  await database.query("UPDATE warranty_slips SET status = 'Returned' WHERE id = $1", [current.id]);
  const legacyList = await GET(new Request(`https://app.test/api/warranty-slips?companyId=${companyId}`));
  assert.equal((await legacyList.json()).slips[0].status, 'Returned to Customer');
  const detail = await GET(new Request(`https://app.test/api/warranty-slips?companyId=${companyId}&invoiceId=${invoiceId}`));
  assert.equal((await detail.json()).lines[0].serialNumber, 'SN-123');
  const latest = (await (await GET(new Request(`https://app.test/api/warranty-slips?companyId=${companyId}`))).json()).slips[0];
  const remove = (body) => DELETE(new Request('https://app.test/api/warranty-slips', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  assert.equal((await remove({ companyId: otherId, id: latest.id, revision: latest.updatedAt })).status, 404);
  assert.equal((await remove({ companyId, id: latest.id, revision: 'stale' })).status, 409);
  assert.equal((await remove({ companyId, id: latest.id, revision: latest.updatedAt })).status, 200);
  assert.equal((await (await GET(new Request(`https://app.test/api/warranty-slips?companyId=${companyId}`))).json()).slips.length, 0);
  assert.equal((await database.query("SELECT action FROM audit_log WHERE company_id=$1 AND entity_type='warranty_slip' AND entity_id=$2 ORDER BY id DESC LIMIT 1", [companyId, latest.id])).rows[0].action, 'deleted');
});

test("warranty invoice items link their supplier from bills, received item bills or the preferred supplier", async () => {
  const company = (await database.query("INSERT INTO companies(name) VALUES('Warranty link company') RETURNING id")).rows[0].id;
  const location = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES($1,'WLINK','Warranty link stock','WLK') RETURNING id", [company])).rows[0].id;
  const vendor = async (name) => (await database.query("INSERT INTO contacts(company_id,type,name) VALUES($1,'vendor',$2) RETURNING id", [company, name])).rows[0].id;
  const [digitech, alpha, preferredVendor] = [await vendor('Digitech Distribution'), await vendor('Alpha Supply'), await vendor('Preferred Parts')];
  const item = async (sku, preferred = null) => (await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity,preferred_supplier_id) VALUES($1,$2,$3,$3,5,$4) RETURNING id", [company, location, sku, preferred])).rows[0].id;
  const [poItem, multiItem, noBillItem] = [await item('WL-PO'), await item('WL-MULTI'), await item('WL-NOBILL', preferredVendor)];
  const doc = async (number, type, party, date) => (await database.query("INSERT INTO transactions(company_id,location_id,number,type,party,transaction_date) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [company, location, number, type, party, date])).rows[0].id;
  const line = (transaction, itemId, serial = '') => database.query("INSERT INTO transaction_lines(transaction_id,item_id,description,quantity,serial_number) VALUES($1,$2,'Line',1,$3) RETURNING id", [transaction, itemId, serial]);
  // A bill created by receiving a purchase order is a "received item bill".
  await line(await doc('RIB-1', 'received item bill', 'Digitech Distribution', '2026-08-01'), poItem, 'PO-SN-1');
  // Two ordinary bills for the same item, no serial numbers: the latest one on or before the invoice date wins.
  await line(await doc('BILL-OLD', 'bill', 'Digitech Distribution', '2026-07-01'), multiItem);
  await line(await doc('BILL-NEW', 'bill', 'Alpha Supply', '2026-08-15'), multiItem);
  await line(await doc('BILL-AFTER', 'bill', 'Digitech Distribution', '2026-12-01'), multiItem);
  const invoice = await doc('INV-WLINK', 'invoice', 'Buyer', '2026-09-01');
  await line(invoice, poItem, 'PO-SN-1'); await line(invoice, multiItem); await line(invoice, noBillItem);
  const { GET } = await vite.ssrLoadModule('/app/api/warranty-slips/route.ts');
  const { lines } = await (await GET(new Request(`https://app.test/api/warranty-slips?companyId=${company}&invoiceId=${invoice}`))).json();
  const byItem = (id) => lines.find((row) => row.itemId === id);
  assert.deepEqual([byItem(poItem).supplierId, byItem(poItem).purchaseNumber, byItem(poItem).supplierSource], [digitech, 'RIB-1', 'serial']);
  assert.deepEqual([byItem(multiItem).supplierId, byItem(multiItem).purchaseNumber, byItem(multiItem).purchaseDate, byItem(multiItem).supplierSource], [alpha, 'BILL-NEW', '2026-08-15', 'latest-bill']);
  assert.deepEqual([byItem(noBillItem).supplierId, byItem(noBillItem).supplierName, byItem(noBillItem).purchaseBillId, byItem(noBillItem).supplierSource], [preferredVendor, 'Preferred Parts', null, 'preferred']);
  assert.equal('preferredSupplierId' in byItem(noBillItem), false);
  // Received item bills are also offered (and accepted) as the slip's purchase bill.
  const list = await (await GET(new Request(`https://app.test/api/warranty-slips?companyId=${company}`))).json();
  assert.ok(list.purchaseBills.some((bill) => bill.number === 'RIB-1' && bill.supplierId === digitech));
  // Saving a slip with an invoiced item but no supplier links the supplier automatically.
  const { POST } = await vite.ssrLoadModule('/app/api/warranty-slips/route.ts');
  const buyer = (await database.query("INSERT INTO contacts(company_id,type,name) VALUES($1,'customer','Buyer') RETURNING id", [company])).rows[0].id;
  const saved = await POST(new Request('https://app.test/api/warranty-slips', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ companyId: company, customerId: buyer, invoiceId: invoice, invoiceLineId: byItem(multiItem).id, supplierId: null, purchaseBillId: null, slipDate: '2026-09-20', problem: 'Display', status: 'Under Process', contactName: 'Buyer', showStamp: false, stampLeft: 75, stampTop: 210 }) }));
  assert.equal(saved.status, 201, await saved.clone().text());
  const slip = (await saved.json()).slip;
  assert.deepEqual([slip.supplierId, slip.supplierName, slip.purchaseNumber, slip.purchaseDate], [alpha, 'Alpha Supply', 'BILL-NEW', '2026-08-15']);
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

test('professional Chart of Accounts installer preserves existing records and links standard sub-accounts', async () => {
  const companyId=(await database.query("INSERT INTO companies(name,base_currency) VALUES('COA standard installer','AED') RETURNING id")).rows[0].id;
  const existing=(await database.query("INSERT INTO accounts(company_id,code,name,type,system_role,currency,balance) VALUES($1,'1000','Business Bank','Bank','BANK','AED',321) RETURNING id",[companyId])).rows[0];
  const {POST}=await vite.ssrLoadModule('/app/api/records/route.ts');
  const install=()=>POST(new Request('https://app.test/api/records',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'accounts',companyId,standardTemplate:true,currency:'AED'})}));
  const first=await install();
  assert.equal(first.status,200,await first.clone().text());
  assert.ok((await first.json()).installed>40);
  const second=await install();
  assert.deepEqual(await second.json(),{installed:0,total:58});
  const preserved=(await database.query('SELECT id,balance FROM accounts WHERE company_id=$1 AND code=$2',[companyId,'1000'])).rows[0];
  assert.deepEqual(preserved,{id:existing.id,balance:321});
  const child=(await database.query("SELECT child.name,parent.name AS parent FROM accounts child LEFT JOIN accounts parent ON parent.id=child.parent_account_id WHERE child.company_id=$1 AND child.code='6110'",[companyId])).rows[0];
  assert.deepEqual(child,{name:'Rent Expense',parent:'Operating Expenses'});
  assert.equal((await database.query("SELECT count(*)::int AS count FROM accounts WHERE company_id=$1 AND system_role IN ('INPUT_VAT','OUTPUT_VAT')",[companyId])).rows[0].count,2);
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
  const request = (method, payload={}) => new Request('https://app.test/api/records', {method,headers:{'content-type':'application/json'},body:JSON.stringify({deletionReason: 'Correcting test record', kind:'contacts',id:vendor,companyId:company,...payload})});
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
  const pay = (account, changes = {}) => POST(new Request('https://app.test/api/records', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'transactions', companyId, type: 'customer payment', account, number: 'PAY-SELECTED', paymentMethod: 'Bank transfer', referenceNo: 'BANK-REF-7788', party: 'Payment Customer', currency: 'USD', exchangeRate: 3.675, transactionDate: '2026-09-11', lines: [{ description: 'Payment received', quantity: 1, unitPrice: 100, unitCost: 0, vatCode: 'ZERO' }], ...changes }) }));
  for (const account of ['', 'Missing Bank', 'Closed Bank', 'Expense only', 'Foreign Company Bank']) assert.equal((await pay(account)).status, 400);
  assert.equal((await database.query('SELECT count(*)::int AS n FROM transactions WHERE company_id = $1', [companyId])).rows[0].n, 0);
  const response = await pay('Selected USD Bank');
  assert.equal(response.status, 201);
  const record = (await response.json()).record;
  assert.equal(record.account, 'Selected USD Bank');
  assert.equal(record.paymentMethod, 'Bank transfer');
  assert.equal(record.referenceNo, 'BANK-REF-7788');
  assert.equal(record.vatAmount, 0);
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
  const alignCheque = (revision, chequeOffsetX, chequeAmountOffsetX, chequeDateOffsetX = 0, chequeCrossingOffsetX = 0) => PATCH(new Request('https://app.test/api/records', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'transactions', companyId, id: savedChequeIds[0], revision, editMode: 'cheque-layout', chequeBankKey: 'habib-bank-ag-zurich', chequeOffsetX, chequeOffsetY: 0, chequeAmountOffsetX, chequeDateOffsetX, chequeCrossingOffsetX }) }));
  assert.equal((await alignCheque(chequeDetail.revision, 25, 0)).status, 400);
  assert.equal((await alignCheque(chequeDetail.revision, 0, 0, 38)).status, 400);
  assert.equal((await alignCheque(chequeDetail.revision, 0, 0, 0, 136)).status, 400);
  const aligned = await alignCheque(chequeDetail.revision, 0, -70, 30, 50);
  assert.equal(aligned.status, 200);
  const alignedDetail = await (await GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${companyId}&id=${savedChequeIds[0]}`))).json();
  assert.equal(alignedDetail.record.chequeBankKey, 'habib-bank-ag-zurich');
  assert.equal(alignedDetail.record.chequeAmountOffsetX, -70);
  assert.equal(alignedDetail.record.chequeDateOffsetX, 30);
  assert.equal(alignedDetail.record.chequeCrossingOffsetX, 50);
  assert.equal((await alignCheque(chequeDetail.revision, 0, 0)).status, 409);
  const renameCheque = (id, revision, number) => PATCH(new Request('https://app.test/api/records', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'transactions', companyId, id, revision, editMode: 'cheque-number', number }) }));
  const renamed = await renameCheque(savedChequeIds[0], alignedDetail.revision, 'CHQ-EDITED');
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
  for (const id of [finalId,partialId]) assert.equal((await DELETE(new Request('https://app.test/api/records',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({deletionReason: 'Correcting test record', kind:'transactions',companyId,id})}))).status,200);
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
  const remove = (id) => DELETE(new Request('https://app.test/api/records',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({deletionReason: 'Correcting test record', kind:'transactions',companyId,id})}));
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
      if (role === 'accountant') assert.equal((await listing()).entries.find(e => e.id === id).canManage, false);
      else assert.equal((await GET(new Request(`https://app.test/api/journal-entries?companyId=${companyId}&locationId=${locationId}`))).status, 403);
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
    for (const role of ['all_admin', 'admin', 'accountant', 'sales', 'purchasing', 'inventory', 'customization', 'viewer']) {
      globalThis.__transferTestUser = { id: 1, role, companyIds: [] };
      const response = await GET(new Request('http://localhost/api/inventory-overview'));
      assert.equal(response.status, 200);
      const body = await response.json(); assert.equal(body.canSelectItems, true); assert.equal(body.canBulkSelect, ['all_admin', 'admin'].includes(role));
    }
  } finally { delete globalThis.__transferTestUser; }
});

test('product customization details fall back to item specifications and save linked fields', async () => {
  const company = (await database.query("INSERT INTO companies (name) VALUES ('Customization company') RETURNING id")).rows[0].id;
  const location = (await database.query("INSERT INTO inventory_locations (company_id, code, name, invoice_prefix) VALUES ($1, 'CUSTOM', 'Customization store', 'CUS') RETURNING id", [company])).rows[0].id;
  const item = (await database.query(
    "INSERT INTO items (company_id, location_id, item_number, sku, name, specifications) VALUES ($1, $2, '14001', 'CUSTOM-1', 'Upgradeable Laptop', $3) RETURNING id",
    [company, location, JSON.stringify([{ label: 'RAM', value: '8GB' }, { label: 'Storage', value: '512GB SSD' }, { label: 'Part Number', value: 'PN-OLD' }])],
  )).rows[0].id;
  const api = await vite.ssrLoadModule('/app/api/item-customization/route.ts');
  const list = await api.GET(new Request(`https://app.test/api/item-customization?companyId=${company}&locationId=${location}`));
  assert.equal(list.status, 200);
  const initial = (await list.json()).records[0];
  assert.deepEqual([initial.customizationRam, initial.customizationStorage, initial.partNumber], ['8GB', '512GB SSD', 'PN-OLD']);
  const save = await api.PATCH(new Request('https://app.test/api/item-customization', { method: 'PATCH', headers: { origin: 'https://app.test', 'content-type': 'application/json' }, body: JSON.stringify({ companyId: company, locationId: location, records: [{ id: item, customizationRam: '16gb ddr5', customizationStorage: '1tb ssd', customizationScreen: '15.6 fhd ips', partNumber: 'pn-new', itemSerialNumber: 'sn-001', upcNumber: '123456789012', customizationDetails: 'User can upgrade the second RAM slot.' }] }) }));
  assert.equal(save.status, 200, await save.clone().text());
  const stored = (await database.query('SELECT customization_ram, customization_storage, customization_screen, part_number, item_serial_number, upc_number, customization_details, specifications FROM items WHERE id=$1', [item])).rows[0];
  assert.deepEqual(Object.fromEntries(Object.entries(stored).filter(([key]) => key !== 'specifications')), { customization_ram: '16GB DDR5', customization_storage: '1TB SSD', customization_screen: '15.6 FHD IPS', part_number: 'PN-NEW', item_serial_number: 'SN-001', upc_number: '123456789012', customization_details: 'User can upgrade the second RAM slot.' });
  const specs = JSON.parse(stored.specifications);
  assert.equal(specs.find(entry => entry.label === 'RAM').value, '16GB DDR5');
  assert.equal(specs.find(entry => entry.label === 'Part Number').value, 'PN-NEW');
});

test('inventory overview activity links incoming, 12-hour bill arrivals, price changes, and sold sales reps', async () => {
  const company = (await database.query("INSERT INTO companies (name,base_currency) VALUES ('Inventory activity company','AED') RETURNING id")).rows[0].id;
  const location = (await database.query("INSERT INTO inventory_locations (company_id,code,name,invoice_prefix) VALUES ($1,'ACT','Activity store','ACT') RETURNING id", [company])).rows[0].id;
  const item = (await database.query("INSERT INTO items (company_id,location_id,item_number,sku,name,quantity,sales_price,customization_ram,customization_storage,part_number,customization_details) VALUES ($1,$2,'ACT-100','ACT-SKU','Activity laptop',8,1250,'16GB','1TB SSD','ACT-PN','Upgrade-ready') RETURNING id", [company, location])).rows[0].id;
  const purchaseOrder = (await database.query("INSERT INTO transactions (company_id,location_id,number,type,party,salesman,transaction_date,status) VALUES ($1,$2,'PO-ACT-1','purchase order','Activity supplier','Buyer one','2026-09-29','open') RETURNING id", [company, location])).rows[0].id;
  const purchaseLine = (await database.query("INSERT INTO transaction_lines (transaction_id,item_id,description,quantity,unit_price) VALUES ($1,$2,'Activity laptop',10,900) RETURNING id", [purchaseOrder, item])).rows[0].id;
  const receipt = (await database.query("INSERT INTO transactions (company_id,location_id,number,type,party,transaction_date,status) VALUES ($1,$2,'BILL-ACT-1','bill','Activity supplier','2026-09-29','open') RETURNING id", [company, location])).rows[0].id;
  await database.query("INSERT INTO purchase_receipt_allocations (receipt_id,order_line_id,quantity) VALUES ($1,$2,3)", [receipt, purchaseLine]);
  await database.query("INSERT INTO transaction_lines (transaction_id,item_id,description,quantity,unit_price) VALUES ($1,$2,'Activity laptop',3,900)", [receipt, item]);
  await database.query("INSERT INTO inventory_movements (transaction_id,item_id,movement_date,movement_type,quantity,reference) VALUES ($1,$2,'2026-09-29','bill',3,'BILL-ACT-1')", [receipt, item]);
  const unreceivedItem = (await database.query("INSERT INTO items (company_id,location_id,sku,name) VALUES ($1,$2,'ACT-UNRECEIVED','Unreceived item') RETURNING id", [company, location])).rows[0].id;

  const invoice = (await database.query("INSERT INTO transactions (company_id,location_id,number,type,party,salesman,transaction_date,status,currency) VALUES ($1,$2,'INV-ACT-1','invoice','Activity customer','Rep One','2026-09-29','open','AED') RETURNING id", [company, location])).rows[0].id;
  await database.query("INSERT INTO transaction_lines (transaction_id,item_id,description,quantity,unit_price) VALUES ($1,$2,'Activity laptop',2,1250)", [invoice, item]);
  await database.query("INSERT INTO audit_log (company_id,action,entity_type,entity_id,details,created_at) VALUES ($1,'updated','item',$2,$3,now()-interval '13 hours')", [company, item, JSON.stringify({ reason: 'Stock pricing', before: { salesPrice: 0 }, after: { salesPrice: 1200 } })]);
  await database.query("INSERT INTO audit_log (company_id,action,entity_type,entity_id,details) VALUES ($1,'updated','item',$2,$3),($1,'updated','item',$2,$4)", [company, item, JSON.stringify({ reason: 'Stock pricing', before: { salesPrice: 1200 }, after: { salesPrice: 1250 } }), JSON.stringify({ reason: 'Stock pricing', before: { salesPrice: 1250 }, after: { salesPrice: 1300 } })]);
  const { GET } = await vite.ssrLoadModule('/app/api/inventory-overview/route.ts');
  try {
    globalThis.__transferTestUser = { id: 1, role: 'admin', companyIds: [company] };
    const response = await GET(new Request('https://app.test/api/inventory-overview'));
    assert.equal(response.status, 200);
    const data = await response.json();
    const overviewRecord = data.records.find(row => row.id === item);
    assert.deepEqual([overviewRecord.customizationRam, overviewRecord.customizationStorage, overviewRecord.partNumber, overviewRecord.customizationDetails], ['16GB', '1TB SSD', 'ACT-PN', 'Upgrade-ready']);
    assert.ok(Number.isFinite(new Date(overviewRecord.latestReceivedAt).getTime()));
    const incoming = data.activity.incoming.find(row => row.itemId === item);
    assert.equal(incoming.quantity, 7);
    assert.equal(incoming.documentType, 'purchase order'); assert.equal(incoming.documentStatus, 'open');
    assert.equal(incoming.transactionId, purchaseOrder); assert.equal(incoming.documentNumber, 'PO-ACT-1');
    assert.equal(incoming.linkedBillId, receipt); assert.equal(incoming.linkedBillNumber, 'BILL-ACT-1');
    const arrival = data.activity.launched.find(row => row.itemId === item);
    assert.equal(arrival.transactionId, receipt); assert.equal(arrival.documentNumber, 'BILL-ACT-1');
    assert.equal(arrival.quantity, 3); assert.equal(arrival.price, 900); assert.equal(arrival.party, 'Activity supplier');
    assert.ok(!data.activity.launched.some(row => row.itemId === unreceivedItem));
    const itemPriceChanges = data.activity.priceChanges.filter(row => row.itemId === item);
    assert.equal(itemPriceChanges.length, 1);
    assert.deepEqual(Object.fromEntries(Object.entries(itemPriceChanges[0]).filter(([key]) => ['previousPrice', 'currentPrice'].includes(key))), { previousPrice: 1250, currentPrice: 1300 });
    const sold = data.activity.sold.find(row => row.transactionId === invoice && row.itemId === item);
    assert.equal(sold.salesRep, 'Rep One'); assert.equal(sold.documentNumber, 'INV-ACT-1'); assert.equal(sold.companyId, company); assert.equal(sold.locationId, location);
    await database.query("UPDATE transactions SET status='converted' WHERE id=$1", [purchaseOrder]);
    assert.ok(!(await (await GET(new Request('https://app.test/api/inventory-overview'))).json()).activity.incoming.some(row => row.transactionId === purchaseOrder));
    // Business dates do not determine arrival age: use the actual bill-save timestamp.
    await database.query("UPDATE transactions SET created_at=now()-interval '11 hours 59 minutes',transaction_date='2020-01-01' WHERE id=$1", [receipt]);
    assert.ok((await (await GET(new Request('https://app.test/api/inventory-overview'))).json()).activity.launched.some(row => row.transactionId === receipt));
    await database.query("UPDATE transactions SET created_at=now()-interval '12 hours' WHERE id=$1", [receipt]);
    assert.ok(!(await (await GET(new Request('https://app.test/api/inventory-overview'))).json()).activity.launched.some(row => row.transactionId === receipt));
    await database.query("UPDATE transactions SET created_at=now(),status='cancelled' WHERE id=$1", [receipt]);
    assert.ok(!(await (await GET(new Request('https://app.test/api/inventory-overview'))).json()).activity.launched.some(row => row.transactionId === receipt));
    await database.query("UPDATE audit_log SET created_at=now()-interval '12 hours' WHERE entity_type='item' AND entity_id=$1", [item]);
    assert.ok(!(await (await GET(new Request('https://app.test/api/inventory-overview'))).json()).activity.priceChanges.some(row => row.itemId === item));

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
  const remove = id => DELETE(request('DELETE', { deletionReason: 'Correcting test record', kind: 'transactions', companyId, id }));
  const billResponse = await create('bill', 10); assert.equal(billResponse.status, 201);
  const bill = (await billResponse.json()).record;
  assert.deepEqual(await stock(), { quantity: 10, last_purchase_price: 367.5 });
  const orderResponse = await create('sales order', 3); assert.equal(orderResponse.status, 201);
  const order = (await orderResponse.json()).record;
  assert.equal((await stock()).quantity, 10);
  assert.equal(order.bankAccountKey, '', 'new documents follow their currency');
  await database.query("UPDATE transactions SET bank_account_key='usd-chosen' WHERE id=$1", [order.id]);
  const invoiceResponse = await create('invoice', 3, { sourceTransactionId: order.id }); assert.equal(invoiceResponse.status, 201);
  const invoice = (await invoiceResponse.json()).record;
  assert.equal(invoice.bankAccountKey, 'usd-chosen', 'a converted invoice keeps the bank account chosen on its source');
  // Documents saved without payment terms, and invoices converted from them, are due on receipt; bills stay blank.
  assert.equal(order.terms, 'Due on receipt'); assert.equal(invoice.terms, 'Due on receipt'); assert.equal(bill.terms, '');
  assert.equal((await stock()).quantity, 7);
  assert.equal((await create('invoice', 3, { sourceTransactionId: order.id })).status, 409);
  assert.equal((await create('invoice', 8)).status, 409);
  assert.equal((await stock()).quantity, 7);
  assert.equal((await remove(bill.id)).status, 409);
  assert.equal((await stock()).quantity, 7);
  assert.equal((await database.query('SELECT count(*)::int AS n FROM transactions WHERE id=$1', [bill.id])).rows[0].n, 1);
  const voidResponse = await remove(invoice.id); assert.equal(voidResponse.status, 200);
  assert.equal((await voidResponse.json()).voided, true);
  assert.equal((await stock()).quantity, 10);
  // Deleting an invoice voids it: the document and its item history stay, with who, when and why.
  const voided = (await database.query('SELECT status, voided_at, voided_by_name, void_reason FROM transactions WHERE id=$1', [invoice.id])).rows[0];
  assert.equal(voided.status, 'void'); assert.ok(voided.voided_at); assert.equal(voided.voided_by_name, 'test@example.test'); assert.equal(voided.void_reason, 'Correcting test record');
  assert.deepEqual((await database.query('SELECT movement_type, quantity FROM inventory_movements WHERE transaction_id=$1 ORDER BY id', [invoice.id])).rows.map(row => [row.movement_type, row.quantity]), [['invoice', -3], ['invoice void', 3]]);
  assert.deepEqual((await database.query('SELECT DISTINCT posted FROM journal_entries WHERE transaction_id=$1', [invoice.id])).rows, [{ posted: false }]);
  assert.equal((await database.query('SELECT count(*)::int AS n FROM sales_invoice_allocations WHERE invoice_id=$1', [invoice.id])).rows[0].n, 0);
  assert.equal((await remove(invoice.id)).status, 409);
  assert.equal((await stock()).quantity, 10);
  assert.equal((await database.query("SELECT count(*)::int AS n FROM audit_log WHERE entity_id=$1 AND entity_type='transaction' AND details LIKE '%\"mode\":\"void\"%'", [invoice.id])).rows[0].n, 1);
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
  assert.deepEqual(lines, [{ account_name: 'Accounts Payable - USD', debit: 367.5, credit: 0 }, { account_name: 'Selected USD Bank', debit: 0, credit: 367.5 }]);
  assert.equal((await database.query("SELECT currency FROM accounts WHERE company_id = $1 AND system_role = 'AP' AND name = 'Accounts Payable - USD'", [companyId])).rows[0].currency, 'USD');
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
  assert.equal((await DELETE(request('DELETE', { deletionReason: 'Correcting test record', kind:'transactions',companyId,id:billId }))).status, 409);
  const second = await POST(request('POST', payload(60))); assert.equal(second.status, 201);
  const secondId = (await second.json()).record.id;
  assert.equal(await status(), 'paid'); assert.equal((await unpaid()).length, 0);
  const detail = await (await GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${companyId}&id=${firstId}`))).json();
  const edited = await PATCH(request('PATCH', payload(20, { id:firstId, revision:detail.revision }))); assert.equal(edited.status, 200);
  assert.equal(await status(), 'partially paid'); assert.equal((await unpaid())[0].remaining, 20);
  assert.equal((await DELETE(request('DELETE', { deletionReason: 'Correcting test record', kind:'transactions',companyId,id:secondId }))).status, 200);
  assert.equal((await unpaid())[0].remaining, 80);
  assert.equal((await DELETE(request('DELETE', { deletionReason: 'Correcting test record', kind:'transactions',companyId,id:firstId }))).status, 200);
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
  assert.equal((await DELETE(request('DELETE', { deletionReason: 'Correcting test record', kind:'transactions',companyId,id:invoiceId }))).status, 409);
  const second = await POST(request('POST', payload(60))); assert.equal(second.status, 201);
  const secondId = (await second.json()).record.id;
  assert.equal(await status(), 'paid'); assert.equal((await unpaid()).length, 0);
  const paidAt = (await database.query('SELECT paid_at FROM transactions WHERE id=$1', [invoiceId])).rows[0].paid_at;
  assert.ok(paidAt);
  assert.ok(Math.abs(Date.now() - new Date(paidAt).getTime()) < 60000);
  assert.equal((await DELETE(request('DELETE', { deletionReason: 'Correcting test record', kind:'transactions',companyId,id:secondId }))).status, 200);
  assert.equal((await unpaid())[0].remaining, 60);
  assert.equal((await database.query('SELECT paid_at FROM transactions WHERE id=$1', [invoiceId])).rows[0].paid_at, null);
  assert.equal((await DELETE(request('DELETE', { deletionReason: 'Correcting test record', kind:'transactions',companyId,id:firstId }))).status, 200);
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
  assert.equal((await DELETE(request('DELETE', {deletionReason: 'Correcting test record', kind:'transactions',companyId,id:older}))).status, 409);
  const full = await pay(150, [newer]); assert.equal(full.status, 201);
  const fullId = (await full.json()).record.id;
  assert.equal((await states())[0].status, 'paid');
  assert.equal((await DELETE(request('DELETE', {deletionReason: 'Correcting test record', kind:'transactions',companyId,id:paymentId}))).status, 200);
  assert.ok((await states()).every((row) => row.status !== 'paid' && row.paid_at === null));
  assert.equal((await database.query('SELECT balance FROM contacts WHERE company_id=$1', [companyId])).rows[0].balance, 150);
  assert.equal((await DELETE(request('DELETE', {deletionReason: 'Correcting test record', kind:'transactions',companyId,id:fullId}))).status, 200);
});

test('vendor purchase orders resolve the payable account in their currency', async () => {
  const companyId = (await database.query("INSERT INTO companies (name) VALUES ('EUR vendor payable') RETURNING id")).rows[0].id;
  const locationId = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES ($1,'EUR-PO','EUR stock','EUR') RETURNING id", [companyId])).rows[0].id;
  const itemId = (await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity,cost) VALUES ($1,$2,'EUR-ITEM','Laptop',0,20) RETURNING id", [companyId, locationId])).rows[0].id;
  await database.query("INSERT INTO contacts(company_id,type,name,currency) VALUES ($1,'vendor','EUR Supplier','EUR')", [companyId]);
  const { GET, POST } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const post = (body) => POST(new Request('https://app.test/api/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  const resolved = await post({ action: 'resolve-vendor-payable', companyId, party: 'EUR Supplier', currency: 'EUR' });
  assert.equal(resolved.status, 200);
  const { account } = await resolved.json();
  assert.equal(account.currency, 'EUR');
  assert.equal((await database.query('SELECT ledger_account_id FROM contacts WHERE company_id=$1 AND name=$2', [companyId, 'EUR Supplier'])).rows[0].ledger_account_id, account.id);
  const order = await post({ kind: 'transactions', companyId, locationId, type: 'purchase order', party: 'EUR Supplier', currency: 'EUR', exchangeRate: 4.27, transactionDate: '2026-09-29', number: 'PO-EUR', account: 'Wrong Account', lines: [{ itemId, description: 'Laptop', quantity: 1, unitPrice: 100, unitCost: 20, vatCode: 'ZERO' }] });
  assert.equal(order.status, 201);
  assert.equal((await order.json()).record.account, account.name);

  await database.query("INSERT INTO accounts(company_id,code,name,type,system_role,currency) VALUES ($1,'5000','Cost of Goods Sold','Cost of Goods Sold','COGS','AED')", [companyId]);
  const bill = await post({ kind: 'transactions', companyId, locationId, type: 'bill', party: 'EUR Supplier', currency: 'EUR', exchangeRate: 4.27, transactionDate: '2026-09-29', number: 'BILL-EUR', account: 'Wrong Account', lines: [{ description: 'Custom purchase', quantity: 1, unitPrice: 100, unitCost: 100, vatCode: 'ZERO' }] });
  assert.equal(bill.status, 201, JSON.stringify(await bill.clone().json()));
  const billRecord = (await bill.json()).record;
  assert.equal(billRecord.account, account.name);
  assert.deepEqual((await database.query("SELECT jl.account_name,jl.debit,jl.credit FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id WHERE je.transaction_id=$1 ORDER BY jl.debit DESC", [billRecord.id])).rows, [
    { account_name: 'Cost of Goods Sold', debit: 427, credit: 0 },
    { account_name: account.name, debit: 0, credit: 427 },
  ]);

  const importLine = [{ description: 'Imported laptop', quantity: 1, unitPrice: 200, unitCost: 200, vatCode: 'IMPORT_GOODS' }];
  const missingImportReferences = await post({ kind: 'transactions', companyId, locationId, type: 'bill', party: 'EUR Supplier', currency: 'EUR', exchangeRate: 4.27, transactionDate: '2026-09-29', number: 'BILL-IMPORT-MISSING', account: account.name, lines: importLine });
  assert.equal(missingImportReferences.status, 400);
  assert.match((await missingImportReferences.json()).error, /Bill of Entry No\. and Airway Bill No\./);
  const imported = await post({ kind: 'transactions', companyId, locationId, type: 'bill', party: 'EUR Supplier', currency: 'EUR', exchangeRate: 4.27, transactionDate: '2026-09-29', number: 'BILL-IMPORT', account: account.name, billOfEntryNumber: 'BOE-2026-001', airwayBillNumber: 'AWB-2026-009', lines: importLine });
  assert.equal(imported.status, 201, JSON.stringify(await imported.clone().json()));
  const importedRecord = (await imported.json()).record;
  assert.equal(importedRecord.isImport, true);
  assert.equal(importedRecord.billOfEntryNumber, 'BOE-2026-001');
  assert.equal(importedRecord.airwayBillNumber, 'AWB-2026-009');
  const billOfEntrySearch = await GET(new Request(`https://app.test/api/records?kind=bill-of-entry-search&companyId=${companyId}&locationId=${locationId}&q=2026-001`));
  assert.equal(billOfEntrySearch.status, 200);
  const billOfEntryResults = (await billOfEntrySearch.json()).records;
  assert.equal(billOfEntryResults.length, 1);
  assert.equal(billOfEntryResults[0].id, importedRecord.id);
  assert.equal(billOfEntryResults[0].billOfEntryNumber, 'BOE-2026-001');
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
  assert.equal((await DELETE(request('DELETE',{deletionReason: 'Correcting test record', kind:'transactions',companyId,id:po.id}))).status,409);
  const last = await receive(30); assert.equal(last.status,201); const lastRecord = (await last.json()).record;
  assert.equal(await stock(),50);
  assert.equal((await read()).order.status,'received');
  assert.equal((await openOrders()).length, 0);
  assert.equal((await read()).lines[0].remaining,0);
  assert.equal((await receive(1)).status,409);
  assert.equal((await DELETE(request('DELETE',{deletionReason: 'Correcting test record', kind:'transactions',companyId,id:lastRecord.id}))).status,200);
  assert.equal((await read()).order.status,'partially received');
  assert.deepEqual((await openOrders()).map((order) => order.id), [po.id]);
  assert.equal((await read()).lines[0].remaining,30);
  assert.equal(await stock(),20);
  assert.equal((await DELETE(request('DELETE',{deletionReason: 'Correcting test record', kind:'transactions',companyId,id:firstRecord.id}))).status,200);
  assert.equal((await read()).order.status,'open');
  assert.equal((await read()).lines[0].remaining,50);
});

test('partial PO bills keep orders open until fully received and restore quantities on deletion', async () => {
  const companyId = (await database.query("INSERT INTO companies (name) VALUES ('Partial bills') RETURNING id")).rows[0].id;
  const locationId = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES ($1,'PR','Receiving','PR') RETURNING id",[companyId])).rows[0].id;
  const itemId = (await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity,cost) VALUES ($1,$2,'PR','Laptop',0,20) RETURNING id",[companyId,locationId])).rows[0].id;
  const { POST, GET, PATCH, DELETE } = await vite.ssrLoadModule('/app/api/records/route.ts');
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
  const billDetail = async () => (await (await GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${companyId}&id=${firstRecord.id}`))).json());
  let editable = await billDetail();
  const editBill = (lineChanges) => PATCH(request('PATCH',{kind:'transactions',companyId,id:firstRecord.id,locationId,type:'bill',revision:editable.revision,number:firstRecord.number,party:base.party,currency:'USD',exchangeRate:3.675,transactionDate:'2026-09-12',status:'open',account:firstRecord.account,purchaseOrderId:po.id,lines:[{orderLineId:editable.lines[0].orderLineId,itemId,description:editable.lines[0].description,quantity:editable.lines[0].quantity,unitPrice:editable.lines[0].unitPrice,unitCost:editable.lines[0].unitCost,vatCode:editable.lines[0].vatCode,vatRate:editable.lines[0].vatRate,comments:editable.lines[0].comments,serialNumber:editable.lines[0].serialNumber,...lineChanges}]}));
  let edited = await editBill({description:'Edited PO bill laptop',quantity:25,unitPrice:110,vatCode:'STANDARD',vatRate:5,comments:'Edited comment',serialNumber:'EDITED-SN'});
  assert.equal(edited.status,200,JSON.stringify(await edited.clone().json())); editable=await billDetail();
  assert.equal(editable.record.total,2887.5); assert.equal(editable.lines[0].description,'Edited PO bill laptop'); assert.equal(editable.lines[0].comments,'Edited comment'); assert.equal(editable.lines[0].serialNumber,'EDITED-SN'); assert.equal(editable.lines[0].orderLineId,line.id); assert.equal(await stock(),25); assert.equal((await read()).lines[0].remaining,25);
  assert.equal((await editBill({quantity:51})).status,409); assert.equal(await stock(),25); assert.equal((await read()).lines[0].remaining,25);
  edited=await editBill({description:'Laptop',quantity:20,unitPrice:100,vatCode:'ZERO',vatRate:0,comments:'PO bill comment',serialNumber:'PO-SN-1\nPO-SN-2'}); assert.equal(edited.status,200,JSON.stringify(await edited.clone().json())); editable=await billDetail();
  assert.equal(editable.record.total,2000); assert.equal(await stock(),20); assert.equal((await read()).lines[0].remaining,30);
  assert.equal((await read()).order.status,'partially received');
  assert.deepEqual((await openOrders()).map((order) => order.id), [po.id]);
  assert.equal((await read()).lines[0].remaining,30);
  assert.equal((await receive(31)).status,409);
  assert.equal((await receive(1,{lines:[{orderLineId:line.id,quantity:1},{orderLineId:line.id,quantity:1}]})).status,400);
  assert.equal((await POST(request('POST',{...base,type:'bill',sourceTransactionId:po.id}))).status,409);
  assert.equal((await DELETE(request('DELETE',{deletionReason: 'Correcting test record', kind:'transactions',companyId,id:po.id}))).status,409);
  const last = await receive(30); assert.equal(last.status,201); const lastRecord = (await last.json()).record;
  assert.equal(await stock(),50);
  assert.equal((await read()).order.status,'received');
  assert.equal((await openOrders()).length, 0);
  assert.equal((await read()).lines[0].remaining,0);
  let fullBill=await (await GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${companyId}&id=${lastRecord.id}`))).json();
  const fullEdit=await PATCH(request('PATCH',{kind:'transactions',companyId,id:lastRecord.id,locationId,type:'bill',revision:fullBill.revision,number:lastRecord.number,party:base.party,currency:'USD',exchangeRate:3.675,transactionDate:'2026-09-12',status:'open',account:lastRecord.account,purchaseOrderId:po.id,lines:[{orderLineId:fullBill.lines[0].orderLineId,itemId,description:'Final received laptops',quantity:30,unitPrice:120,unitCost:120,vatCode:'ZERO',vatRate:0,comments:'Final bill edited',serialNumber:'FINAL-SN'}]}));
  assert.equal(fullEdit.status,200,JSON.stringify(await fullEdit.clone().json())); fullBill=await (await GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${companyId}&id=${lastRecord.id}`))).json();
  assert.equal(fullBill.record.total,3600); assert.equal(fullBill.lines[0].description,'Final received laptops'); assert.equal(fullBill.lines[0].serialNumber,'FINAL-SN'); assert.equal(await stock(),50); assert.equal((await read()).order.status,'received');
  assert.equal((await receive(1)).status,409);
  assert.equal((await DELETE(request('DELETE',{deletionReason: 'Correcting test record', kind:'transactions',companyId,id:lastRecord.id}))).status,200);
  assert.equal((await read()).order.status,'partially received');
  assert.deepEqual((await openOrders()).map((order) => order.id), [po.id]);
  assert.equal((await read()).lines[0].remaining,30);
  assert.equal(await stock(),20);
  assert.equal((await DELETE(request('DELETE',{deletionReason: 'Correcting test record', kind:'transactions',companyId,id:firstRecord.id}))).status,200);
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
  assert.equal((await DELETE(request('DELETE',{deletionReason: 'Correcting test record', kind:'transactions',companyId,id:firstRecord.id}))).status,200);
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
  await database.query("UPDATE transactions SET bank_account_key='default' WHERE id=$1",[source.id]);
  response=await invoice(3,{lines:[{sourceLineId,quantity:3,comments:"Source invoice item",serialNumber:"SOURCE-1"}]});assert.equal(response.status,201); const first=(await response.json()).record;
  assert.equal(first.bankAccountKey,'default','a partial invoice keeps the bank account chosen on its source');
  assert.deepEqual((await database.query('SELECT comments,serial_number FROM transaction_lines WHERE transaction_id=$1',[first.id])).rows[0],{comments:'Source invoice item',serial_number:'SOURCE-1'});
  assert.equal(first.total,315);assert.equal(first.currency,'USD');assert.equal(first.salesSourceId,source.id);assert.equal(first.sourceTransactionId,null);
  assert.equal(await stock(destinationItem),0); assert.equal(await stock(sourceItem),5);
  assert.deepEqual((await available()).map((row) => row.id), [source.id]);assert.equal((await read()).source.status,'partially invoiced');assert.equal((await read()).lines[0].remaining,7);
  assert.equal((await database.query('SELECT location_id FROM journal_entries WHERE transaction_id=$1',[first.id])).rows[0].location_id,destination);
  assert.equal((await database.query('SELECT unit_cost FROM transaction_lines WHERE transaction_id=$1',[first.id])).rows[0].unit_cost,20);
  assert.equal((await POST(request('POST',{...base,type:'invoice',sourceTransactionId:source.id}))).status,409);
  assert.equal((await DELETE(request('DELETE',{deletionReason: 'Correcting test record', kind:'transactions',companyId,id:source.id}))).status,409);
  let current=await detail();
  assert.equal((await PATCH(request('PATCH',{...base,id:source.id,type:sourceType,number:'CHANGED',revision:current.revision,lines:[originalLine]}))).status,409);
  await database.query('UPDATE items SET quantity=10 WHERE id=$1',[destinationItem]);
  assert.equal((await invoice(8)).status,409);
  response=await invoice(7);assert.equal(response.status,201);const last=(await response.json()).record;
  assert.notEqual(last.number,first.number);assert.equal((await available()).length,0);assert.equal((await read()).source.status,'invoiced');assert.equal((await read()).lines[0].remaining,0);assert.equal((await read()).invoices.length,2);
  assert.equal((await invoice(1)).status,409);
  assert.equal((await DELETE(request('DELETE',{deletionReason: 'Correcting test record', kind:'transactions',companyId,id:last.id}))).status,200);
  assert.deepEqual((await available()).map((row) => row.id), [source.id]);
  assert.equal((await read()).lines[0].remaining,7);assert.equal(await stock(destinationItem),10);
  assert.equal((await DELETE(request('DELETE',{deletionReason: 'Correcting test record', kind:'transactions',companyId,id:first.id}))).status,200);
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
  assert.equal((await DELETE(request('DELETE',{deletionReason: 'Correcting test record', kind:'transactions',companyId,id:source.id}))).status,200);
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
    assert.equal((await records.DELETE(request('records', 'DELETE', { deletionReason: 'Correcting test record', kind: 'items', id: first, companyId: company }))).status, 409);
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
  const payload={kind:'transactions',companyId,locationId,type:'bill',number:'FREIGHT-1',party:'Freight supplier',transactionDate:'2026-09-13',account:'Purchases',currency:'USD',exchangeRate:2,lines:[{itemId:stock[0].id,description:'Laptop A',quantity:3,unitPrice:100,unitCost:100,freightCharge:10,vatCode:'STANDARD'},{itemId:stock[1].id,description:'Laptop B',quantity:2,unitPrice:50,unitCost:50,freightCharge:20,vatCode:'STANDARD'}]};
  const res=await POST(req('POST',payload));assert.equal(res.status,201,JSON.stringify(await res.clone().json()));const {record}=await res.json();
  assert.equal(record.subtotal,430);assert.equal(record.vatAmount,21.5);assert.equal(record.total,451.5);assert.equal(record.baseTotal,903);
  const read=async()=> (await (await GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${companyId}&id=${record.id}`))).json());
  let detail=await read();assert.equal(detail.lines.filter(l=>l.isFreightCharge).length,1);assert.equal(detail.lines.find(l=>l.itemId===stock[0].id).freightCharge,10);
  assert.equal(detail.journal.find(line=>line.accountName==='Inventory Asset')?.debit,860);assert.equal(detail.journal.find(line=>line.accountName==='Purchases'),undefined);
  assert.equal(Number((await database.query('SELECT last_purchase_price FROM items WHERE id=$1',[stock[0].id])).rows[0].last_purchase_price),206.66);
  const {stockPricingRows}=await vite.ssrLoadModule('/lib/stock-pricing.ts');
  const costs=stockPricingRows(stock.map((s,i)=>({...s,locationId,sku:`F-${i}`,name:'Laptop',quantity:10,cost:0,lastPurchasePrice:0,salesPrice:400,itemNumber:null})),detail.lines.map(l=>({...l,transactionId:record.id,type:'bill',date:record.transactionDate,number:record.number,exchangeRate:2})),[]);
  assert.equal(costs[0].freightCost,6.67);assert.equal(costs[1].freightCost,20);
  // API clients may return the generated freight rows; rebuilding must not duplicate them.
  let edited=await PATCH(req('PATCH',{...payload,id:record.id,revision:detail.revision,lines:detail.lines}));assert.equal(edited.status,200,JSON.stringify(await edited.clone().json()));assert.equal((await edited.json()).record.total,451.5);
  detail=await read();
  const lines=detail.lines.filter(l=>!l.isFreightCharge).map(l=>({...l,freightCharge:0}));
  edited=await PATCH(req('PATCH',{...payload,id:record.id,revision:detail.revision,lines}));assert.equal(edited.status,200);assert.equal((await edited.json()).record.total,420);
  detail=await read();assert.equal(detail.lines.filter(l=>l.isFreightCharge).length,0);
  const bad=await PATCH(req('PATCH',{...payload,id:record.id,revision:detail.revision,lines:[{...lines[0],freightCharge:-1}]}));assert.equal(bad.status,400);assert.equal((await read()).record.total,420);
  // Existing freight rows retain their original value and tax when editing older bills.
  edited=await PATCH(req('PATCH',{...payload,id:record.id,revision:detail.revision,lines:[...lines,{description:'Freight Charges',quantity:1,unitPrice:7,unitCost:7,vatCode:'STANDARD'}]}));assert.equal(edited.status,200);assert.equal((await edited.json()).record.total,427.35);
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
  const payload={kind:'transactions',companyId,locationId,type:'invoice',number:'ILD-1',party:'Line customer',transactionDate:'2026-09-13',currency:'AED',exchangeRate:1,account:'Sales Revenue',lines:[{description:'Laptop A',quantity:2,unitPrice:100,vatCode:'STANDARD',comments:'Handle carefully',serialNumber:'A-1\nA-2'},{description:'Laptop B',quantity:1,unitPrice:50,vatCode:'STANDARD',comments:'Box sealed',serialNumber:'B-1'}]};
  const saved=await POST(req('POST',payload));assert.equal(saved.status,201,JSON.stringify(await saved.clone().json()));const {record}=await saved.json();
  const read=async()=> (await (await GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${companyId}&id=${record.id}`))).json());
  let detail=await read();const before=detail;
  assert.deepEqual(detail.lines.map(l=>[l.comments,l.serialNumber]),[['Handle carefully','A-1\nA-2'],['Box sealed','B-1']]);
  const edit=(lineDetails,revision=detail.revision)=>PATCH(req('PATCH',{kind:'transactions',companyId,id:record.id,editMode:'details',number:payload.number,transactionDate:payload.transactionDate,revision,lineDetails}));
  let result=await edit([{id:detail.lines[0].id,comments:'Updated',serialNumber:'A-3'}]);assert.equal(result.status,200,JSON.stringify(await result.clone().json()));
  detail=await read();assert.equal(detail.lines[0].comments,'Updated');assert.equal(detail.lines[1].serialNumber,'B-1');assert.equal(detail.record.total,262.5);assert.deepEqual(detail.journal,before.journal);
  assert.equal((await edit([{id:detail.lines[0].id,comments:'stale'}],before.revision)).status,409);
  for (const invalid of [[{id:99999999,comments:'Wrong line'}],[{id:detail.lines[0].id,unitPrice:-1}],[{id:detail.lines[0].id},{id:detail.lines[0].id}]]) assert.equal((await edit(invalid)).status,400);
  assert.equal((await read()).lines[0].comments,'Updated');
  result=await edit([{id:detail.lines[0].id,comments:'',serialNumber:''}]);assert.equal(result.status,200);detail=await read();assert.equal(detail.lines[0].serialNumber,'');assert.equal(detail.lines[0].comments,'');assert.equal(detail.record.total,262.5);
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
    assert.equal((await save({ ...firstSetup, companyId: first, loginBranding: true })).status, 200);
    assert.equal((await save({ ...firstSetup, companyId: first, loginBranding: true, loginBackgroundColor: '#112233' })).status, 200);
    assert.deepEqual((await database.query('SELECT id FROM companies WHERE login_branding=true')).rows.map(row => row.id), [first]);
    assert.equal((await save({ ...secondSetup, companyId: second, loginBranding: true })).status, 403);
    globalThis.__transferTestUser = { id: 8, email: 'sales@test', role: 'sales', companyIds: [first] };
    assert.equal((await save({ ...firstSetup, companyId: first, loginBranding: false })).status, 403);
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
    assert.equal((await save(first, 'loginBranding', true)).status, 200);
    assert.equal((await save(second, 'loginBranding', true)).status, 403);
    assert.equal((await save(second, 'logoData', logo)).status, 403);
    assert.equal((await save(first, 'loginBackgroundColor', '#405060')).status, 200);
    assert.deepEqual((await database.query('SELECT id FROM companies WHERE login_branding=true')).rows.map(row => row.id), [first]);
    globalThis.__transferTestUser = { id: 10, email: 'sales@test', role: 'sales', companyIds: [first] };
    assert.equal((await save(first, 'loginBranding', false)).status, 403);
  } finally { delete globalThis.__transferTestUser; }
});

test('login company selector includes new active companies and loads their own branding', async () => {
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  const previous = (await database.query('SELECT id FROM companies WHERE login_branding=true')).rows.map((row) => row.id);
  const first = (await database.query("INSERT INTO companies (name,login_branding,login_logo_data,login_background_color) VALUES ('Default Login Company',false,$1,'#123456') RETURNING id", [image])).rows[0].id;
  const second = (await database.query("INSERT INTO companies (name,login_company_logo_data,login_display_name) VALUES ('New Jewellery Company',$1,'') RETURNING id", [image])).rows[0].id;
  try {
    await database.query('UPDATE companies SET login_branding=false');
    await database.query('UPDATE companies SET login_branding=true WHERE id=$1', [first]);
    const { publicLoginCompanies } = await vite.ssrLoadModule('/lib/public-login-branding.ts');
    const { GET } = await vite.ssrLoadModule('/app/api/login-branding/route.ts');
    const listed = await publicLoginCompanies();
    assert.ok(listed.some((entry) => entry.id === second && entry.name === 'New Jewellery Company'));
    const response = await GET(new Request(`https://app.test/api/login-branding?companyId=${second}`));
    assert.equal(response.status, 200);
    const { branding } = await response.json();
    assert.equal(branding.name, 'New Jewellery Company');
    assert.equal(branding.loginDisplayName, '');
    assert.equal(branding.loginCompanyLogoData, image);
    assert.equal(branding.loginLogoData, image);
    assert.equal(branding.backgroundColor, '#123456');
    assert.ok(!('bankAccountNumber' in branding));
    assert.equal((await GET(new Request('https://app.test/api/login-branding?companyId=0'))).status, 400);
    await database.query('UPDATE companies SET active=false WHERE id=$1', [second]);
    assert.equal((await GET(new Request(`https://app.test/api/login-branding?companyId=${second}`))).status, 404);
    assert.ok(!(await publicLoginCompanies()).some((entry) => entry.id === second));
  } finally {
    await database.query('UPDATE companies SET login_branding=false');
    if (previous.length) await database.query('UPDATE companies SET login_branding=true WHERE id=$1', [previous[0]]);
  }
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
    const formatted = { ...template, body: 'Hello world', bodyHtml: '<div style="text-align: center"><b>Hello</b> <span style="color: #c82424">world</span><img src=x onerror=alert(1)></div>', bodyLeft: 24, bodyTop: 62, bodyWidth: 160 };
    assert.equal((await request(first, { templates: [formatted] })).status, 200);
    const clean = letterheadForDocument((await database.query('SELECT letterhead_design FROM companies WHERE id=$1', [first])).rows[0].letterhead_design, 'tax-invoice');
    assert.equal(clean.bodyTop, 62);
    assert.match(clean.bodyHtml, /<b>Hello<\/b>/);
    assert.doesNotMatch(clean.bodyHtml, /<img|onerror/);
    assert.equal((await request(first, { templates: [{ ...formatted, bodyLeft: 211 }] })).status, 400);
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

test('company clearing can reset stock to zero while keeping items, only together with transactions', async () => {
  const { POST } = await vite.ssrLoadModule('/app/api/company-setup/clear/route.ts');
  const { hashPassword } = await vite.ssrLoadModule('/lib/password.ts');
  const password = 'Company-stock-reset-123';
  const userId = (await database.query("INSERT INTO app_users (email,password_hash,role) VALUES ('stock-reset@example.test',$1,'admin') RETURNING id", [await hashPassword(password)])).rows[0].id;
  const company = (await database.query("INSERT INTO companies (name) VALUES ('Stock Reset Test') RETURNING id")).rows[0].id;
  const location = (await database.query("INSERT INTO inventory_locations (company_id,name,code,invoice_prefix) VALUES ($1,'RESET','RESET','RST') RETURNING id", [company])).rows[0].id;
  const item = (await database.query("INSERT INTO items (company_id,location_id,sku,name,quantity,cost,sales_price) VALUES ($1,$2,'KEEP-SKU','Kept item',7,40,99) RETURNING id", [company, location])).rows[0].id;
  const invoice = (await database.query("INSERT INTO transactions (company_id,number,type,party,transaction_date) VALUES ($1,'RESET-1','invoice','Customer','2026-10-01') RETURNING id", [company])).rows[0].id;
  await database.query("INSERT INTO inventory_movements (item_id,transaction_id,movement_date,movement_type,quantity,reference) VALUES ($1,$2,'2026-10-01','invoice',-1,'RESET-1')", [item, invoice]);
  const request = (sections) => new Request('http://localhost/api/company-setup/clear', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ companyId: company, sections, password, confirmation: 'Stock Reset Test' }) });
  try {
    globalThis.__transferTestUser = { id: userId, email: 'stock-reset@example.test', role: 'admin', companyIds: [company] };
    assert.equal((await POST(request(['stock']))).status, 400);
    assert.equal(Number((await database.query('SELECT quantity FROM items WHERE id=$1', [item])).rows[0].quantity), 7);
    const response = await POST(request(['transactions', 'stock']));
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    const kept = (await database.query('SELECT sku, quantity, sales_price FROM items WHERE id=$1', [item])).rows[0];
    assert.deepEqual([kept.sku, Number(kept.quantity), Number(kept.sales_price)], ['KEEP-SKU', 0, 99]);
    assert.equal((await database.query('SELECT id FROM inventory_movements WHERE item_id=$1', [item])).rows.length, 0);
    assert.equal((await database.query('SELECT id FROM transactions WHERE company_id=$1', [company])).rows.length, 0);
    assert.equal((await database.query('SELECT active FROM inventory_locations WHERE id=$1', [location])).rows[0].active, true);
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
    // Items are never deleted by a company clear, so the old "inventory" section no longer exists.
    assert.equal((await POST(request(['inventory']))).status,400);
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
    const invoiceLine=(await database.query("INSERT INTO transaction_lines (transaction_id,description) VALUES ($1,'Packed item') RETURNING id",[invoice])).rows[0].id;
    const customer=(await database.query("INSERT INTO contacts (company_id,type,name) VALUES ($1,'customer','Clear customer') RETURNING id",[company])).rows[0].id;
    await database.query("INSERT INTO warranty_slips (company_id,customer_id,slip_date,problem) VALUES ($1,$2,'2026-09-13','Clear test')",[company,customer]);
    const packingList=(await database.query("INSERT INTO packing_lists (company_id,location_id,invoice_id,number,packing_date) VALUES ($1,$2,$3,'PACK-CLEAR','2026-09-13') RETURNING id",[company,source,invoice])).rows[0].id;
    await database.query("INSERT INTO packing_list_lines (packing_list_id,invoice_line_id,description,packed_quantity,units_per_carton,carton_count) VALUES ($1,$2,'Packed item',1,1,1)",[packingList,invoiceLine]);
    const keptAccount=(await database.query("INSERT INTO accounts (company_id,code,name,type,balance) VALUES ($1,'KEEP-100','Kept main account','Bank',250) RETURNING id",[company])).rows[0].id;
    const keptSubAccount=(await database.query("INSERT INTO accounts (company_id,code,name,type,parent_account_id,balance) VALUES ($1,'KEEP-110','Kept sub-account','Bank',$2,125) RETURNING id",[company,keptAccount])).rows[0].id;
    await database.query('UPDATE transactions SET sales_source_id=$1 WHERE id=$2',[first,invoice]);
    await database.query('INSERT INTO invoice_payment_allocations (payment_id,invoice_id,amount) VALUES ($1,$2,10)',[invoice,first]);
    await database.query("INSERT INTO record_attachments (company_id,entity_type,entity_id,file_name,file_data) VALUES ($1,'transaction',$2,'test','data')",[company,first]);
    // A restrict reference from another company must abort the whole clear transaction.
    await database.query('INSERT INTO bill_payment_allocations (payment_id,bill_id,amount) VALUES ($1,$2,10)',[untouched,first]);
    const keptItem=(await database.query("INSERT INTO items (company_id,location_id,sku,name,quantity) VALUES ($1,$2,'CLEAR-ITEM','Kept item',3) RETURNING id",[company,source])).rows[0].id;
    assert.equal((await POST(request(['transactions','contacts','reports','settings','setup']))).status,409);
    assert.equal((await database.query('SELECT id FROM transactions WHERE company_id=$1',[company])).rows.length,4);
    assert.equal((await database.query('SELECT id FROM invoice_payment_allocations WHERE payment_id=$1',[invoice])).rows.length,1);
    await database.query('DELETE FROM bill_payment_allocations WHERE payment_id=$1',[untouched]);
    assert.equal((await POST(request(['transactions','contacts','reports','settings','setup']))).status,200);
    for (const table of ['transactions','record_attachments']) assert.equal((await database.query(`SELECT * FROM ${table} WHERE company_id=$1`,[company])).rows.length,0);
    for (const table of ['contacts','warranty_slips','packing_lists']) assert.equal((await database.query(`SELECT * FROM ${table} WHERE company_id=$1`,[company])).rows.length,0);
    assert.equal((await database.query('SELECT * FROM inventory_locations WHERE company_id=$1 AND active=true',[company])).rows.length,1);
    assert.equal(Number((await database.query('SELECT quantity FROM items WHERE id=$1',[keptItem])).rows[0].quantity),3);
    const preservedTransfer=(await database.query("SELECT source_location_id,destination_location_id FROM stock_transfers WHERE reference='CLEAR-X'")).rows[0];
    assert.ok(preservedTransfer);
    assert.equal(Number(preservedTransfer.source_location_id),Number(source));
    assert.equal(Number(preservedTransfer.destination_location_id),Number(dest));
    assert.equal((await database.query('SELECT active FROM inventory_locations WHERE id=$1',[source])).rows[0].active,true);
    assert.equal((await database.query('SELECT active FROM inventory_locations WHERE id=$1',[dest])).rows[0].active,true);
    assert.equal((await database.query('SELECT id FROM transactions WHERE id=$1',[untouched])).rows.length,1);
    assert.deepEqual((await database.query('SELECT id,balance FROM accounts WHERE id=$1',[keptAccount])).rows,[{id:keptAccount,balance:0}]);
    assert.deepEqual((await database.query('SELECT id,parent_account_id,balance FROM accounts WHERE id=$1',[keptSubAccount])).rows,[{id:keptSubAccount,parent_account_id:keptAccount,balance:0}]);
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
  const remove=(id)=>DELETE(new Request('https://app.test/api/records',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({deletionReason: 'Correcting test record', kind:'accounts',companyId:company,id})}));
  assert.equal((await remove(main)).status,409);
  assert.equal((await remove(sub)).status,409);
  assert.equal((await remove(child)).status,200);
  assert.equal((await remove(sub)).status,200);
  assert.equal((await database.query('SELECT id FROM accounts WHERE id=$1',[main])).rows.length,1);
});

test('cost of sales uses the average purchase cost, not the saved item cost field', async () => {
  const companyId=(await database.query("INSERT INTO companies (name) VALUES ('Average cost test') RETURNING id")).rows[0].id;
  const locationId=(await database.query("INSERT INTO inventory_locations (company_id,name,code,invoice_prefix) VALUES ($1,'Main','AC','AC') RETURNING id",[companyId])).rows[0].id;
  // Saved Cost field 4,220.50 (never updated by bills); bought at 2,000; a cancelled bill at 9,999 is ignored.
  const item=(await database.query("INSERT INTO items (company_id,location_id,sku,name,quantity,cost) VALUES ($1,$2,'AVG-1','Average laptop',1,4220.5) RETURNING *",[companyId,locationId])).rows[0];
  for (const [number,status,price] of [['AC-BILL','open',2000],['AC-VOID','cancelled',9999]]) {
    const bill=(await database.query("INSERT INTO transactions (company_id,location_id,type,number,party,transaction_date,status,subtotal,total,base_total) VALUES ($1,$2,'bill',$3,'Supplier','2026-09-01',$4,$5,$5,$5) RETURNING id",[companyId,locationId,number,status,price])).rows[0].id;
    await database.query("INSERT INTO transaction_lines (transaction_id,item_id,description,quantity,unit_price,subtotal) VALUES ($1,$2,'Average laptop',1,$3,$3)",[bill,item.id,price]);
  }
  const { averagePurchaseCosts, itemHomeCost } = await vite.ssrLoadModule('/lib/item-cost.ts');
  const averages = await averagePurchaseCosts([item.id]);
  assert.equal(averages.get(item.id), 2000);
  assert.equal(itemHomeCost({ id: item.id, cost: 4220.5 }, averages), 2000);
  // Without purchases: last purchase price, then the saved cost (ex VAT when entered including VAT).
  assert.equal(itemHomeCost({ id: 999999, cost: 105, lastPurchasePrice: 90 }, new Map()), 90);
  assert.equal(itemHomeCost({ id: 999999, cost: 105, amountsIncludeVat: true }, new Map(), 5), 100);
  const { salesInventoryLines } = await vite.ssrLoadModule('/lib/sales-invoicing.ts');
  const order=(await database.query("INSERT INTO transactions (company_id,location_id,type,number,party,transaction_date,status,subtotal,total,base_total) VALUES ($1,$2,'sales order','AC-SO','Customer','2026-09-05','open',2500,2500,2500) RETURNING id",[companyId,locationId])).rows[0].id;
  await database.query("INSERT INTO transaction_lines (transaction_id,item_id,description,quantity,unit_price,subtotal) VALUES ($1,$2,'Average laptop',1,2500,2500)",[order,item.id]);
  assert.equal((await salesInventoryLines(order,companyId,locationId))[0].homeCost, 2000);
});

test('documents cannot post to an account that has been made inactive', async () => {
  const companyId=(await database.query("INSERT INTO companies (name) VALUES ('Inactive posting test') RETURNING id")).rows[0].id;
  const locationId=(await database.query("INSERT INTO inventory_locations (company_id,name,code,invoice_prefix) VALUES ($1,'Main','IP','IP') RETURNING id",[companyId])).rows[0].id;
  await database.query("INSERT INTO accounts (company_id,code,name,type,active) VALUES ($1,'6900','Old Purchases','Expense',false),($1,'6901','Live Purchases','Expense',true)",[companyId]);
  const {POST}=await vite.ssrLoadModule('/app/api/records/route.ts');
  const bill=(account,number)=>POST(new Request('https://app.test/api/records',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'transactions',type:'bill',companyId,locationId,number,party:'Supplier',transactionDate:'2026-10-01',account,currency:'AED',exchangeRate:1,lines:[{description:'Office supplies',quantity:1,unitPrice:100,vatCode:'ZERO'}]})}));
  const blocked=await bill('Old Purchases','INACTIVE-1');
  assert.equal(blocked.status,409,await blocked.clone().text());
  assert.match((await blocked.json()).error,/Old Purchases is inactive/);
  // The rejected document is rolled back with its journal.
  assert.equal((await database.query("SELECT id FROM transactions WHERE company_id=$1 AND number='INACTIVE-1'",[companyId])).rows.length,0);
  const allowed=await bill('Live Purchases','ACTIVE-1');
  assert.equal(allowed.status,201,await allowed.clone().text());
});

test('Chart of Accounts: company-wide balances, create validation, linked delete protection and transfer rename', async () => {
  const company=(await database.query("INSERT INTO companies (name, base_currency) VALUES ('Chart audit test','AED') RETURNING id")).rows[0].id;
  const [storeA,storeB]=(await database.query("INSERT INTO inventory_locations (company_id,name,code,invoice_prefix) VALUES ($1,'Store A','CA','CA'),($1,'Store B','CB','CB') RETURNING id",[company])).rows.map(row=>row.id);
  const main=(await database.query("INSERT INTO accounts (company_id,code,name,type,balance) VALUES ($1,'1000','Main Bank','Bank',100) RETURNING id",[company])).rows[0].id;
  const second=(await database.query("INSERT INTO accounts (company_id,code,name,type) VALUES ($1,'1010','Second Bank','Bank') RETURNING id",[company])).rows[0].id;
  const entry=(await database.query("INSERT INTO journal_entries (company_id,location_id,entry_date,reference,posted) VALUES ($1,$2,'2026-10-01','J-B',true) RETURNING id",[company,storeB])).rows[0].id;
  await database.query("INSERT INTO journal_lines (journal_entry_id,account_name,debit,credit) VALUES ($1,'Main Bank',50,0)",[entry]);
  const draft=(await database.query("INSERT INTO journal_entries (company_id,location_id,entry_date,reference,posted) VALUES ($1,$2,'2026-10-02','J-DRAFT',false) RETURNING id",[company,storeA])).rows[0].id;
  await database.query("INSERT INTO journal_lines (journal_entry_id,account_name,debit,credit) VALUES ($1,'Main Bank',1000,0)",[draft]);
  const {GET,POST,PATCH,DELETE}=await vite.ssrLoadModule('/app/api/records/route.ts');
  // Store A selected: the posted Store B receipt still counts; the unposted entry does not.
  const list=await (await GET(new Request(`https://app.test/api/records?kind=accounts&companyId=${company}&locationId=${storeA}`))).json();
  assert.equal(list.records.find(row=>row.id===main).balance,150);
  const create=(payload)=>POST(new Request('https://app.test/api/records',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'accounts',companyId:company,...payload})}));
  assert.equal((await create({code:'4100',name:'Bad sales',type:'Expense',systemRole:'SALES'})).status,409);
  assert.equal((await create({code:'4101',name:'Bad type',type:'Foo'})).status,400);
  assert.equal((await create({code:'4102',name:'Bad balance',type:'Expense',balance:'abc'})).status,400);
  // Sub-accounts linked to an item, or with an opening balance, cannot be deleted.
  const sub=(await database.query("INSERT INTO accounts (company_id,code,name,type,parent_account_id) VALUES ($1,'5010','Linked COGS','Cost of Goods Sold',$2) RETURNING id",[company,main])).rows[0].id;
  await database.query("INSERT INTO items (company_id,location_id,sku,name,cogs_account_id) VALUES ($1,$2,'CHART-ITEM','Chart item',$3)",[company,storeA,sub]);
  const funded=(await database.query("INSERT INTO accounts (company_id,code,name,type,parent_account_id,balance) VALUES ($1,'1020','Funded sub','Bank',$2,25) RETURNING id",[company,main])).rows[0].id;
  const remove=(id)=>DELETE(new Request('https://app.test/api/records',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({deletionReason:'Correcting test record',kind:'accounts',companyId:company,id})}));
  assert.equal((await remove(sub)).status,409);
  assert.equal((await remove(funded)).status,409);
  // Renaming a bank keeps transfers pointing at it as their destination.
  const transfer=(await database.query("INSERT INTO transactions (company_id,type,number,party,account,transaction_date) VALUES ($1,'transfer','TR-1','Second Bank','Main Bank','2026-10-03') RETURNING id",[company])).rows[0].id;
  const rename=await PATCH(new Request('https://app.test/api/records',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'accounts',companyId:company,id:second,name:'Second Bank Renamed',code:'1010'})}));
  assert.equal(rename.status,200,await rename.clone().text());
  assert.deepEqual((await database.query('SELECT party, account FROM transactions WHERE id=$1',[transfer])).rows,[{party:'Second Bank Renamed',account:'Main Bank'}]);
});

test('shared out-of-stock catalogue includes all active source identities without financial data', async () => {
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
    assert.deepEqual(rows.map(row=>row.sku).sort(),['SHARED-NEGATIVE','SHARED-POSITIVE','SHARED-ZERO']);
    for(const row of rows){assert.equal(row.company,'Shared catalogue company');assert.equal(row.inventory,'Shared store');for(const key of ['cost','salesPrice','quantity','lastPurchasePrice','companyId'])assert.equal(key in row,false);}
    await database.query('UPDATE companies SET active=false WHERE id=$1',[company]);
    assert.equal((await (await GET(new Request('https://app.test/api/out-of-stock'))).json()).records.some(row=>ids.includes(row.id)),false);
    globalThis.__transferTestUser=new Response('Unauthorized',{status:401});
    assert.equal((await GET(new Request('https://app.test/api/out-of-stock'))).status,401);
  } finally {delete globalThis.__transferTestUser;}
});

test('shared catalogue lists in-stock source identities and reuses their SKU and item number', async () => {
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
  for(const url of ['https://app.test/api/shared-items',`https://app.test/api/shared-items?companyId=${targetCompany}`])assert.equal((await (await GET(new Request(url))).json()).records.some(row=>row.id===sourceId),true);
  for(const suffix of ['',`?companyId=${targetCompany}&locationId=${targetLocation}`])assert.equal((await (await outOfStock(new Request(`https://app.test/api/out-of-stock${suffix}`))).json()).records.some(row=>row.id===sourceId),true);
  assert.equal((await (await outOfStock(new Request(`https://app.test/api/out-of-stock?companyId=${targetCompany}&locationId=${targetLocation}`))).json()).records.some(row=>row.id===sourceId),true);
  const rows=(await (await GET(new Request('https://app.test/api/shared-items'))).json()).records;
  const shared=rows.find(row=>row.id===sourceId);assert(shared);for(const key of ['quantity','cost','salesPrice','grnPrice'])assert.equal(shared[key],0);assert.equal('lastPurchasePrice' in shared,false);
  const response=await post(payload);assert.equal(response.status,201,JSON.stringify(await response.clone().json()));const created=(await response.json()).record;
  const saved=(await database.query('SELECT * FROM items WHERE id=$1',[created.id])).rows[0];assert.equal(saved.sku,'SHARED-SKU');assert.equal(saved.item_number,'SHARED-130');for(const key of ['quantity','cost','sales_price','grn_price','last_purchase_price'])assert.equal(saved[key],0);
  await database.query('UPDATE items SET quantity=3,cost=50 WHERE id=$1',[created.id]);
  // Destination SKU suppression still includes its private in-stock items.
  assert.equal((await (await GET(new Request(`https://app.test/api/shared-items?companyId=${targetCompany}`))).json()).records.some(row=>row.id===sourceId),false);
  const again=await post(payload);assert.equal(again.status,200);assert.equal((await again.json()).record.id,created.id);assert.equal((await database.query('SELECT quantity FROM items WHERE id=$1',[created.id])).rows[0].quantity,3);
  assert.equal((await post({...payload,companyId:sourceCompany,locationId:sourceLocation})).status,403);
  assert.equal((await post({...payload,locationId:sourceLocation})).status,400);
  await database.query("UPDATE items SET item_number='OTHER' WHERE id=$1",[created.id]);assert.equal((await post(payload)).status,409);
  globalThis.__transferTestUser={id:1,email:'viewer@test',role:'viewer',companyIds:[targetCompany]};assert.equal((await post(payload)).status,403);
  const source=(await database.query('SELECT quantity,cost,sales_price,grn_price FROM items WHERE id=$1',[sourceId])).rows[0];assert.deepEqual(source,{quantity:15,cost:900,sales_price:1200,grn_price:950});
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
   const overviewData=await get(overview,'inventory-overview');const stock=overviewData.records;assert.ok(stock.some(r=>r.id===ownItem));assert.ok(stock.every(r=>r.companyId===own));
   for(const rows of Object.values(overviewData.activity))assert.ok(rows.every(r=>r.companyId===own));
   const catalogue=await get(transfers,'transfers?catalog=1');assert.ok(catalogue.records.every(r=>r.companyId===own));assert.ok(catalogue.salesmen.every(r=>r.companyId===own));
   const history=(await get(transfers,'transfers')).records;assert.ok(history.some(r=>r.id===ownTransfer));assert.ok(history.every(r=>r.sourceCompanyId===own&&r.destinationCompanyId===own));assert.ok(!history.some(r=>[otherTransfer,cross].includes(r.id)));
  }
  globalThis.__transferTestUser={id:1,role:'viewer',companyIds:[]};
  const emptyOverview=await get(overview,'inventory-overview');assert.equal(emptyOverview.records.length,0);for(const rows of Object.values(emptyOverview.activity))assert.equal(rows.length,0);assert.deepEqual(await get(transfers,'transfers?catalog=1'),{records:[],salesmen:[]});assert.equal((await get(transfers,'transfers')).records.length,0);
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
  const logistics = await vite.ssrLoadModule('/app/api/item-logistics/route.ts');
  const updateLogistics = values => logistics.PATCH(new Request('https://app.test/api/item-logistics', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ companyId: company, locationId: location, records: [{ id: item, hsCode: '84718000', countryOfOrigin: 'china', dimensionText: 'stale manual text', lengthCm: 50, widthCm: 40, heightCm: 30, weightKg: 0.5, ...values }] }) }));
  let updated = await updateLogistics({});
  assert.equal(updated.status, 200, await updated.clone().text());
  assert.equal((await database.query('SELECT dimension_text FROM items WHERE id=$1', [item])).rows[0].dimension_text, '50 × 40 × 30 cm');
  const {GET,POST,PATCH}=await vite.ssrLoadModule('/app/api/packing-lists/route.ts');
  const save=(quantity)=>POST(new Request('https://app.test/api/packing-lists',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({companyId:company,invoiceId:invoice,packingDate:'2026-09-22',deliveryAddress:'Kabul Airport',memo:'Export packing',lines:[{invoiceLineId:invoiceLine,packedQuantity:quantity,unitsPerCarton:10,cartonReference:'5',grossWeightKg:quantity*0.5,lengthCm:50,widthCm:40,heightCm:30}]})}));
  let response=await save(20);
  assert.equal(response.status,201,await response.clone().text());
  let data=await response.json();
  assert.equal(data.packingLists[0].number,'PL-INV-PACK-1-01');
  assert.equal(data.packingLists[0].lines[0].cartonCount,2);
  assert.equal(data.packingLists[0].lines[0].cartonReference,'5-6');
  assert.equal(data.packingLists[0].lines[0].totalCbm,0.12);
  assert.equal(data.packingLists[0].lines[0].dimensionText,'50 × 40 × 30 cm');
  assert.equal(data.lines[0].dimensionText,'50 × 40 × 30 cm');
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
  assert.equal(data.packingLists[0].lines[0].dimensionText, '55 × 45 × 35 cm');
  updated = await updateLogistics({ lengthCm: 10, widthCm: 20, heightCm: 30, hsCode: '99999999', countryOfOrigin: 'JAPAN' });
  assert.equal(updated.status, 200);
  const snapshot = await (await GET(new Request(`https://app.test/api/packing-lists?companyId=${company}&invoiceId=${invoice}`))).json();
  assert.equal(snapshot.lines[0].dimensionText, '10 × 20 × 30 cm');
  assert.equal(snapshot.lines[0].hsCode, '99999999');
  assert.equal(snapshot.packingLists[0].lines[0].dimensionText, '55 × 45 × 35 cm');
  assert.equal(snapshot.packingLists[0].lines[0].hsCode, '84718000');
  const refreshed=await GET(new Request(`https://app.test/api/packing-lists?companyId=${company}&invoiceId=${invoice}`));
  assert.equal(refreshed.status,200);
  assert.equal((await refreshed.json()).lines[0].remainingQuantity,0);
  // A void invoice keeps its saved packing lists viewable but blocks new or edited ones.
  await database.query("UPDATE transactions SET status='void' WHERE id=$1",[invoice]);
  const blocked=await save(1); assert.equal(blocked.status,409); assert.match((await blocked.json()).error,/void/);
  const viewed=await GET(new Request(`https://app.test/api/packing-lists?companyId=${company}&invoiceId=${invoice}`));
  assert.equal(viewed.status,200); assert.ok((await viewed.json()).packingLists.length>0);
});


test('record deletion requires a memo and preserves the actor and memo atomically', async () => {
  const companyId = (await database.query("INSERT INTO companies (name) VALUES ('Delete memo test') RETURNING id")).rows[0].id;
  const id = (await database.query("INSERT INTO transactions (company_id,type,number,party,transaction_date) VALUES ($1,'estimate','MEMO-001','Memo customer','2026-10-01') RETURNING id", [companyId])).rows[0].id;
  const { DELETE } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const remove = deletionReason => DELETE(new Request('https://app.test/api/records', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'transactions', id, companyId, deletionReason }) }));
  for (const reason of [undefined, '', '  ', 123, 'x'.repeat(2001)]) {
    assert.equal((await remove(reason)).status, 400);
  }
  assert.equal((await database.query('SELECT id FROM transactions WHERE id=$1', [id])).rows.length, 1);
  assert.equal((await database.query('SELECT id FROM audit_log WHERE company_id=$1', [companyId])).rows.length, 0);
  await database.exec("CREATE FUNCTION reject_memo_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.details LIKE '%Force rollback%' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER reject_memo_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_memo_audit();");
  try {
    assert.equal((await remove('Force rollback')).status, 500);
    assert.equal((await database.query('SELECT id FROM transactions WHERE id=$1', [id])).rows.length, 1);
  } finally {
    await database.exec('DROP TRIGGER reject_memo_audit ON audit_log; DROP FUNCTION reject_memo_audit();');
  }
  assert.equal((await remove('  Wrong customer selected  ')).status, 200);
  const [audit] = (await database.query("SELECT * FROM audit_log WHERE company_id=$1 AND action='deleted'", [companyId])).rows;
  const details = JSON.parse(audit.details);
  assert.equal(details.deletionReason, 'Wrong customer selected');
  assert.equal(details.actorId, 1);
  assert.equal(details.number, 'MEMO-001');
  assert.ok(audit.created_at);
  assert.equal((await database.query('SELECT id FROM transactions WHERE id=$1', [id])).rows.length, 0);
});

test('invoice prices and customer edits reconcile VAT, journals and balances while preserving stock and payments', async () => {
  const companyId = (await database.query("INSERT INTO companies(name) VALUES ('Invoice price edit') RETURNING id")).rows[0].id;
  const locationId = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES ($1,'IPE','IPE','IPE') RETURNING id", [companyId])).rows[0].id;
  const itemId = (await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity,cost) VALUES ($1,$2,'IPE-STOCK','Laptop',10,40) RETURNING id", [companyId,locationId])).rows[0].id;
  const newAr = (await database.query("INSERT INTO accounts(company_id,code,name,type,currency,system_role) VALUES ($1,'1199','Customer specific AR','Accounts Receivable','USD','AR') RETURNING id", [companyId])).rows[0].id;
  await database.query("INSERT INTO contacts(company_id,type,name,currency,status,ledger_account_id) VALUES ($1,'customer','Original customer','USD','active',NULL),($1,'customer','New customer','USD','active',$2),($1,'customer','Wrong currency','AED','active',NULL),($1,'employee','Edited rep','AED','active',NULL)", [companyId,newAr]);
  const { POST, GET, PATCH } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const request = (method, body) => new Request('https://app.test/api/records', {method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const result = await POST(request('POST', {kind:'transactions',companyId,locationId,type:'invoice',number:'IPE-1',party:'Original customer',transactionDate:'2026-09-13',dueDate:'2026-10-09',currency:'USD',exchangeRate:3.67,account:'Sales Revenue',lines:[{itemId,description:'Laptop',quantity:2,unitPrice:100,unitCost:40,vatCode:'STANDARD'}]}));
  assert.equal(result.status,201,JSON.stringify(await result.clone().json()));
  const {record} = await result.json();
  const read = async () => (await (await GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${companyId}&id=${record.id}`))).json());
  let detail = await read();
  const original = detail;
  const edit = changes => PATCH(request('PATCH', {kind:'transactions',companyId,id:record.id,editMode:'details',revision:detail.revision,number:'IPE-1',transactionDate:'2026-09-13',dueDate:'2026-10-09',...changes}));
  const balances = async () => (await database.query("SELECT name,balance FROM contacts WHERE company_id=$1 AND type='customer' ORDER BY id", [companyId])).rows;
  const assertLedger = async () => {
    const rows = (await database.query('SELECT jl.account_name, sum(jl.debit-jl.credit) AS net FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id WHERE je.transaction_id=$1 GROUP BY jl.account_name', [record.id])).rows;
    assert.equal(Math.abs(Math.round(rows.reduce((sum,line) => sum+Number(line.net),0)*100)),0,'journal balances exactly');
    assert.equal(Math.round(rows.filter(line=>line.account_name.includes('Receivable') || line.account_name==='Customer specific AR').reduce((sum,line)=>sum+Number(line.net),0)*100), Math.round(detail.record.baseTotal*100));
    if (detail.record.party === 'New customer') assert.equal(Math.round(Number(rows.find(line=>line.account_name==='Customer specific AR').net)*100), Math.round(detail.record.baseTotal*100));
  };
  for (const price of [-1, '', 'NaN', 'Infinity', null]) assert.equal((await edit({lineDetails:[{id:detail.lines[0].id,unitPrice:price}]})).status,400);
  assert.equal((await edit({party:'Wrong currency'})).status,400);
  assert.equal((await edit({party:'Not a customer'})).status,400);
  let saved = await edit({party:'New customer',salesman:'Edited rep',dueDate:'2026-10-20',lineDetails:[{id:detail.lines[0].id,unitPrice:120,comments:'Updated price'}]});
  assert.equal(saved.status,200,JSON.stringify(await saved.clone().json()));
  detail = await read();
  assert.equal(detail.record.party,'New customer'); assert.equal(detail.record.salesman,'Edited rep'); assert.equal(detail.record.dueDate,'2026-10-20');
  assert.equal(detail.record.total,252); assert.equal(detail.record.vatAmount,12); assert.equal(detail.record.baseTotal,924.84);
  assert.equal(detail.lines[0].unitPrice,120); assert.equal(detail.lines[0].total,252);
  assert.deepEqual(await balances(),[{name:'Original customer',balance:0},{name:'New customer',balance:252},{name:'Wrong currency',balance:0}]);
  assert.equal((await database.query('SELECT quantity FROM items WHERE id=$1',[itemId])).rows[0].quantity,8);
  assert.equal((await database.query('SELECT count(*)::int AS n FROM inventory_movements WHERE transaction_id=$1',[record.id])).rows[0].n,1);
  await assertLedger();
  assert.equal((await PATCH(request('PATCH',{kind:'transactions',companyId,id:record.id,editMode:'details',revision:original.revision,number:'IPE-1',transactionDate:'2026-09-13',party:'Original customer'}))).status,409);
  saved = await edit({party:'Original customer'}); assert.equal(saved.status,200); detail = await read(); await assertLedger();
  saved = await edit({party:'New customer'}); assert.equal(saved.status,200); detail = await read(); await assertLedger();
  saved = await edit({lineDetails:[{id:detail.lines[0].id,unitPrice:0}]}); assert.equal(saved.status,200); detail=await read(); assert.equal(detail.record.total,0); await assertLedger();
  saved = await edit({lineDetails:[{id:detail.lines[0].id,unitPrice:120}]}); assert.equal(saved.status,200); detail=await read(); await assertLedger();
  saved = await edit({lineDetails:[{id:detail.lines[0].id,unitPrice:90.01}],appendLines:[{itemId,description:'Another laptop',quantity:1,unitPrice:50,unitCost:40,vatCode:'STANDARD'}]});
  assert.equal(saved.status,200,JSON.stringify(await saved.clone().json())); detail = await read();
  assert.equal(detail.record.total,241.52); assert.equal(detail.record.vatAmount,11.5); assert.equal(detail.lines.length,2);
  assert.equal((await balances())[1].balance,241.52); await assertLedger();
  const paymentId = (await database.query("INSERT INTO transactions(company_id,location_id,type,number,party,currency,transaction_date,total) VALUES ($1,$2,'customer payment','IPE-PAY','New customer','USD','2026-09-14',100) RETURNING id",[companyId,locationId])).rows[0].id;
  await database.query('INSERT INTO invoice_payment_allocations(payment_id,invoice_id,amount) VALUES ($1,$2,100)',[paymentId,record.id]);
  await database.query("UPDATE contacts SET balance=balance-100 WHERE company_id=$1 AND name='New customer'",[companyId]);
  const beforeRejected = await read();
  assert.equal((await edit({party:'Original customer'})).status,409);
  assert.equal((await edit({lineDetails:[{id:detail.lines[0].id,unitPrice:1}]})).status,409);
  assert.deepEqual((await read()).lines,beforeRejected.lines);
  saved = await edit({lineDetails:[{id:detail.lines[0].id,unitPrice:100}]});
  assert.equal(saved.status,200,JSON.stringify(await saved.clone().json())); detail=await read();
  assert.equal(detail.record.status,'partially paid'); assert.equal(detail.record.total,262.5);
  assert.equal((await balances())[1].balance,162.5); await assertLedger();
  assert.equal((await database.query('SELECT amount FROM invoice_payment_allocations WHERE payment_id=$1',[paymentId])).rows[0].amount,100);
  assert.equal((await database.query('SELECT quantity FROM items WHERE id=$1',[itemId])).rows[0].quantity,7);
  assert.equal((await database.query('SELECT count(*)::int AS n FROM audit_log WHERE entity_id=$1 AND entity_type=\'transaction\' AND action=\'updated\'',[record.id])).rows[0].n,7);
});

test('invoice edit allows quantity, VAT code and description while reconciling stock and accounting', async () => {
  const companyId=(await database.query("INSERT INTO companies(name) VALUES ('Invoice full line edit') RETURNING id")).rows[0].id;
  const locationId=(await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES ($1,'IFLE','IFLE','IFLE') RETURNING id",[companyId])).rows[0].id;
  const itemId=(await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity,cost,item_type) VALUES ($1,$2,'IFLE-STOCK','Laptop',10,40,'stock-part') RETURNING id",[companyId,locationId])).rows[0].id;
  await database.query("INSERT INTO contacts(company_id,type,name,currency,status) VALUES ($1,'customer','Editable Customer','AED','active')",[companyId]);
  const {POST,GET,PATCH}=await vite.ssrLoadModule('/app/api/records/route.ts');
  const req=(method,body)=>new Request('https://app.test/api/records',{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const created=await POST(req('POST',{kind:'transactions',companyId,locationId,type:'invoice',number:'IFLE-1',party:'Editable Customer',transactionDate:'2026-10-02',dueDate:'2026-10-09',currency:'AED',exchangeRate:1,account:'Sales Revenue',lines:[{itemId,description:'Laptop',quantity:2,unitPrice:100,unitCost:40,vatCode:'STANDARD'}]}));
  assert.equal(created.status,201,JSON.stringify(await created.clone().json()));
  const invoice=(await created.json()).record;
  const read=async()=>await (await GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${companyId}&id=${invoice.id}`))).json();
  let detail=await read();
  const edit=(changes)=>PATCH(req('PATCH',{kind:'transactions',companyId,id:invoice.id,editMode:'details',revision:detail.revision,number:'IFLE-1',transactionDate:'2026-10-02',dueDate:'2026-10-09',lineDetails:[{id:detail.lines[0].id,description:detail.lines[0].description,quantity:detail.lines[0].quantity,unitPrice:detail.lines[0].unitPrice,vatCode:detail.lines[0].vatCode,comments:'',serialNumber:'',...changes}]}));
  const stock=async()=>Number((await database.query('SELECT quantity FROM items WHERE id=$1',[itemId])).rows[0].quantity);
  const movement=async()=>Number((await database.query('SELECT coalesce(sum(quantity),0) AS quantity FROM inventory_movements WHERE transaction_id=$1',[invoice.id])).rows[0].quantity);
  const ledger=async()=>Object.fromEntries((await database.query('SELECT jl.account_name,round(sum(jl.debit-jl.credit)::numeric,2) AS net FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id WHERE je.transaction_id=$1 GROUP BY jl.account_name',[invoice.id])).rows.map(row=>[row.account_name,Number(row.net)]));
  assert.equal(await stock(),8); assert.equal(await movement(),-2);
  let response=await edit({description:'Updated laptop description',quantity:3,unitPrice:90,vatCode:'ZERO'});
  assert.equal(response.status,200,JSON.stringify(await response.clone().json())); detail=await read();
  assert.equal(detail.record.total,270); assert.equal(detail.record.vatAmount,0); assert.equal(detail.lines[0].description,'Updated laptop description'); assert.equal(detail.lines[0].quantity,3); assert.equal(detail.lines[0].vatCode,'ZERO'); assert.equal(detail.lines[0].vatRate,0); assert.equal(await stock(),7); assert.equal(await movement(),-3);
  let accounts=await ledger(); assert.equal(Object.entries(accounts).find(([name])=>name.startsWith('Accounts Receivable'))?.[1],270); assert.equal(accounts['Sales Revenue'],-270); assert.equal(accounts['Cost of Goods Sold'],120); assert.equal(accounts['Inventory Asset'],-120); assert.equal(Math.round(Object.values(accounts).reduce((sum,value)=>sum+value,0)*100),0);
  response=await edit({quantity:1,vatCode:'STANDARD'}); assert.equal(response.status,200,JSON.stringify(await response.clone().json())); detail=await read();
  assert.equal(detail.record.subtotal,90); assert.equal(detail.record.vatAmount,4.5); assert.equal(detail.record.total,94.5); assert.equal(await stock(),9); assert.equal(await movement(),-1);
  accounts=await ledger(); assert.equal(Object.entries(accounts).find(([name])=>name.startsWith('Accounts Receivable'))?.[1],94.5); assert.equal(accounts['Sales Revenue'],-90); assert.equal(accounts['VAT Payable'],-4.5); assert.equal(accounts['Cost of Goods Sold'],40); assert.equal(accounts['Inventory Asset'],-40); assert.equal(Math.round(Object.values(accounts).reduce((sum,value)=>sum+value,0)*100),0);
  assert.equal((await edit({vatCode:'NOT_ACTIVE'})).status,400); assert.equal((await edit({quantity:20})).status,409); assert.equal(await stock(),9);
  const listId=(await database.query("INSERT INTO packing_lists(company_id,location_id,invoice_id,number,packing_date) VALUES($1,$2,$3,'IFLE-PL','2026-10-02') RETURNING id",[companyId,locationId,invoice.id])).rows[0].id;
  await database.query("INSERT INTO packing_list_lines(packing_list_id,invoice_line_id,description,packed_quantity,units_per_carton,carton_count) VALUES($1,$2,'Packed',1,1,1)",[listId,detail.lines[0].id]);
  assert.equal((await edit({quantity:.5})).status,409); assert.equal(await stock(),9);
  await database.query('UPDATE transactions SET sales_source_id=$1 WHERE id=$1',[invoice.id]); detail=await read();
  assert.equal((await edit({quantity:2})).status,409); assert.equal(await stock(),9);
});


test('account status preserves balances, enforces access and protects linked accounts', async () => {
  const company = (await database.query("INSERT INTO companies (name) VALUES ('Account lifecycle') RETURNING id")).rows[0].id;
  const add = async (code, parent = null, role = null) => (await database.query("INSERT INTO accounts (company_id, code, name, type, balance, parent_account_id, system_role) VALUES ($1,$2,$2,'Bank',-125,$3,$4) RETURNING id", [company, code, parent, role])).rows[0].id;
  const parent = await add('LIFE-PARENT'), child = await add('LIFE-CHILD', parent), system = await add('LIFE-BANK', null, 'BANK');
  const { PATCH } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const change = (id, active, expectedActive, extra = {}) => PATCH(new Request('https://app.test/api/records', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'accounts', editMode: 'account-status', companyId: company, id, active, expectedActive, ...extra }) }));
  const row = async id => (await database.query('SELECT * FROM accounts WHERE id=$1', [id])).rows[0];
  try {
    for (const role of ['sales', 'purchasing', 'viewer', 'inventory']) {
      globalThis.__transferTestUser = { id: 1, email: 'user@test', role, companyIds: [company] };
      assert.equal((await change(child, false, true)).status, 403);
    }
    globalThis.__transferTestUser = { id: 1, email: 'accountant@test', role: 'accountant', companyIds: [company + 9999] };
    assert.equal((await change(child, false, true)).status, 403);
    globalThis.__transferTestUser.companyIds = [company];
    assert.equal((await change(child, 'false', true)).status, 400);
    assert.equal((await change(child, false, true, { balance: 0 })).status, 400);
    assert.equal((await change(system, false, true)).status, 409);
    assert.equal((await change(parent, false, true)).status, 409);
    assert.equal((await change(child, false, true)).status, 200);
    assert.equal((await row(child)).active, false);
    assert.equal(Number((await row(child)).balance), -125);
    assert.equal((await change(child, true, true)).status, 409);
    assert.equal((await change(parent, false, true)).status, 200);
    assert.equal((await change(child, true, false)).status, 409);
    assert.equal((await change(parent, true, false)).status, 200);
    assert.equal((await change(child, true, false)).status, 200);
    await database.query("INSERT INTO contacts (company_id,type,name,loan_account_id) VALUES ($1,'employee','Linked employee',$2)", [company, child]);
    assert.equal((await change(child, false, true)).status, 409);
    const audit = (await database.query("SELECT details FROM audit_log WHERE company_id=$1 AND entity_type='account' AND entity_id=$2 ORDER BY id LIMIT 1", [company, child])).rows[0];
    assert.deepEqual(JSON.parse(audit.details).active, { before: true, after: false });
    assert.equal(JSON.parse(audit.details).actorEmail, 'accountant@test');
  } finally { delete globalThis.__transferTestUser; }
});


test('logistics choices persist per company and validate roles, codes and duplicates', async () => {
  const c = (await database.query("INSERT INTO companies (name) VALUES ('Logistics choices') RETURNING id")).rows[0].id;
  const other = (await database.query("INSERT INTO companies (name) VALUES ('Other choices') RETURNING id")).rows[0].id;
  const route = await vite.ssrLoadModule('/app/api/item-logistics-options/route.ts');
  const create = (body = {}) => route.POST(new Request('https://app.test/api/item-logistics-options', { method: 'POST', headers: { origin: 'https://app.test', 'content-type': 'application/json' }, body: JSON.stringify({ companyId: c, type: 'hs_code', value: '12345678', label: 'Custom goods', ...body }) }));
  const list = companyId => route.GET(new Request(`https://app.test/api/item-logistics-options?companyId=${companyId}`));
  assert.equal((await create()).status, 201);
  assert.equal((await create()).status, 409);
  assert.equal((await create({ value: 'BAD' })).status, 400);
  assert.equal((await create({ value: '12345' })).status, 400);
  assert.equal((await create({ type: 'coo', value: '  custom   origin  ', label: '' })).status, 201);
  assert.equal((await create({ type: 'coo', value: 'CUSTOM ORIGIN' })).status, 409);
  const remove = (id, companyId = c) => route.DELETE(new Request('https://app.test/api/item-logistics-options', { method: 'DELETE', headers: { origin: 'https://app.test', 'content-type': 'application/json' }, body: JSON.stringify({ companyId, id }) }));
  const options = (await (await list(c)).json()).options;
  assert.equal(options.length, 2); assert.ok(options.some(option => option.value === 'CUSTOM ORIGIN'));
  assert.equal((await (await list(other)).json()).options.length, 0);
  try {
    globalThis.__transferTestUser = { id: 1, role: 'viewer', companyIds: [c] };
    assert.equal((await create({ value: '12345679' })).status, 403);
    assert.equal((await list(c)).status, 200);
    assert.equal((await remove(options[0].id)).status, 403);
    globalThis.__transferTestUser = { id: 1, role: 'admin', companyIds: [other] };
    assert.equal((await create({ value: '12345679' })).status, 403);
    assert.equal((await list(c)).status, 403);
    assert.equal((await remove(options[0].id)).status, 403);
    assert.equal((await remove(options[0].id, other)).status, 404);
  } finally { delete globalThis.__transferTestUser; }
  const location = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES ($1,'DELCHOICE','Delete choices','DCH') RETURNING id", [c])).rows[0].id;
  const item = (await database.query("INSERT INTO items(company_id,location_id,sku,name,hs_code,country_of_origin) VALUES ($1,$2,'DELETE-CHOICE','Saved logistics','12345678','CUSTOM ORIGIN') RETURNING id", [c, location])).rows[0].id;
  assert.equal((await remove(0)).status, 400);
  for (const option of options) {
    assert.equal((await remove(option.id)).status, 200);
    assert.equal((await remove(option.id)).status, 404);
    const audit = (await database.query("SELECT details FROM audit_log WHERE entity_type='item_logistics_option' AND action='deleted' AND entity_id=$1", [option.id])).rows;
    assert.equal(audit.length, 1);
    assert.equal(JSON.parse(audit[0].details).value, option.value);
  }
  assert.equal((await (await list(c)).json()).options.length, 0);
  assert.deepEqual((await database.query('SELECT hs_code,country_of_origin FROM items WHERE id=$1', [item])).rows[0], { hs_code: '12345678', country_of_origin: 'CUSTOM ORIGIN' });
  assert.equal((await create()).status, 201);
  const { dimensionText } = await vite.ssrLoadModule('/lib/item-logistics.ts');
  assert.equal(dimensionText(11.5, 35, 55, 'old'), '11.5 × 35 × 55 cm');
  assert.equal(dimensionText(0, 35, 55), '');
  assert.equal(dimensionText(0, 0, 0, 'Manual dimensions'), 'Manual dimensions');
});

test('built-in logistics choices can be edited and deleted per company without changing snapshots', async () => {
  const c = (await database.query("INSERT INTO companies(name) VALUES ('Editable default choices') RETURNING id")).rows[0].id;
  const other = (await database.query("INSERT INTO companies(name) VALUES ('Unaffected default choices') RETURNING id")).rows[0].id;
  const location = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES ($1,'EDITCHOICE','Edit choices','ECH') RETURNING id", [c])).rows[0].id;
  const item = (await database.query("INSERT INTO items(company_id,location_id,sku,name,hs_code,country_of_origin) VALUES ($1,$2,'EDIT-CHOICE','Saved logistics','85235100','CHINA') RETURNING id", [c, location])).rows[0].id;
  const invoice = (await database.query("INSERT INTO transactions(company_id,number,type,party,transaction_date) VALUES($1,'ECH-INV','invoice','Buyer','2026-10-04') RETURNING id", [c])).rows[0].id;
  const line = (await database.query("INSERT INTO transaction_lines(transaction_id,description,quantity,unit_price) VALUES($1,'Saved logistics',1,100) RETURNING id", [invoice])).rows[0].id;
  const packing = (await database.query("INSERT INTO packing_lists(company_id,invoice_id,number,packing_date) VALUES($1,$2,'ECH-PL','2026-10-04') RETURNING id", [c, invoice])).rows[0].id;
  await database.query("INSERT INTO packing_list_lines(packing_list_id,invoice_line_id,item_id,description,hs_code,country_of_origin,packed_quantity,units_per_carton,carton_count) VALUES($1,$2,$3,'Saved logistics','85235100','CHINA',1,1,1)", [packing, line, item]);
  const route = await vite.ssrLoadModule('/app/api/item-logistics-options/route.ts');
  const { logisticsChoices } = await vite.ssrLoadModule('/lib/item-logistics.ts');
  const write = (method, body) => route[method](new Request('https://app.test/api/item-logistics-options', { method, headers: { origin: 'https://app.test', 'content-type': 'application/json' }, body: JSON.stringify({ companyId: c, ...body }) }));
  const read = async (type, companyId = c) => logisticsChoices(type, (await (await route.GET(new Request(`https://app.test/api/item-logistics-options?companyId=${companyId}`))).json()).options);
  const target = { type: 'hs_code', sourceValue: '85235100', value: '85235101', label: 'Edited SSD' };
  try {
    globalThis.__transferTestUser = { id: 1, role: 'viewer', companyIds: [c] };
    assert.equal((await write('PATCH', target)).status, 403);
    assert.equal((await write('DELETE', target)).status, 403);
    globalThis.__transferTestUser = { id: 1, role: 'admin', companyIds: [other] };
    assert.equal((await write('PATCH', target)).status, 403);
  } finally { delete globalThis.__transferTestUser; }
  assert.equal((await write('PATCH', { ...target, sourceValue: 'NOT A DEFAULT' })).status, 404);
  assert.equal((await write('PATCH', { ...target, value: 'invalid' })).status, 400);
  assert.equal((await write('PATCH', { ...target, value: '85285200' })).status, 409);
  const edited = await write('PATCH', target);
  assert.equal(edited.status, 200, JSON.stringify(await edited.clone().json()));
  const option = (await edited.json()).option;
  assert.equal(option.sourceValue, '85235100');
  assert.ok((await read('hs_code')).some(entry => entry.value === '85235101' && entry.label === 'Edited SSD'));
  assert.ok(!(await read('hs_code')).some(entry => entry.value === '85235100'));
  assert.ok((await read('hs_code', other)).some(entry => entry.value === '85235100'));
  assert.equal((await write('PATCH', target)).status, 409);
  assert.equal((await write('PATCH', { id: option.id, companyId: other, value: '12345678' })).status, 404);
  assert.equal((await write('PATCH', { id: option.id, expectedValue: 'stale', value: '12345678' })).status, 409);
  assert.equal((await write('PATCH', { id: option.id, expectedValue: '85235101', value: '85235102', label: 'Revised SSD' })).status, 200);
  assert.equal((await write('DELETE', { id: option.id, expectedValue: '85235101' })).status, 409);
  assert.equal((await write('DELETE', { id: option.id })).status, 200);
  assert.ok(!(await read('hs_code')).some(entry => ['85235100','85235101','85235102'].includes(entry.value)));
  assert.equal((await write('DELETE', { id: option.id })).status, 404);
  assert.equal((await write('DELETE', { type: 'coo', sourceValue: 'CHINA' })).status, 200);
  assert.ok(!(await read('coo')).some(entry => entry.value === 'CHINA'));
  assert.ok((await read('coo', other)).some(entry => entry.value === 'CHINA'));
  const custom = (await (await write('POST', { type: 'coo', value: 'Custom origin' })).json()).option;
  assert.equal((await write('PATCH', { id: custom.id, value: ' Updated origin ', label: '' })).status, 200);
  assert.ok((await read('coo')).some(entry => entry.value === 'UPDATED ORIGIN'));
  assert.equal((await write('PATCH', { id: custom.id, value: 'UNITED ARAB EMIRATES' })).status, 409);
  assert.equal((await write('POST', { type: 'hs_code', value: '85235100' })).status, 201);
  assert.ok((await read('hs_code')).some(entry => entry.value === '85235100'));
  const snapshot = { hs_code: '85235100', country_of_origin: 'CHINA' };
  assert.deepEqual((await database.query('SELECT hs_code,country_of_origin FROM items WHERE id=$1', [item])).rows[0], snapshot);
  assert.deepEqual((await database.query('SELECT hs_code,country_of_origin FROM packing_list_lines WHERE packing_list_id=$1', [packing])).rows[0], snapshot);
  assert.equal((await database.query("SELECT count(*)::int AS n FROM audit_log WHERE company_id=$1 AND entity_type='item_logistics_option' AND action='updated'", [c])).rows[0].n, 3);
});

test('logistics override migration supports individual prepared queries and retries', async () => {
  const source = await readFile(`${root}drizzle/0078_logistics_choice_overrides.sql`, 'utf8');
  const statements = source.split('--> statement-breakpoint').map(value => value.trim()).filter(Boolean);
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const statement of statements) await database.query(statement, []);
  }
});

test('inventory bill edits end with the UAE creation day, later serials append only, and serial edits cannot change finances', async () => {
  const { dubaiDay, canReadDocument, canEditInventoryDocument } = await vite.ssrLoadModule('/lib/document-access.ts');
  assert.equal(canEditInventoryDocument({ role: 'inventory' }, { type: 'bill', createdAt: '2026-10-04T19:59:00Z' }, new Date('2026-10-04T20:00:00Z')), false);
  assert.equal(canEditInventoryDocument({ role: 'inventory' }, { type: 'bill', createdAt: '2026-10-04T00:01:00Z' }, new Date('2026-10-04T19:59:00Z')), true);
  assert.equal(canReadDocument({ role: 'inventory' }, { type: 'bill', createdAt: '2020-01-01T00:00:00Z' }), true);
  const c = (await database.query("INSERT INTO companies(name) VALUES ('Inventory role rules') RETURNING id")).rows[0].id;
  const loc = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES($1,'ROLEINV','Role inventory','RIV') RETURNING id", [c])).rows[0].id;
  const item = (await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity,cost) VALUES($1,$2,'ROLEITEM','Role item',10,40) RETURNING id", [c, loc])).rows[0].id;
  await database.query("INSERT INTO contacts(company_id,type,name,currency) VALUES($1,'vendor','Role Vendor','AED'),($1,'customer','Role Customer','AED')", [c]);
  const route = await vite.ssrLoadModule('/app/api/records/route.ts');
  const write = (method, body) => route[method](new Request('https://app.test/api/records', { method, headers: { origin: 'https://app.test', 'content-type': 'application/json' }, body: JSON.stringify({ companyId: c, locationId: loc, kind: 'transactions', ...body }) }));
  const detail = id => route.GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${c}&id=${id}`));
  const billInput = { type: 'bill', number: 'ROLE-BILL', party: 'Role Vendor', transactionDate: dubaiDay(), currency: 'AED', exchangeRate: 1, account: 'Purchases', lines: [{ itemId: item, description: 'Role item', quantity: 2, unitPrice: 40, vatCode: 'ZERO', serialNumber: 'ROLE-BILL-SERIAL' }] };
  try {
    globalThis.__transferTestUser = { id: 1, role: 'inventory', companyIds: [c] };
    const billResponse = await write('POST', billInput);
    assert.equal(billResponse.status, 201, JSON.stringify(await billResponse.clone().json()));
    const bill = (await billResponse.json()).record;
    let data = await (await detail(bill.id)).json();
    const edited = await write('PATCH', { ...billInput, id: bill.id, revision: data.revision, lines: [{ ...billInput.lines[0], quantity: 3 }] });
    assert.equal(edited.status, 200, JSON.stringify(await edited.clone().json()));
    assert.equal((await write('DELETE', { id: bill.id, memo: 'Not permitted' })).status, 403);
    assert.equal((await write('POST', { ...billInput, number: 'ROLE-BACKDATE', transactionDate: '2020-01-01' })).status, 403);
    data = await (await detail(bill.id)).json();
    await database.query("UPDATE transactions SET created_at=now()-interval '2 days' WHERE id=$1", [bill.id]);
    assert.equal((await detail(bill.id)).status, 200);
    const rows = (await (await route.GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${c}`))).json()).records;
    assert.ok(rows.some(row => row.id === bill.id));
    assert.equal((await write('PATCH', { ...billInput, id: bill.id, revision: data.revision })).status, 403);
    const serial = await vite.ssrLoadModule('/app/api/serial-search/route.ts');
    assert.equal((await (await serial.GET(new Request(`https://app.test/api/serial-search?companyId=${c}&q=ROLE-BILL-SERIAL`))).json()).results.length, 1);
    const attachments = await vite.ssrLoadModule('/app/api/attachments/route.ts');
    assert.equal((await attachments.GET(new Request(`https://app.test/api/attachments?companyId=${c}&entityType=transaction&entityId=${bill.id}`))).status, 200);
    // After the creation day, serial numbers can only be appended; quantities and existing serials stay fixed.
    data = await (await detail(bill.id)).json();
    const billStock = (await database.query('SELECT quantity FROM items WHERE id=$1', [item])).rows[0].quantity;
    const billSerials = { locationId: undefined, id: bill.id, revision: data.revision, editMode: 'purchase-serials', lineDetails: [{ id: data.lines[0].id, serialNumber: 'ROLE-BILL-SERIAL\nLATER-SERIAL' }] };
    assert.equal((await write('PATCH', { ...billSerials, lineDetails: [{ id: data.lines[0].id, serialNumber: 'REPLACED' }] })).status, 403);
    assert.equal((await write('PATCH', { ...billSerials, lineDetails: [{ id: data.lines[0].id, serialNumber: 'ROLE-BILL-SERIAL\nX', quantity: 9 }] })).status, 403);
    const laterSerial = await write('PATCH', billSerials);
    assert.equal(laterSerial.status, 200, JSON.stringify(await laterSerial.clone().json()));
    assert.equal((await database.query('SELECT serial_number FROM transaction_lines WHERE id=$1', [data.lines[0].id])).rows[0].serial_number, 'ROLE-BILL-SERIAL\nLATER-SERIAL');
    assert.equal((await database.query('SELECT quantity FROM items WHERE id=$1', [item])).rows[0].quantity, billStock);
    const purchaseOrder = await write('POST', { ...billInput, type: 'purchase order', number: 'ROLE-PO' });
    assert.equal(purchaseOrder.status, 201);
    assert.equal((await write('POST', { ...billInput, type: 'vendor credit' })).status, 403);
    const newItem = await write('POST', { kind: 'items', name: 'Inventory added item', category: 'General', quantity: 0, cost: 0, salesPrice: 0, itemType: 'stock-part' });
    assert.equal(newItem.status, 201, JSON.stringify(await newItem.clone().json()));
    const vendor = await write('POST', { kind: 'contacts', type: 'vendor', name: 'Inventory Added Vendor', company: 'Inventory Added Vendor LLC', phone: '+971501111222', country: 'United Arab Emirates', currency: 'AED', status: 'active' });
    assert.equal(vendor.status, 201, JSON.stringify(await vendor.clone().json()));

    delete globalThis.__transferTestUser;
    const invoiceResponse = await write('POST', { ...billInput, type: 'invoice', number: 'ROLE-INV', party: 'Role Customer', account: 'Sales Revenue' });
    assert.equal(invoiceResponse.status, 201, JSON.stringify(await invoiceResponse.clone().json()));
    const invoice = (await invoiceResponse.json()).record;
    data = await (await detail(invoice.id)).json();
    const before = (await database.query('SELECT quantity FROM items WHERE id=$1', [item])).rows[0].quantity;
    globalThis.__transferTestUser = { id: 1, role: 'inventory', companyIds: [c] };
    const serialBody = { locationId: undefined, id: invoice.id, revision: data.revision, editMode: 'invoice-serials', lineDetails: [{ id: data.lines[0].id, serialNumber: 'ROLE-BILL-SERIAL\nADDED-SERIAL' }] };
    assert.equal((await write('PATCH', { ...serialBody, total: 0 })).status, 403);
    assert.equal((await write('PATCH', { ...serialBody, lineDetails: [{ id: data.lines[0].id, serialNumber: '' }] })).status, 403);
    assert.equal((await write('PATCH', { ...serialBody, lineDetails: [{ id: data.lines[0].id, serialNumber: 'ROLE-BILL-SERIAL-CHANGED' }] })).status, 403);
    const serialResponse = await write('PATCH', serialBody);
    assert.equal(serialResponse.status, 200, JSON.stringify(await serialResponse.clone().json()));
    assert.equal((await database.query('SELECT quantity FROM items WHERE id=$1', [item])).rows[0].quantity, before);
    assert.equal((await database.query('SELECT total FROM transactions WHERE id=$1', [invoice.id])).rows[0].total, invoice.total);
    assert.equal((await database.query('SELECT serial_number FROM transaction_lines WHERE id=$1', [data.lines[0].id])).rows[0].serial_number, 'ROLE-BILL-SERIAL\nADDED-SERIAL');
    const warranty = await vite.ssrLoadModule('/app/api/warranty-slips/route.ts');
    const contacts = (await database.query("SELECT id,type FROM contacts WHERE company_id=$1 AND name IN ('Role Customer','Role Vendor')", [c])).rows;
    const receipt = await warranty.POST(new Request('https://app.test/api/warranty-slips', { method: 'POST', headers: { origin: 'https://app.test', 'content-type': 'application/json' }, body: JSON.stringify({ companyId: c, customerId: contacts.find(row => row.type === 'customer').id, supplierId: contacts.find(row => row.type === 'vendor').id, invoiceId: invoice.id, invoiceLineId: data.lines[0].id, slipDate: dubaiDay(), purchaseDate: dubaiDay(), returnedToSupplierDate: dubaiDay(), receivedFromSupplierDate: '', status: 'Returned to Supplier', problem: 'Service required', showStamp: false, stampLeft: 130, stampTop: 200 }) }));
    assert.equal(receipt.status, 201, JSON.stringify(await receipt.clone().json()));
    const slip = (await receipt.json()).slip;
    assert.equal(slip.status, 'Returned to Supplier');
    assert.equal((await warranty.DELETE(new Request('https://app.test/api/warranty-slips', { method: 'DELETE', headers: { origin: 'https://app.test', 'content-type': 'application/json' }, body: JSON.stringify({ companyId: c, id: slip.id, revision: slip.updatedAt }) }))).status, 403);

  } finally { delete globalThis.__transferTestUser; }
});

test('inventory users change invoice items and add zero-price lines without changing totals, and may delete items only', async () => {
  const c = (await database.query("INSERT INTO companies(name) VALUES ('Inventory invoice edits') RETURNING id")).rows[0].id;
  const loc = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES($1,'INVEDIT','Edit inventory','IED') RETURNING id", [c])).rows[0].id;
  const addItem = async (sku, quantity, cost) => (await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity,cost,item_type) VALUES($1,$2,$3,$3,$4,$5,'stock-part') RETURNING id", [c, loc, sku, quantity, cost])).rows[0].id;
  const wrong = await addItem('WRONG-SKU', 10, 40), right = await addItem('RIGHT-SKU', 1, 55), cable = await addItem('FREE-CABLE', 5, 3);
  await database.query("INSERT INTO contacts(company_id,type,name,currency) VALUES($1,'customer','Edit Customer','AED')", [c]);
  const route = await vite.ssrLoadModule('/app/api/records/route.ts');
  const call = (method, body) => route[method](new Request('https://app.test/api/records', { method, headers: { origin: 'https://app.test', 'content-type': 'application/json' }, body: JSON.stringify({ companyId: c, kind: 'transactions', ...body }) }));
  const detail = async id => (await route.GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${c}&id=${id}`))).json();
  const stock = async id => Number((await database.query('SELECT quantity FROM items WHERE id=$1', [id])).rows[0].quantity);
  const journalBalance = async id => (await database.query('SELECT round(sum(jl.debit)::numeric,2) AS d, round(sum(jl.credit)::numeric,2) AS cr FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id WHERE je.transaction_id=$1', [id])).rows[0];
  try {
    const created = await call('POST', { locationId: loc, type: 'invoice', number: 'INV-EDIT-1', party: 'Edit Customer', transactionDate: '2026-10-01', currency: 'AED', exchangeRate: 1, account: 'Sales Revenue', lines: [{ itemId: wrong, description: 'WRONG-SKU', quantity: 1, unitPrice: 100, vatCode: 'STANDARD' }] });
    assert.equal(created.status, 201, JSON.stringify(await created.clone().json()));
    const invoice = (await created.json()).record;
    const estimateResponse = await call('POST', { locationId: loc, type: 'estimate', number: 'EST-HIDDEN-1', party: 'Edit Customer', transactionDate: '2026-10-01', currency: 'AED', exchangeRate: 1, account: 'Sales Revenue', lines: [{ itemId: wrong, description: 'WRONG-SKU', quantity: 1, unitPrice: 100, vatCode: 'STANDARD' }] });
    assert.equal(estimateResponse.status, 201, JSON.stringify(await estimateResponse.clone().json()));
    const estimate = (await estimateResponse.json()).record;
    let data = await detail(invoice.id);
    globalThis.__transferTestUser = { id: 1, role: 'inventory', companyIds: [c] };
    // Inventory users see invoices but not estimates or other sales-workflow documents, and not Customization Details.
    const listed = (await (await route.GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${c}`))).json()).records;
    assert.ok(listed.some(row => row.id === invoice.id));
    assert.ok(!listed.some(row => row.id === estimate.id));
    assert.notEqual((await route.GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${c}&id=${estimate.id}`))).status, 200);
    const customization = await vite.ssrLoadModule('/app/api/item-customization/route.ts');
    assert.equal((await (await customization.GET(new Request(`https://app.test/api/item-customization?companyId=${c}&locationId=${loc}`))).json()).canEdit, false);
    const base = { id: invoice.id, revision: data.revision, editMode: 'inventory-invoice' };
    const line = data.lines[0];
    assert.equal((await call('PATCH', { ...base, appendLines: [{ itemId: cable, quantity: 1, unitPrice: 5 }] })).status, 403, 'charged lines are refused');
    assert.equal((await call('PATCH', { ...base, total: 1 })).status, 403, 'financial fields are refused');
    assert.equal((await call('PATCH', { ...base, lineDetails: [{ id: line.id, itemId: right, fromItemId: cable }] })).status, 409, 'stale item is refused');
    assert.equal((await call('PATCH', { ...base, appendLines: [{ itemId: right, quantity: 2 }] })).status, 409, 'stock shortage is refused');
    const saved = await call('PATCH', { ...base, comments: 'Packed by stores', lineDetails: [{ id: line.id, itemId: right, fromItemId: wrong, serialNumber: 'SN-RIGHT-1' }], appendLines: [{ itemId: cable, quantity: 2, serialNumber: '', comments: 'Free cable' }] });
    assert.equal(saved.status, 200, JSON.stringify(await saved.clone().json()));
    assert.deepEqual([await stock(wrong), await stock(right), await stock(cable)], [10, 0, 3]);
    const after = await detail(invoice.id);
    assert.equal(Number(after.record.total), Number(invoice.total));
    assert.equal(after.record.comments, 'Packed by stores');
    assert.equal(after.lines.length, 2);
    assert.equal(Number(after.lines.find(row => row.id === line.id).itemId), right);
    assert.equal(after.lines.find(row => row.id === line.id).serialNumber, 'SN-RIGHT-1');
    assert.equal(Number(after.lines.find(row => row.id !== line.id).unitPrice), 0);
    const balance = await journalBalance(invoice.id);
    assert.equal(balance.d, balance.cr);
    // Stock return: a negative zero-price line brings the item back into stock without changing the total.
    data = await detail(invoice.id);
    assert.equal((await call('PATCH', { id: invoice.id, revision: data.revision, editMode: 'inventory-invoice', appendLines: [{ itemId: cable, quantity: -1, unitPrice: 5 }] })).status, 403);
    const returned = await call('PATCH', { id: invoice.id, revision: data.revision, editMode: 'inventory-invoice', appendLines: [{ itemId: cable, quantity: -1, serialNumber: '', comments: 'Returned cable' }] });
    assert.equal(returned.status, 200, JSON.stringify(await returned.clone().json()));
    assert.equal(await stock(cable), 4);
    assert.equal(Number((await detail(invoice.id)).record.total), Number(invoice.total));
    const returnBalance = await journalBalance(invoice.id);
    assert.equal(returnBalance.d, returnBalance.cr);
    // Delivery: only accountants and administrators mark an invoice delivered or not delivered.
    assert.equal((await call('PATCH', { id: invoice.id, editMode: 'delivery', delivered: true })).status, 403);
    const inventoryShipTo = await call('PATCH', { id: invoice.id, editMode: 'delivery-address', deliveryAddress: 'Inventory dock' });
    assert.equal(inventoryShipTo.status, 200, JSON.stringify(await inventoryShipTo.clone().json()));
    // Sales users change the Ship To of their own invoices only.
    globalThis.__transferTestUser = { id: 1, role: 'sales', companyIds: [c] };
    assert.equal((await call('PATCH', { id: invoice.id, editMode: 'delivery-address', deliveryAddress: 'Not my invoice' })).status, 403);
    await database.query('UPDATE transactions SET created_by_user_id=1 WHERE id=$1', [invoice.id]);
    await database.query("UPDATE contacts SET sales_owner_id=1 WHERE company_id=$1 AND name='Edit Customer'", [c]);
    const salesShipTo = await call('PATCH', { id: invoice.id, editMode: 'delivery-address', deliveryAddress: 'Sales customer site' });
    assert.equal(salesShipTo.status, 200, JSON.stringify(await salesShipTo.clone().json()));
    assert.equal((await call('PATCH', { id: invoice.id, editMode: 'delivery', delivered: true })).status, 403);
    globalThis.__transferTestUser = { id: 1, role: 'inventory', companyIds: [c] };
    globalThis.__transferTestUser = { id: 1, role: 'accountant', companyIds: [c] };
    const delivered = await call('PATCH', { id: invoice.id, editMode: 'delivery', delivered: true });
    assert.equal(delivered.status, 200, JSON.stringify(await delivered.clone().json()));
    assert.ok((await delivered.json()).record.deliveredAt);
    assert.equal((await (await call('PATCH', { id: invoice.id, editMode: 'delivery', delivered: false })).json()).record.deliveredAt, null);
    // Ship To: accountants paste or type the delivery address on the saved invoice; totals stay the same.
    const shipTo = await call('PATCH', { id: invoice.id, editMode: 'delivery-address', deliveryAddress: 'Warehouse 4\r\nAl Quoz, Dubai ' });
    assert.equal(shipTo.status, 200, JSON.stringify(await shipTo.clone().json()));
    assert.equal((await shipTo.json()).record.deliveryAddress, 'Warehouse 4\nAl Quoz, Dubai');
    assert.equal(Number((await detail(invoice.id)).record.total), Number(invoice.total));
    assert.equal((await call('PATCH', { id: invoice.id, editMode: 'delivery-address', deliveryAddress: 'x', total: 1 })).status, 400);
    globalThis.__transferTestUser = { id: 1, role: 'inventory', companyIds: [c] };
    assert.equal((await call('DELETE', { id: invoice.id, deletionReason: 'not allowed' })).status, 403);
    const contact = (await database.query("SELECT id FROM contacts WHERE company_id=$1 AND name='Edit Customer'", [c])).rows[0].id;
    assert.equal((await call('DELETE', { kind: 'contacts', id: contact, deletionReason: 'not allowed' })).status, 403);
    const spare = await addItem('SPARE-ITEM', 0, 0);
    assert.equal((await call('DELETE', { kind: 'items', id: spare, deletionReason: 'duplicate item' })).status, 200);
  } finally { delete globalThis.__transferTestUser; }
});

test('every saved document type accepts attachments from the role that writes it', async () => {
  const c = (await database.query("INSERT INTO companies(name) VALUES ('Attachment roles') RETURNING id")).rows[0].id;
  const doc = async (type, number) => (await database.query("INSERT INTO transactions (company_id,number,type,party,transaction_date) VALUES ($1,$2,$3,'Someone','2026-10-01') RETURNING id", [c, number, type])).rows[0].id;
  const estimate = await doc('estimate', 'ATT-EST'), payment = await doc('customer payment', 'ATT-PAY'), order = await doc('purchase order', 'ATT-PO');
  const route = await vite.ssrLoadModule('/app/api/attachments/route.ts');
  const upload = (entityId) => route.POST(new Request('https://app.test/api/attachments', { method: 'POST', headers: { origin: 'https://app.test', 'content-type': 'application/json' }, body: JSON.stringify({ companyId: c, entityType: 'transaction', entityId, attachments: [{ fileName: 'note.txt', mimeType: 'text/plain', fileData: 'data:text/plain;base64,aGVsbG8=', fileSize: 5 }] }) }));
  try {
    globalThis.__transferTestUser = { id: 1, role: 'accountant', companyIds: [c] };
    assert.equal((await upload(estimate)).status, 201);
    assert.equal((await upload(payment)).status, 201);
    assert.equal((await upload(order)).status, 201);
    globalThis.__transferTestUser = { id: 1, role: 'viewer', companyIds: [c] };
    assert.equal((await upload(estimate)).status, 403);
    globalThis.__transferTestUser = { id: 1, role: 'purchasing', companyIds: [c] };
    assert.equal((await upload(estimate)).status, 403);
    assert.equal((await upload(order)).status, 201);
  } finally { delete globalThis.__transferTestUser; }
});

test('stock holds reserve quantity for one sales rep until released', async () => {
  const c = (await database.query("INSERT INTO companies(name) VALUES ('Stock hold test') RETURNING id")).rows[0].id;
  const loc = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES($1,'HOLD','Hold stock','HLD') RETURNING id", [c])).rows[0].id;
  const other = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES($1,'HOLD2','Hold other','HL2') RETURNING id", [c])).rows[0].id;
  const item = (await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity,cost,item_type) VALUES($1,$2,'HOLD-SKU','Held laptop',10,40,'stock-part') RETURNING id", [c, loc])).rows[0].id;
  await database.query("INSERT INTO contacts(company_id,type,name,currency) VALUES($1,'customer','Hold Customer','AED'),($1,'employee','Ali Rep','AED'),($1,'employee','Sara Rep','AED')", [c]);
  const holds = await vite.ssrLoadModule('/app/api/stock-holds/route.ts');
  const records = await vite.ssrLoadModule('/app/api/records/route.ts');
  const transfers = await vite.ssrLoadModule('/app/api/transfers/route.ts');
  const req = (path, method, body) => new Request(`https://app.test/api/${path}`, { method, headers: { origin: 'https://app.test', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const invoice = (salesman, quantity, number) => records.POST(req('records', 'POST', { kind: 'transactions', companyId: c, locationId: loc, type: 'invoice', number, party: 'Hold Customer', salesman, transactionDate: '2026-10-01', currency: 'AED', exchangeRate: 1, account: 'Sales Revenue', lines: [{ itemId: item, description: 'Held laptop', quantity, unitPrice: 100, vatCode: 'STANDARD' }] }));
  try {
    globalThis.__transferTestUser = { id: 1, role: 'inventory', companyIds: [c] };
    assert.equal((await holds.POST(req('stock-holds', 'POST', { companyId: c, itemId: item, quantity: 6, hours: 4, salesRep: 'Ali Rep' }))).status, 403);
    globalThis.__transferTestUser = { id: 1, role: 'accountant', companyIds: [c] };
    assert.deepEqual((await (await holds.GET(new Request(`https://app.test/api/stock-holds?companyId=${c}`))).json()).salesReps, ['Ali Rep', 'Sara Rep']);
    assert.equal((await holds.POST(req('stock-holds', 'POST', { companyId: c, itemId: item, quantity: 11, hours: 4, salesRep: 'Ali Rep' }))).status, 409);
    const created = await holds.POST(req('stock-holds', 'POST', { companyId: c, itemId: item, quantity: 6, hours: 4, salesRep: 'Ali Rep', note: 'Collecting tomorrow' }));
    assert.equal(created.status, 201, JSON.stringify(await created.clone().json()));
    const hold = (await created.json()).hold;
    globalThis.__transferTestUser = { id: 1, role: 'admin', companyIds: [c] };
    // 10 in stock, 6 held for Ali: Sara can sell only 4; Ali can sell the held stock.
    const blocked = await invoice('Sara Rep', 5, 'HOLD-INV-1');
    assert.equal(blocked.status, 409);
    assert.match((await blocked.json()).error, /on hold for another sales rep/);
    // The admin negative-stock override does not unlock stock held for another rep.
    const pin = await vite.ssrLoadModule('/lib/admin-pin.ts');
    await database.query('INSERT INTO company_settings(company_id,negative_stock_pin_hash) VALUES($1,$2)', [c, await pin.hashAdminPin('246810')]);
    const overridden = await records.POST(req('records', 'POST', { kind: 'transactions', companyId: c, locationId: loc, type: 'invoice', number: 'HOLD-INV-PIN', party: 'Hold Customer', salesman: 'Sara Rep', transactionDate: '2026-10-01', currency: 'AED', exchangeRate: 1, account: 'Sales Revenue', allowNegativeStock: true, adminOverridePin: '246810', lines: [{ itemId: item, description: 'Held laptop', quantity: 5, unitPrice: 100, vatCode: 'STANDARD' }] }));
    assert.equal(overridden.status, 409);
    assert.match((await overridden.json()).error, /on hold for another sales rep/);
    // The holds list lets the invoice form fill in only the free quantity.
    assert.deepEqual((await (await holds.GET(new Request(`https://app.test/api/stock-holds?companyId=${c}`))).json()).holds.map((row) => [row.itemId, row.quantity, row.salesRep]), [[item, 6, 'Ali Rep']]);
    assert.equal((await invoice('Sara Rep', 4, 'HOLD-INV-2')).status, 201);
    assert.equal((await invoice('Ali Rep', 6, 'HOLD-INV-3')).status, 201);
    await database.query('UPDATE items SET quantity=10 WHERE id=$1', [item]);
    assert.equal((await transfers.POST(req('transfers', 'POST', { reference: 'HOLD-TRF-1', salesman: 'Sara Rep', lines: [{ itemId: item, sourceLocationId: loc, destinationLocationId: other, quantity: 5 }] }))).status, 409);
    globalThis.__transferTestUser = { id: 1, role: 'accountant', companyIds: [c] };
    assert.equal((await (await holds.PATCH(req('stock-holds', 'PATCH', { companyId: c, id: hold.id }))).json()).released, 1);
    globalThis.__transferTestUser = { id: 1, role: 'admin', companyIds: [c] };
    assert.equal((await invoice('Sara Rep', 8, 'HOLD-INV-4')).status, 201);
    // Expired holds no longer reserve stock.
    await database.query("INSERT INTO stock_holds(company_id,item_id,quantity,sales_rep,expires_at) VALUES($1,$2,2,'Ali Rep',now() - interval '1 hour')", [c, item]);
    await database.query('UPDATE items SET quantity=2 WHERE id=$1', [item]);
    assert.equal((await invoice('Sara Rep', 2, 'HOLD-INV-5')).status, 201);
  } finally { delete globalThis.__transferTestUser; }
});

test('inactive STANDARD and ZERO codes: receipts stay zero-rated and defaults use another active code', async () => {
  const c = (await database.query("INSERT INTO companies(name) VALUES ('Inactive VAT defaults') RETURNING id")).rows[0].id;
  const loc = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES($1,'IVAT','VAT inventory','IVT') RETURNING id", [c])).rows[0].id;
  const item = (await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity,cost,item_type) VALUES($1,$2,'IVAT-SKU','VAT laptop',10,40,'stock-part') RETURNING id", [c, loc])).rows[0].id;
  await database.query("INSERT INTO contacts(company_id,type,name,currency) VALUES($1,'customer','VAT Customer','AED'),($1,'vendor','VAT Vendor','AED')", [c]);
  await database.query("INSERT INTO vat_codes(company_id,code,name,rate,description,active,system) VALUES($1,'STANDARD','Standard rated',5,'',false,true),($1,'ZERO','Zero rated',0,'',false,true),($1,'EXEMPT','Exempt',0,'',true,true),($1,'REVERSE_CHARGE','Reverse charge',5,'',true,true),($1,'REDUCED','Reduced',5,'',true,false)", [c]);
  const records = await vite.ssrLoadModule('/app/api/records/route.ts');
  const post = (body) => records.POST(new Request('https://app.test/api/records', { method: 'POST', headers: { origin: 'https://app.test', 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'transactions', companyId: c, locationId: loc, transactionDate: '2026-10-01', currency: 'AED', exchangeRate: 1, ...body }) }));
  const lines = async (id) => (await database.query('SELECT vat_code, vat_rate FROM transaction_lines WHERE transaction_id=$1 ORDER BY id', [id])).rows.map((row) => [row.vat_code, Number(row.vat_rate)]);
  try {
    globalThis.__transferTestUser = { id: 1, role: 'admin', companyIds: [c] };
    const receipt = await post({ type: 'item receipt', number: 'IVAT-IR', party: 'VAT Vendor', lines: [{ itemId: item, description: 'VAT laptop', quantity: 1, unitPrice: 40, vatCode: 'STANDARD' }] });
    assert.equal(receipt.status, 201, JSON.stringify(await receipt.clone().json()));
    assert.deepEqual(await lines((await receipt.json()).record.id), [['ZERO', 0]]);
    const invoice = await post({ type: 'invoice', number: 'IVAT-INV', party: 'VAT Customer', account: 'Sales Revenue', lines: [{ itemId: item, description: 'VAT laptop', quantity: 1, unitPrice: 100, vatCode: 'STANDARD' }] });
    assert.equal(invoice.status, 201, JSON.stringify(await invoice.clone().json()));
    // STANDARD is inactive: the line takes the active 5% code that is not reverse charge or import.
    assert.deepEqual(await lines((await invoice.json()).record.id), [['REDUCED', 5]]);
  } finally { delete globalThis.__transferTestUser; }
});

test('items bought as Out of scope are sold on OUT_OF_SCOPE and on their own document', async () => {
  const c = (await database.query("INSERT INTO companies(name) VALUES ('Out of scope sales') RETURNING id")).rows[0].id;
  const loc = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES($1,'OOS','OOS inventory','OOS') RETURNING id", [c])).rows[0].id;
  const item = async (sku, code) => (await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity,cost,item_type,purchase_vat_code) VALUES($1,$2,$3,$3,10,40,'stock-part',$4) RETURNING id", [c, loc, sku, code])).rows[0].id;
  const byDefault = await item('OOS-DEFAULT', 'OUT_OF_SCOPE'), byBill = await item('OOS-BILL', 'STANDARD'), normal = await item('OOS-NORMAL', 'STANDARD');
  const bill = (await database.query("INSERT INTO transactions(company_id,location_id,number,type,party,transaction_date,status) VALUES($1,$2,'OOS-BILL-1','bill','OOS Vendor','2026-09-01','open') RETURNING id", [c, loc])).rows[0].id;
  await database.query("INSERT INTO transaction_lines(transaction_id,item_id,description,quantity,unit_price,vat_code,vat_rate) VALUES($1,$2,'OOS-BILL',1,40,'OUT_OF_SCOPE',0)", [bill, byBill]);
  await database.query("INSERT INTO contacts(company_id,type,name,currency) VALUES($1,'customer','OOS Customer','AED')", [c]);
  const records = await vite.ssrLoadModule('/app/api/records/route.ts');
  const invoice = (number, lines) => records.POST(new Request('https://app.test/api/records', { method: 'POST', headers: { origin: 'https://app.test', 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'transactions', companyId: c, locationId: loc, type: 'invoice', number, party: 'OOS Customer', transactionDate: '2026-10-01', currency: 'AED', exchangeRate: 1, account: 'Sales Revenue', lines: lines.map((itemId) => ({ itemId, description: 'Laptop', quantity: 1, unitPrice: 100, vatCode: 'STANDARD' })) }) }));
  try {
    globalThis.__transferTestUser = { id: 1, role: 'admin', companyIds: [c] };
    const listed = await (await records.GET(new Request(`https://app.test/api/records?kind=items&companyId=${c}&locationId=${loc}`))).json();
    assert.deepEqual(listed.records.map((row) => [row.sku, row.outOfScope]).sort(), [['OOS-BILL', true], ['OOS-DEFAULT', true], ['OOS-NORMAL', false]]);
    for (const [number, itemId] of [['OOS-INV-1', byDefault], ['OOS-INV-2', byBill]]) {
      const created = await invoice(number, [itemId]);
      assert.equal(created.status, 201, JSON.stringify(await created.clone().json()));
      const record = (await created.json()).record;
      assert.deepEqual((await database.query('SELECT vat_code, vat_rate::float AS vat_rate FROM transaction_lines WHERE transaction_id=$1', [record.id])).rows, [{ vat_code: 'OUT_OF_SCOPE', vat_rate: 0 }]);
      assert.equal(Number(record.vatAmount), 0);
    }
    const mixed = await invoice('OOS-INV-3', [byDefault, normal]);
    assert.equal(mixed.status, 400);
    assert.match((await mixed.json()).error, /own document/);
    assert.equal((await invoice('OOS-INV-4', [normal])).status, 201);
  } finally { delete globalThis.__transferTestUser; }
});

test('filed VAT and corporate tax periods lock dated changes until the Admin PIN is entered', async () => {
  const c = (await database.query("INSERT INTO companies(name) VALUES ('Filed period lock') RETURNING id")).rows[0].id;
  const loc = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES($1,'LOCK','Lock inventory','LCK') RETURNING id", [c])).rows[0].id;
  await database.query("INSERT INTO contacts(company_id,type,name,currency) VALUES($1,'customer','Lock Customer','AED')", [c]);
  await database.query("INSERT INTO vat_returns(company_id,period_start,period_end,reference) VALUES($1,'2026-07-01','2026-09-30','VAT-Q3-2026')", [c]);
  await database.query("INSERT INTO income_tax_working_papers(company_id,period_start,period_end,config,filed_at) VALUES($1,'2025-01-01','2025-12-31','{}',now())", [c]);
  const records = await vite.ssrLoadModule('/app/api/records/route.ts');
  const pin = await vite.ssrLoadModule('/lib/admin-pin.ts');
  const send = (method, body, adminPin) => records[method](new Request('https://app.test/api/records', { method, headers: { origin: 'https://app.test', 'content-type': 'application/json', ...(adminPin ? { 'x-period-lock-pin': adminPin } : {}) }, body: JSON.stringify(body) }));
  const invoice = (number, transactionDate, type = 'invoice') => ({ kind: 'transactions', companyId: c, locationId: loc, type, number, party: 'Lock Customer', transactionDate, currency: 'AED', exchangeRate: 1, account: 'Sales Revenue', lines: [{ description: 'Service', quantity: 1, unitPrice: 100, vatCode: 'STANDARD' }] });
  try {
    globalThis.__transferTestUser = { id: 1, role: 'admin', companyIds: [c] };
    const noPinSet = await send('POST', invoice('LOCK-1', '2026-09-15'));
    assert.equal(noPinSet.status, 423);
    const noPinBody = await noPinSet.json();
    assert.deepEqual([noPinBody.code, noPinBody.pinConfigured], ['PERIOD_LOCKED', false]);
    await database.query('INSERT INTO company_settings(company_id,negative_stock_pin_hash) VALUES($1,$2)', [c, pin.hashAdminPin('246810')]);
    const ask = await (await send('POST', invoice('LOCK-1', '2026-09-15'))).json();
    assert.deepEqual([ask.code, ask.pinConfigured, ask.period.reference], ['PERIOD_LOCKED', true, 'VAT-Q3-2026']);
    assert.equal((await (await send('POST', invoice('LOCK-1', '2026-09-15'), '111111')).json()).wrongPin, true);
    const allowed = await send('POST', invoice('LOCK-1', '2026-09-15'), '246810');
    assert.equal(allowed.status, 201, JSON.stringify(await allowed.clone().json()));
    const filed = (await allowed.json()).record;
    assert.equal((await database.query("SELECT count(*)::int AS n FROM audit_log WHERE company_id=$1 AND action='filed-period override'", [c])).rows[0].n, 1);
    // Outside filed periods, and for documents that never post, nothing is asked.
    assert.equal((await send('POST', invoice('LOCK-2', '2026-10-01'))).status, 201);
    assert.equal((await send('POST', invoice('LOCK-Q', '2026-09-15', 'quotation'))).status, 201);
    // A filed corporate tax period locks the same way; deleting a document in a filed period needs the PIN too.
    assert.equal((await send('POST', invoice('LOCK-3', '2025-06-01'))).status, 423);
    assert.equal((await send('DELETE', { kind: 'transactions', companyId: c, id: filed.id, deletionReason: 'Test' })).status, 423);
  } finally { delete globalThis.__transferTestUser; }
});

test('share emoji: users save a WhatsApp and Telegram style; an administrator switches emoji off per company', async () => {
  const c = (await database.query("INSERT INTO companies(name) VALUES ('Share emoji') RETURNING id")).rows[0].id;
  const loc = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES($1,'EMO','Emoji inventory','EMO') RETURNING id", [c])).rows[0].id;
  await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity,cost,item_type) VALUES($1,$2,'EMO-SKU','Emoji laptop',3,40,'stock-part')", [c, loc]);
  const user = (await database.query("INSERT INTO app_users(email,full_name,password_hash,role,active) VALUES('emoji@test.local','Emoji User','x','admin',true) RETURNING id")).rows[0].id;
  const preferences = await vite.ssrLoadModule('/app/api/user-preferences/route.ts');
  const admin = await vite.ssrLoadModule('/app/api/admin-settings/route.ts');
  const overview = await vite.ssrLoadModule('/app/api/inventory-overview/route.ts');
  const req = (path, method, body) => new Request(`https://app.test/api/${path}`, { method, headers: { origin: 'https://app.test', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const shareEmoji = async () => (await (await overview.GET(new Request(`https://app.test/api/inventory-overview?companyId=${c}`))).json()).shareEmoji;
  try {
    globalThis.__transferTestUser = { id: user, role: 'admin', companyIds: [c] };
    assert.deepEqual(await shareEmoji(), { whatsapp: 'classic', telegram: 'classic', offCompanyIds: [] });
    assert.equal((await preferences.PATCH(req('user-preferences', 'PATCH', { shareEmojiWhatsapp: 'fire', shareEmojiTelegram: 'none' }))).status, 200);
    assert.equal((await preferences.PATCH(req('user-preferences', 'PATCH', { shareEmojiWhatsapp: 'unknown' }))).status, 400);
    assert.equal((await admin.PATCH(req('admin-settings', 'PATCH', { companyId: c, shareEmojis: false }))).status, 200);
    assert.deepEqual(await shareEmoji(), { whatsapp: 'fire', telegram: 'none', offCompanyIds: [c] });
    assert.equal((await (await admin.GET(new Request(`https://app.test/api/admin-settings?companyId=${c}`))).json()).shareEmojis, false);
  } finally { delete globalThis.__transferTestUser; }
});

test('company setup saves the UAE e-invoicing section on its own', async () => {
  const c = (await database.query("INSERT INTO companies(name,trn) VALUES ('E-invoice company','100123456700003') RETURNING id")).rows[0].id;
  const setup = await vite.ssrLoadModule('/app/api/company-setup/route.ts');
  const patch = (body) => setup.PATCH(new Request('https://app.test/api/company-setup', { method: 'PATCH', headers: { origin: 'https://app.test', 'content-type': 'application/json' }, body: JSON.stringify({ companyId: c, ...body }) }));
  try {
    globalThis.__transferTestUser = { id: 1, role: 'admin', companyIds: [c] };
    const saved = await patch({ einvoiceEnabled: true, peppolParticipantId: '0235:100123456700003', einvoiceAsp: 'Example ASP', einvoiceAspAccount: 'ACC-1', einvoiceGoLive: '2027-01-01' });
    assert.equal(saved.status, 200, await saved.clone().text());
    const record = (await saved.json()).record;
    assert.deepEqual([record.einvoiceEnabled, record.peppolParticipantId, record.einvoiceAsp, record.einvoiceAspAccount, record.einvoiceGoLive, record.trn], [true, '0235:100123456700003', 'Example ASP', 'ACC-1', '2027-01-01', '100123456700003']);
    assert.equal((await patch({ einvoiceGoLive: '2027-13-45' })).status, 400);
    globalThis.__transferTestUser = { id: 1, role: 'accountant', companyIds: [c] };
    assert.equal((await patch({ einvoiceEnabled: false })).status, 403);
  } finally { delete globalThis.__transferTestUser; }
});

test('customers save a postal address, and edits keep fields they leave out', async () => {
  const c = (await database.query("INSERT INTO companies(name) VALUES ('Customer address') RETURNING id")).rows[0].id;
  const loc = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES($1,'ADDR','Address inventory','ADR') RETURNING id", [c])).rows[0].id;
  const records = await vite.ssrLoadModule('/app/api/records/route.ts');
  const send = (method, body) => records[method](new Request('https://app.test/api/records', { method, headers: { origin: 'https://app.test', 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'contacts', companyId: c, locationId: loc, ...body }) }));
  try {
    globalThis.__transferTestUser = { id: 1, role: 'admin', companyIds: [c] };
    const created = await send('POST', { type: 'customer', name: 'Address Trading LLC', company: 'Address Trading LLC', phone: '+97140000011', whatsapp: '+971500000011', currency: 'AED', reseller: 'Reseller', planet: 'No', country: 'United Arab Emirates', trn: '100123456700003', addressLine1: 'Office 5, Al Barsha', addressLine2: 'P.O. Box 123', city: 'Dubai', region: 'Dubai', postalCode: '00000' });
    assert.equal(created.status, 201, JSON.stringify(await created.clone().json()));
    const customer = (await created.json()).record;
    assert.deepEqual([customer.addressLine1, customer.addressLine2, customer.city, customer.region, customer.postalCode], ['Office 5, Al Barsha', 'P.O. Box 123', 'Dubai', 'Dubai', '00000']);
    const edited = await send('PATCH', { id: customer.id, name: customer.name, city: 'Abu Dhabi', region: 'Abu Dhabi' });
    assert.equal(edited.status, 200, JSON.stringify(await edited.clone().json()));
    const after = (await database.query('SELECT address_line_1, city, region FROM contacts WHERE id=$1', [customer.id])).rows[0];
    assert.deepEqual(after, { address_line_1: 'Office 5, Al Barsha', city: 'Abu Dhabi', region: 'Abu Dhabi' });
  } finally { delete globalThis.__transferTestUser; }
});

test('pending invoices remain unposted until an administrator or accountant converts them once', async () => {
  const c = (await database.query("INSERT INTO companies(name) VALUES ('Pending invoice roles') RETURNING id")).rows[0].id;
  const loc = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES($1,'PENDROLE','Pending inventory','PEND') RETURNING id", [c])).rows[0].id;
  const item = (await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity,cost) VALUES($1,$2,'PENDITEM','Draft item',10,40) RETURNING id", [c, loc])).rows[0].id;
  await database.query("INSERT INTO contacts(company_id,type,name,currency) VALUES($1,'customer','Pending Customer','AED')", [c]);
  const route = await vite.ssrLoadModule('/app/api/records/route.ts');
  const post = body => route.POST(new Request('https://app.test/api/records', { method: 'POST', headers: { origin: 'https://app.test', 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'transactions', companyId: c, locationId: loc, type: 'pending invoice', number: 'PEND-ROLE', party: 'Pending Customer', transactionDate: '2026-10-04', currency: 'AED', exchangeRate: 1, account: 'Accounts Receivable', lines: [{ itemId: item, description: 'Draft item', quantity: 2, unitPrice: 100, vatCode: 'ZERO' }], ...body }) }));
  const stock = async () => Number((await database.query('SELECT quantity FROM items WHERE id=$1', [item])).rows[0].quantity);
  try {
    for (const role of ['sales', 'inventory', 'purchasing', 'viewer']) {
      globalThis.__transferTestUser = { id: 1, role, companyIds: [c] };
      assert.equal((await post({})).status, 403);
    }
    globalThis.__transferTestUser = { id: 1, role: 'accountant', companyIds: [c] };
    const response = await post({});
    assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
    const pending = (await response.json()).record;
    assert.equal(pending.status, 'pending'); assert.equal(await stock(), 10);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM journal_entries WHERE transaction_id=$1', [pending.id])).rows[0].n, 0);
    assert.equal((await database.query('SELECT balance FROM contacts WHERE company_id=$1', [c])).rows[0].balance, 0);
    const pendingDetail = await (await route.GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${c}&id=${pending.id}`))).json();
    const edit = await route.PATCH(new Request('https://app.test/api/records', { method: 'PATCH', headers: { origin: 'https://app.test', 'content-type': 'application/json' }, body: JSON.stringify({ ...pending, kind: 'transactions', revision: pendingDetail.revision, lines: pendingDetail.lines.map(line => ({ ...line, quantity: 2, unitPrice: 110 })) }) }));
    assert.equal(edit.status, 200, JSON.stringify(await edit.clone().json()));
    assert.equal(await stock(), 10);
    globalThis.__transferTestUser.role = 'sales';
    assert.equal((await route.GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${c}&id=${pending.id}`))).status, 404);
    assert.equal((await post({ type: 'invoice', sourceTransactionId: pending.id })).status, 403);
    globalThis.__transferTestUser.role = 'accountant';
    const posted = await post({ type: 'invoice', sourceTransactionId: pending.id });
    assert.equal(posted.status, 201, JSON.stringify(await posted.clone().json()));
    assert.equal(await stock(), 8);
    assert.equal((await post({ type: 'invoice', sourceTransactionId: pending.id })).status, 409);
    assert.equal(await stock(), 8);
    assert.equal((await database.query('SELECT status FROM transactions WHERE id=$1', [pending.id])).rows[0].status, 'converted');
  } finally { delete globalThis.__transferTestUser; }
});

test('accountants can update bank details and stamps but not company identity or saved-record deletion', async () => {
  const c = (await database.query("INSERT INTO companies(name) VALUES ('Accountant document settings') RETURNING id")).rows[0].id;
  const route = await vite.ssrLoadModule('/app/api/company-setup/route.ts');
  const patch = body => route.PATCH(new Request('https://app.test/api/company-setup', { method: 'PATCH', headers: { origin: 'https://app.test', 'content-type': 'application/json' }, body: JSON.stringify({ companyId: c, ...body }) }));
  try {
    globalThis.__transferTestUser = { id: 1, email: 'accountant@test', role: 'accountant', companyIds: [c] };
    const stamp = 'data:image/png;base64,aGVsbG8=';
    assert.equal((await patch({ bankName: 'Test Bank', bankIban: 'AE123', bankCurrency: 'AED', stampData: stamp })).status, 200);
    assert.equal((await patch({ name: 'Changed name' })).status, 403);
    assert.equal((await patch({ bankCurrency: 'INVALID' })).status, 400);
    globalThis.__transferTestUser.role = 'inventory';
    assert.equal((await patch({ bankName: 'Other Bank' })).status, 403);
    const saved = (await database.query('SELECT name,bank_name,stamp_data FROM companies WHERE id=$1', [c])).rows[0];
    assert.deepEqual(saved, { name: 'Accountant document settings', bank_name: 'Test Bank', stamp_data: stamp });
  } finally { delete globalThis.__transferTestUser; }
});

test('sales workspace enforces ownership, proforma handoff, private costs and administrator assignment', async () => {
  const c = (await database.query("INSERT INTO companies(name,bank_name,stamp_data) VALUES ('Sales scope test','PRIVATE BANK','PRIVATE STAMP') RETURNING id")).rows[0].id;
  const other = (await database.query("INSERT INTO companies(name) VALUES ('Sales other company') RETURNING id")).rows[0].id;
  const loc = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES($1,'SALESA','Sales inventory','SLS') RETURNING id", [c])).rows[0].id;
  const makeUser = async (name, company) => { const id = (await database.query("INSERT INTO app_users(full_name,email,password_hash,role) VALUES($1,$2,'test','sales') RETURNING id", [name, name+'@scope.test'])).rows[0].id; await database.query('INSERT INTO app_user_companies(user_id,company_id) VALUES($1,$2)', [id,company]); return id; };
  const alice = await makeUser('AliceScope', c), bob = await makeUser('BobScope', c), outsider = await makeUser('OutsideScope', other);
  const own = (await database.query("INSERT INTO contacts(company_id,type,name,company,phone,whatsapp,currency,balance,sales_owner_id) VALUES($1,'customer','ALPHA TECHNOLOGIES','ALPHA TECHNOLOGIES','+971500111111','+971500111111','AED',400,$2) RETURNING id", [c, alice])).rows[0].id;
  const foreign = (await database.query("INSERT INTO contacts(company_id,type,name,company,phone,whatsapp,currency,balance,sales_owner_id,trn) VALUES($1,'customer','OMEGA SYSTEMS','OMEGA SYSTEMS','+971500222222','+971500222222','AED',9900,$2,'100000000000099') RETURNING id", [c,bob])).rows[0].id;
  const item = (await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity,cost,sales_price,last_purchase_price) VALUES($1,$2,'SALES-SCOPE','Scope laptop',10,321,500,322) RETURNING id", [c,loc])).rows[0].id;
  const po = (await database.query("INSERT INTO transactions(company_id,location_id,number,type,party,transaction_date,currency,total,base_total) VALUES($1,$2,'PRIVATE-PO','purchase order','SECRET SUPPLIER','2026-10-04','AED',642,642) RETURNING id", [c,loc])).rows[0].id;
  await database.query("INSERT INTO transaction_lines(transaction_id,item_id,description,quantity,unit_price,subtotal,total) VALUES($1,$2,'Scope laptop',2,321,642,642)",[po,item]);
  const route = await vite.ssrLoadModule('/app/api/records/route.ts');
  const work = await vite.ssrLoadModule('/app/api/sales-work/route.ts');
  const attach = await vite.ssrLoadModule('/app/api/attachments/route.ts');
  const { salesRouteAllowed } = await vite.ssrLoadModule('/lib/sales-access.ts');
  const req = (path, method='GET', body) => new Request('https://app.test'+path, { method, headers: { origin:'https://app.test','content-type':'application/json' }, ...(body ? { body:JSON.stringify(body) } : {}) });
  const get = (kind, id='') => route.GET(req(`/api/records?companyId=${c}&locationId=${loc}&kind=${kind}${id ? '&id='+id : ''}`));
  const post = (body) => route.POST(req('/api/records','POST',{ kind:'transactions',companyId:c,locationId:loc,type:'quotation',number:'SCOPE-QUOTE',party:'ALPHA TECHNOLOGIES',transactionDate:'2026-10-04',currency:'AED',exchangeRate:1,account:'Accounts Receivable',lines:[{ itemId:item,description:'Scope laptop',quantity:1,unitPrice:500,vatCode:'ZERO' }],...body }));
  const asSales = id => { globalThis.__transferTestUser = { id,role:'sales',fullName:id===alice?'AliceScope':'BobScope',email:'sales@scope.test',companyIds:[c] }; };
  try {
    asSales(alice);
    assert.deepEqual((await (await get('contacts')).json()).records.map(row=>row.id),[own]);
    assert.equal((await get('vendor-history')).status,403);
    assert.equal((await get('transactions',po)).status,404);
    const stock = (await (await get('items')).json()).records[0];
    for (const key of ['cost','lastPurchasePrice','averageCost','preferredSupplierId']) assert.equal(key in stock,false);
    assert.equal((await post({ party:'OMEGA SYSTEMS' })).status,403);
    // Sales may create, view and print their own invoices, but never change them after saving.
    const invoiced = await post({ type:'invoice',number:'SCOPE-INV',salesman:'BobScope' }); assert.equal(invoiced.status,201,JSON.stringify(await invoiced.clone().json()));
    const invoice = (await invoiced.json()).record;
    assert.equal(invoice.salesman,'AliceScope'); assert.equal(invoice.createdByUserId,alice); assert.equal(Number(invoice.total),500);
    assert.equal((await get('transactions',invoice.id)).status,200);
    assert.equal((await route.PATCH(req('/api/records','PATCH',{kind:'transactions',companyId:c,id:invoice.id,memo:'change'}))).status,403);
    asSales(bob); assert.equal((await get('transactions',invoice.id)).status,404); asSales(alice);
    // Quotations, estimates, sales orders and proformas are handed to accountants: no view, print or PDF for sales.
    const quoted = await post({ salesman:'BobScope' }); assert.equal(quoted.status,201,JSON.stringify(await quoted.clone().json()));
    const quote = (await quoted.json()).record; assert.equal(quote.total,undefined); assert.equal(quote.status,'awaiting accountant');
    const savedQuote = (await database.query('SELECT salesman,created_by_user_id FROM transactions WHERE id=$1',[quote.id])).rows[0];
    assert.equal(savedQuote.salesman,'AliceScope'); assert.equal(savedQuote.created_by_user_id,alice);
    assert.equal((await get('transactions',quote.id)).status,404);
    const proformaResponse = await post({ type:'proforma invoice',number:'SCOPE-PRO' }); assert.equal(proformaResponse.status,201);
    const proforma = (await proformaResponse.json()).record; assert.equal(proforma.total,undefined);
    assert.equal((await get('transactions',proforma.id)).status,404);
    assert.equal((await route.PATCH(req('/api/records','PATCH',{kind:'transactions',companyId:c,id:proforma.id,memo:'try reopen'}))).status,403);
    assert.equal((await attach.GET(req(`/api/attachments?companyId=${c}&entityType=transaction&entityId=${proforma.id}`))).status,403);
    assert.equal((await attach.POST(req('/api/attachments','POST',{companyId:c,entityType:'transaction',entityId:proforma.id,attachments:[]}))).status,403);
    const day = await (await work.GET(req(`/api/sales-work?companyId=${c}`))).json();
    assert.deepEqual(day.customers.map(row=>row.balance),[900]); assert.equal(day.activity.find(row=>row.id===proforma.id).canOpen,false);
    assert.equal(day.activity.find(row=>row.id===quote.id).canOpen,false); assert.equal(day.activity.find(row=>row.id===invoice.id).canOpen,true);
    assert.equal(day.activity.find(row=>row.id===proforma.id).total,undefined);
    assert.equal((await work.GET(req(`/api/sales-work?companyId=${other}`))).status,403);
    assert.equal((await work.PATCH(req('/api/sales-work','PATCH',{companyId:c,customerId:foreign,salesOwnerId:alice}))).status,403);
    const overviewRoute = await vite.ssrLoadModule('/app/api/inventory-overview/route.ts');
    const incoming = await (await overviewRoute.GET(req('/api/inventory-overview'))).json();
    const stockRow = incoming.records.find(row=>row.id===item); assert.equal(stockRow.quantity,9); assert.equal(stockRow.salesPrice,500); assert.equal(incoming.canSelectItems,true); assert.equal(incoming.canBulkSelect,false);
    for(const key of ['cost','averageCost','lastPurchasePrice','preferredSupplierId']) assert.equal(key in stockRow,false);
    const incomingRow = incoming.activity.incoming.find(row=>row.itemId===item);
    assert.equal(incomingRow.quantity,2); assert.equal(incomingRow.price,500);
    for(const key of ['party','transactionId','documentNumber','linkedBillId','salesRep']) assert.equal(key in incomingRow,false);
    // Sales see New Arrival, Price Change and Just Sold too, without customer, supplier, document or purchase details.
    assert.deepEqual(incoming.activity.launched,[]); assert.ok(Array.isArray(incoming.activity.priceChanges));
    const soldRow = incoming.activity.sold.find(row=>row.itemId===item);
    assert.equal(soldRow.quantity,1); assert.equal(soldRow.price,500); assert.equal(soldRow.salesRep,'AliceScope'); assert.ok(soldRow.date);
    for(const key of ['party','transactionId','documentNumber','linkedBillId']) assert.equal(key in soldRow,false);
    const setupRoute = await vite.ssrLoadModule('/app/api/company-setup/route.ts');
    const setup = await (await setupRoute.GET(req(`/api/company-setup?companyId=${c}`))).json(); assert.equal(setup.record.bankName,'');assert.equal(setup.record.stampData,'');
    const spacesRoute = await vite.ssrLoadModule('/app/api/workspaces/route.ts');
    const spaces = await (await spacesRoute.GET(req('/api/workspaces'))).json(); assert.equal(spaces.companies[0].bankName,undefined); assert.equal(spaces.companies[0].locations[0].payable,undefined);
    for(const path of ['/api/reports','/api/warranty-slips','/api/serial-search','/api/transfers','/api/packing-lists','/api/stock-pricing','/api/stock-revaluation','/api/account-history','/api/employee-loan-links','/api/company-setup/letterhead']) assert.equal(salesRouteAllowed(path,'GET'),false,path);
    assert.equal(salesRouteAllowed('/api/payment-terms','POST'),false);
    // Duplicate validation sees customers owned by another sales user.
    const customerBody = {kind:'contacts',type:'customer',name:'OMEGA SYSTEMZ',company:'OMEGA SYSTEMZ',phone:'+971500333333',whatsapp:'+971500333333',country:'UAE',reseller:'Reseller',planet:'No',currency:'AED'};
    assert.equal((await post(customerBody)).status,409);
    assert.equal((await post({...customerBody,name:'UNIQUE WHOLESALE',company:'UNIQUE WHOLESALE',phone:'+971 500 222 222'})).status,409);
    assert.equal((await post({...customerBody,name:'UNIQUE WHOLESALE',company:'UNIQUE WHOLESALE',trn:'100000000000099'})).status,409);
    const freshResponse = await post({...customerBody,name:'ZEBRA WHOLESALE',company:'ZEBRA WHOLESALE',balance:999,salesOwnerId:bob}); assert.equal(freshResponse.status,201,JSON.stringify(await freshResponse.clone().json()));
    const fresh=(await freshResponse.json()).record;assert.equal(fresh.salesOwnerId,alice);assert.equal(fresh.balance,0);
    assert.equal((await route.PATCH(req('/api/records','PATCH',{kind:'contacts',companyId:c,id:foreign,name:'take over'}))).status,403);
    globalThis.__transferTestUser={id:alice,role:'admin',companyIds:[c]};
    assert.equal((await work.PATCH(req('/api/sales-work','PATCH',{companyId:c,customerId:foreign,salesOwnerId:outsider,expectedOwnerId:bob}))).status,400);
    assert.equal((await work.PATCH(req('/api/sales-work','PATCH',{companyId:c,customerId:foreign,salesOwnerId:alice,expectedOwnerId:bob}))).status,200);
    assert.equal((await work.PATCH(req('/api/sales-work','PATCH',{companyId:c,customerId:foreign,salesOwnerId:bob,expectedOwnerId:bob}))).status,409);
    globalThis.__transferTestUser={id:alice,role:'accountant',companyIds:[c]};
    assert.equal((await get('transactions',proforma.id)).status,200);
    // Only the sales invoice moves stock and posts to the ledger; handoff documents do not.
    assert.equal(Number((await database.query('SELECT quantity FROM items WHERE id=$1',[item])).rows[0].quantity),9);
    assert.equal(Number((await database.query('SELECT count(*) FROM journal_entries WHERE company_id=$1 AND transaction_id IS DISTINCT FROM $2',[c,invoice.id])).rows[0].count),0);
  } finally { delete globalThis.__transferTestUser; }
});

test('customer duplicate comparison includes exactly 70 percent and normalized phone/TRN identities', async () => {
  const { customerNameSimilarity, customerConflict } = await vite.ssrLoadModule('/lib/customer-identity.ts');
  assert.equal(customerNameSimilarity('abcdefghij','abcdefgXYZ'),0.7);
  assert.ok(customerNameSimilarity('abcdefghij','abcdefWXYZ')<0.7);
  assert.equal(customerNameSimilarity('Com-Net L.L.C.','COMNET LLC'),1);
  assert.equal(customerNameSimilarity('',''),0);
  const candidate={name:'abcdefghij',company:'abcdefghij',phone:'+971501111111',whatsapp:'+971501111111',trn:''};
  assert.match(customerConflict(candidate,[{id:1,...candidate,name:'abcdefgXYZ',company:'abcdefgXYZ',phone:'',whatsapp:''}]),/70%/);
  assert.equal(customerConflict(candidate,[{id:1,...candidate}],1),null);
});

test('sales ownership migration supports individual prepared statements and retry', async () => {
  const migration = await readFile(`${root}drizzle/0079_sales_ownership.sql`,'utf8');
  for(let run=0;run<2;run++) for(const statement of migration.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean)) await database.query(statement);
});

test('invoice inventory-only returns increase stock without customer charges and reconcile edits and deletion', async () => {
  const c = (await database.query("INSERT INTO companies(name) VALUES ('Stock only invoice') RETURNING id")).rows[0].id;
  const loc = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES($1,'RETINV','Return inventory','RET') RETURNING id", [c])).rows[0].id;
  const item = (await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity,cost) VALUES($1,$2,'RETSTOCK','Returned laptop',10,40) RETURNING id", [c,loc])).rows[0].id;
  const service = (await database.query("INSERT INTO items(company_id,location_id,sku,name,item_type) VALUES($1,$2,'RETSERVICE','Service','service') RETURNING id", [c,loc])).rows[0].id;
  const inactive = (await database.query("INSERT INTO items(company_id,location_id,sku,name,status) VALUES($1,$2,'RETINACTIVE','Inactive','inactive') RETURNING id", [c,loc])).rows[0].id;
  const otherLoc = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES($1,'RETOTHER','Other inventory','RO') RETURNING id", [c])).rows[0].id;
  const foreign = (await database.query("INSERT INTO items(company_id,location_id,sku,name) VALUES($1,$2,'RETFOREIGN','Wrong inventory') RETURNING id", [c,otherLoc])).rows[0].id;
  await database.query("INSERT INTO contacts(company_id,type,name,currency) VALUES($1,'customer','Return customer','USD')", [c]);
  const route = await vite.ssrLoadModule('/app/api/records/route.ts');
  const req = (method, body) => new Request('https://app.test/api/records', { method, headers: { origin:'https://app.test','content-type':'application/json' }, body:JSON.stringify({kind:'transactions',companyId:c,locationId:loc,...body}) });
  const returnLine = {itemId:item,description:'Inventory return',quantity:-1,unitPrice:0,unitCost:99999,vatCode:'STANDARD',vatRate:5};
  const base = {type:'invoice',number:'RETURN-1',party:'Return customer',transactionDate:'2026-10-04',currency:'USD',exchangeRate:2,account:'Sales Revenue',lines:[returnLine]};
  const create = body => route.POST(req('POST',{...base,...body}));
  const stock = async () => Number((await database.query('SELECT quantity FROM items WHERE id=$1',[item])).rows[0].quantity);
  for (const badLine of [{...returnLine,unitPrice:10},{...returnLine,quantity:0},{...returnLine,itemId:null},{...returnLine,itemId:service},{...returnLine,itemId:foreign}]) {
    const response=await create({lines:[badLine]}); assert.equal(response.status,400,JSON.stringify(await response.clone().json()));
  }
  assert.equal((await create({lines:[{...returnLine,itemId:inactive}]})).status,409);
  assert.equal((await create({type:'quotation'})).status,400);
  assert.equal((await create({sourceTransactionId:999999})).status,400,'source conversion cannot silently discard a submitted return');
  assert.equal(await stock(),10);
  const charged={itemId:item,description:'Customer charged laptop',quantity:2,unitPrice:100,unitCost:20,vatCode:'STANDARD'};
  const free={...charged,description:'Free internal unit',quantity:1,unitPrice:0};
  let response;
  try {
    globalThis.__transferTestUser={id:1,role:'inventory',companyIds:[c]};
    assert.equal((await create({})).status,403);
    globalThis.__transferTestUser={id:1,role:'accountant',companyIds:[c]};
    response=await create({lines:[charged,free,returnLine]});
    assert.equal(response.status,201,JSON.stringify(await response.clone().json()));
  } finally {delete globalThis.__transferTestUser;}
  const {record}=await response.json();
  const read = async () => (await (await route.GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${c}&id=${record.id}`))).json());
  let detail=await read();
  assert.equal(detail.record.total,210); assert.equal(detail.record.vatAmount,10); assert.equal(detail.record.baseTotal,420);
  assert.equal(await stock(),8);
  let returned=detail.lines.find(line=>line.quantity<0);
  assert.equal(returned.unitPrice,0); assert.equal(returned.vatAmount,0); assert.equal(returned.vatRate,0); assert.equal(returned.vatCode,'ZERO'); assert.equal(returned.unitCost,20,'current home cost converted to invoice currency; supplied cost ignored');
  const customerBalance=async()=>Number((await database.query("SELECT balance FROM contacts WHERE company_id=$1 AND type='customer'",[c])).rows[0].balance);
  const ledger=async expectedCogs=>{
    const journal=(await database.query('SELECT jl.* FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id WHERE je.transaction_id=$1',[record.id])).rows;
    assert.ok(journal.length>0); assert.ok(journal.every(line=>Number(line.debit)>=0&&Number(line.credit)>=0));
    assert.equal(Math.round(journal.reduce((sum,line)=>sum+Number(line.debit)-Number(line.credit),0)*100),0);
    assert.equal(journal.filter(line=>line.account_name==='Cost of Goods Sold').reduce((sum,line)=>sum+Number(line.debit)-Number(line.credit),0),expectedCogs);
    assert.equal(await customerBalance(),210);
  };
  await ledger(80);
  const {customerInvoiceLines,inventoryInvoiceLines}=await vite.ssrLoadModule('/lib/invoice-stock-lines.ts');
  assert.deepEqual(customerInvoiceLines(detail.lines).map(line=>line.description),['Customer charged laptop']);
  assert.match(inventoryInvoiceLines(detail.lines).find(line=>line.quantity<0).description,/STOCK RETURN \(\+1 to inventory\)/);
  assert.equal(customerInvoiceLines([{quantity:1,unitPrice:10,unitCost:0}]).length,1,'zero purchase cost does not hide a charged line');
  const packing=await vite.ssrLoadModule('/app/api/packing-lists/route.ts');
  const packingData=await (await packing.GET(new Request(`https://app.test/api/packing-lists?companyId=${c}&invoiceId=${record.id}`))).json();
  assert.equal(packingData.lines.length,2); assert.ok(packingData.lines.every(line=>line.id!==returned.id));
  const pack=await packing.POST(new Request('https://app.test/api/packing-lists',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({companyId:c,invoiceId:record.id,packingDate:'2026-10-04',lines:[{invoiceLineId:returned.id,packedQuantity:1,cartonNumber:'1'}]})}));
  assert.equal(pack.status,409,JSON.stringify(await pack.clone().json()));
  const edit=body=>route.PATCH(req('PATCH',{locationId:undefined,id:record.id,editMode:'details',revision:detail.revision,number:record.number,transactionDate:record.transactionDate,...body}));
  assert.equal((await edit({lineDetails:[{id:detail.lines.find(line=>line.unitPrice>0).id,quantity:-1,unitPrice:0}]})).status,400);
  const oldRevision=detail.revision;
  response=await edit({appendLines:[returnLine]}); assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  assert.equal(await stock(),9); detail=await read(); await ledger(40);
  assert.equal((await edit({revision:oldRevision,appendLines:[returnLine]})).status,409);
  returned=detail.lines.find(line=>line.quantity<0);
  response=await edit({lineDetails:[{id:returned.id,quantity:-3}]}); assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  assert.equal(await stock(),11); detail=await read(); await ledger(-40);
  await database.query('UPDATE items SET quantity=0 WHERE id=$1',[item]);
  assert.equal((await edit({lineDetails:[{id:returned.id,quantity:-1}]})).status,409,'cannot remove consumed returned stock');
  const remove=()=>route.DELETE(req('DELETE',{id:record.id,deletionReason:'Remove test invoice'}));
  assert.equal((await remove()).status,409,'cannot delete a net incoming invoice after its returned stock is consumed');
  await database.query('UPDATE items SET quantity=11 WHERE id=$1',[item]);
  response=await remove(); assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  assert.equal(await stock(),10); assert.equal(await customerBalance(),0);
  response=await create({number:'RETURN-ONLY'}); assert.equal(response.status,201,JSON.stringify(await response.clone().json()));
  assert.equal((await response.json()).record.total,0); assert.equal(await stock(),11); assert.equal(await customerBalance(),0);
});

test('posted journal register includes older rows, inclusive dates and unique company account links', async () => {
  const c=(await database.query("INSERT INTO companies(name) VALUES ('Journal register scope') RETURNING id")).rows[0].id;
  const loc=(await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES($1,'JREG','Journal register','JREG') RETURNING id",[c])).rows[0].id;
  const accts=(await database.query("INSERT INTO accounts(company_id,code,name,type,currency) VALUES($1,'REG1','Register Bank','Bank','AED'),($1,'REG2','Register Bank','Bank','USD'),($1,'REG3','Register Equity','Equity','AED'),($1,'REG4','Ambiguous','Expense','AED'),($1,'REG5','Ambiguous','Expense','AED') RETURNING *",[c])).rows;
  await database.query("INSERT INTO journal_entries(company_id,location_id,entry_date,reference,description,posted,currency) SELECT $1,$2,'2026-09-01','SAME-REF','Older posting ' || n,true,'AED' FROM generate_series(1,305) n",[c,loc]);
  const old=(await database.query('SELECT id FROM journal_entries WHERE company_id=$1 ORDER BY id',[c])).rows;
  for(const entry of old) await database.query("INSERT INTO journal_lines(journal_entry_id,account_name,debit,credit) VALUES($1,'Register Bank',10,0),($1,'Register Equity',0,10)",[entry.id]);
  const newest=(await database.query("INSERT INTO journal_entries(company_id,location_id,entry_date,reference,description,posted,currency) VALUES($1,$2,'2026-10-04','USD-REF','Foreign transfer',true,'USD') RETURNING id",[c,loc])).rows[0].id;
  await database.query("INSERT INTO journal_lines(journal_entry_id,account_name,debit,credit) VALUES($1,'Register Bank',100,0),($1,'Ambiguous',0,50),($1,'Missing legacy account',0,50)",[newest]);
  await database.query("INSERT INTO journal_entries(company_id,location_id,entry_date,reference,description,posted) VALUES($1,$2,'2026-10-04','UNPOSTED','Not posted',false),($1,NULL,'2026-10-04','COMPANY-WIDE','No inventory',true)",[c,loc]);
  await database.query("INSERT INTO audit_log(company_id,entity_type,entity_id,action,details) VALUES($1,'journal_entry',$2,'created','{}'),($1,'journal_entry',$2,'created','{}')",[c,old[0].id]);
  const route=await vite.ssrLoadModule('/app/api/journal-entries/route.ts');
  const get=(extra='')=>route.GET(new Request(`https://app.test/api/journal-entries?companyId=${c}&locationId=${loc}${extra}`));
  const allResponse=await get();assert.equal(allResponse.status,200);assert.match(allResponse.headers.get('cache-control'),/no-store/);
  const all=(await allResponse.json()).entries;
  assert.equal(all.length,306,'no 300-entry cutoff, duplicate audit rows, unposted entries or foreign inventory rows');
  assert.equal(new Set(all.map(e=>e.id)).size,306);assert.equal(all[0].id,newest);
  assert.equal(all.find(e=>e.id===old[0].id).source,'Manual');
  const date=(await (await get('&dateFrom=2026-09-01&dateTo=2026-09-01')).json()).entries;
  assert.equal(date.length,305); assert.equal(date[0].lines.find(l=>l.accountName==='Register Bank').accountId,accts[0].id);
  const fx=(await (await get('&dateFrom=2026-10-04&dateTo=2026-10-04')).json()).entries;
  assert.equal(fx.length,1);assert.equal(fx[0].lines[0].accountId,accts[1].id);assert.equal(fx[0].lines[1].accountId,null);assert.equal(fx[0].lines[2].accountId,null);
  assert.equal(fx[0].debit,100);assert.equal(fx[0].credit,100);
  for(const query of ['&dateFrom=2026-02-30','&dateTo=bad','&dateFrom=2026-10-05&dateTo=2026-10-04']) assert.equal((await get(query)).status,400);
  try {
    globalThis.__transferTestUser={id:1,role:'admin',companyIds:[999999]};assert.equal((await get()).status,403);
    globalThis.__transferTestUser={id:1,role:'accountant',companyIds:[c]};
    const authorized=(await (await get()).json()).entries;assert.equal(authorized.length,306);assert.ok(authorized.every(e=>!e.canManage));
  } finally {delete globalThis.__transferTestUser;}
  const {filterJournals,journalTotals,journalReport,journalReportSummary,emptyJournalFilters}=await vite.ssrLoadModule('/lib/journal-register.ts');
  assert.equal(filterJournals(all,{...emptyJournalFilters,query:'reg2'},'AED').length,1);
  assert.equal(filterJournals(all,{...emptyJournalFilters,query:'older posting 305'},'AED').length,1);
  assert.equal(filterJournals(all,{...emptyJournalFilters,source:'Manual'},'AED').length,1);
  const matched=filterJournals(all,{...emptyJournalFilters,account:String(accts[0].id)},'AED');
  assert.equal(matched.length,305);assert.equal(matched[0].lines.length,2,'account filter retains complete journals');
  assert.deepEqual(journalTotals(matched),{count:305,debit:3050,credit:3050,unbalanced:0});
  const summary=journalReport(all,'AED','','',emptyJournalFilters), detail=journalReport(all,'AED','','',emptyJournalFilters,true);
  assert.equal(summary.rows.length,306);assert.equal(detail.rows.length,613);
  assert.deepEqual(journalReportSummary(summary).cards,journalReportSummary(detail).cards);
  assert.equal(journalReportSummary(summary).cards[0].value,306,'same references do not collapse legitimate journals');
  assert.equal(summary.accountLinkIssues.length,2);
});

test('vendor contacts save validated supplier bank details', async () => {
  const company = (await database.query("INSERT INTO companies(name) VALUES('Vendor bank test') RETURNING id")).rows[0].id;
  const api = await vite.ssrLoadModule('/app/api/records/route.ts');
  const write = (method, values) => api[method](new Request('https://app.test/api/records', {method, headers: {'content-type':'application/json'}, body: JSON.stringify({kind:'contacts',companyId:company,...values})}));
  try {
    globalThis.__transferTestUser = {id:1,role:'all_admin',companyIds:[]};
    const created = await write('POST', {type:'vendor',name:'Bank Supplier',company:'Bank Supplier',currency:'AED',phone:'+971500020002',whatsapp:'',country:'United Arab Emirates',reseller:'Reseller',planet:'No',bankName:' Mashreq ',bankAccountName:'Bank Supplier LLC',bankAccountNumber:'0191',bankIban:'ae070330000010191',bankSwift:'boml aead'});
    const vendor = (await created.json()).record; assert.equal(created.status,201);
    assert.deepEqual([vendor.bankName,vendor.bankAccountName,vendor.bankAccountNumber,vendor.bankIban,vendor.bankSwift],['Mashreq','Bank Supplier LLC','0191','AE070330000010191','BOML AEAD']);
    const updated = await write('PATCH', {id:vendor.id,name:'Bank Supplier',bankIban:'ae99'});
    assert.equal(updated.status,200,await updated.clone().text()); assert.equal((await updated.json()).record.bankIban,'AE99');
    assert.equal((await database.query('SELECT bank_name FROM contacts WHERE id=$1',[vendor.id])).rows[0].bank_name,'Mashreq'); // untouched fields stay
    assert.equal((await write('PATCH', {id:vendor.id,name:'Bank Supplier',bankSwift:'X'.repeat(41)})).status,400);
    const { vendorBankLines } = await vite.ssrLoadModule('/lib/vendor-bank.ts');
    assert.deepEqual(vendorBankLines({bankName:'Mashreq',bankIban:'AE99'}),['Mashreq','IBAN: AE99']);
  } finally { delete globalThis.__transferTestUser; }
});

test('customer and vendor sub-accounts persist organization, protect scope and preserve balances', async () => {
  const company = (await database.query("INSERT INTO companies(name) VALUES('Contact organization test') RETURNING id")).rows[0].id;
  const otherCompany = (await database.query("INSERT INTO companies(name) VALUES('Other contact organization') RETURNING id")).rows[0].id;
  const api = await vite.ssrLoadModule('/app/api/records/route.ts');
  const write = (method, values) => api[method](new Request('https://app.test/api/records', {method, headers: {'content-type':'application/json'}, body: JSON.stringify({kind:'contacts',companyId:company,...values})}));
  const add = async (type, name, extra = {}) => {
    const response = await write('POST', {type,name,company:name,currency:'AED',phone: '+971500010001',whatsapp:type === 'customer' ? '+971500010001' : '',country:'United Arab Emirates',reseller:'Reseller',planet:'No',...extra});
    const body = await response.json(); assert.equal(response.status,201,JSON.stringify(body)); return body.record;
  };
  try {
    globalThis.__transferTestUser = {id:1,role:'all_admin',companyIds:[]};
    const parent = await add('vendor','Parent Supplier');
    const child = await add('vendor','Branch Supplier',{parentContactId:parent.id,balance:350});
    assert.equal(child.parentContactId,parent.id);
    const customer = await add('customer','Distinct Buyer');
    assert.equal((await write('PATCH',{id:child.id,parentContactId:customer.id})).status,400);
    assert.equal((await write('PATCH',{id:parent.id,parentContactId:child.id})).status,400);
    assert.equal((await write('PATCH',{id:child.id,parentContactId:child.id})).status,400);
    assert.equal((await write('PATCH',{id:child.id,parentContactId:'invalid'})).status,400);
    const foreign = (await database.query("INSERT INTO contacts(company_id,type,name) VALUES($1,'vendor','Foreign Parent') RETURNING id",[otherCompany])).rows[0].id;
    assert.equal((await write('PATCH',{id:child.id,parentContactId:foreign})).status,400);
    assert.equal((await write('PATCH',{id:parent.id,status:'inactive'})).status,400);
    const response = await write('PATCH',{id:child.id,status:'inactive'});
    assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
    const saved = (await response.json()).record;
    assert.equal(saved.balance,350);assert.equal(saved.ledgerAccountId,child.ledgerAccountId);assert.equal(saved.parentContactId,parent.id);
    const location = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES($1,'CONTACT','Contact inventory','CON') RETURNING id",[company])).rows[0].id;
    const blocked = await write('POST',{kind:'transactions',type:'purchase order',locationId:location,party:child.name,number:'INACTIVE-PO',transactionDate:'2026-10-05',currency:'AED',exchangeRate:1,lines:[{description:'Service',quantity:1,unitPrice:10,vatCode:'ZERO'}]});
    assert.equal(blocked.status,409,JSON.stringify(await blocked.clone().json()));
    assert.match((await blocked.json()).error,/inactive/);
    assert.equal((await database.query('SELECT count(*)::int AS count FROM transactions WHERE company_id=$1',[company])).rows[0].count,0);
    const inactiveChild = await add('vendor','Dormant Branch',{parentContactId:parent.id,status:'inactive'});
    assert.equal(inactiveChild.status,'inactive');assert.equal(inactiveChild.parentContactId,parent.id);

    assert.equal((await write('PATCH',{id:child.id,status:'active'})).status,200);
    const customerParent = (await database.query("INSERT INTO contacts(company_id,type,name,company,phone,whatsapp) VALUES($1,'customer','Remote Business','Remote Business','+971500020002','+971500020002') RETURNING id",[company])).rows[0].id;
    assert.equal((await write('PATCH',{id:customer.id,parentContactId:customerParent,status:'inactive'})).status,200);
    const list = await api.GET(new Request(`https://app.test/api/records?kind=contacts&companyId=${company}`));
    const rows = (await list.json()).records;
    assert.equal(rows.find(row=>row.id===child.id).parentContactName,'Parent Supplier');
    assert.equal(rows.find(row=>row.id===customer.id).parentContactName,'Remote Business');
    assert.equal((await write('DELETE',{id:parent.id,deletionReason:'Test parent protection'})).status,409);
    assert.equal((await write('PATCH',{id:child.id,parentContactId:''})).status,200);
    assert.equal((await write('PATCH',{id:child.id,editMode:'contact-status',expectedStatus:'active',status:'inactive'})).status,200);
    assert.equal((await write('PATCH',{id:child.id,editMode:'contact-status',expectedStatus:'active',status:'active'})).status,409);
    assert.equal((await write('PATCH',{id:child.id,editMode:'contact-status',expectedStatus:'inactive',status:'active',balance:0})).status,400);
    assert.equal((await database.query('SELECT balance FROM contacts WHERE id=$1',[child.id])).rows[0].balance,350);

    globalThis.__transferTestUser = {id:1,role:'viewer',companyIds:[company]};
    assert.equal((await write('PATCH',{id:child.id,status:'inactive'})).status,403);
  } finally {delete globalThis.__transferTestUser;}
});

test('invoice Pending Cart splits drafts atomically and reverses posted stock, VAT, balances and ledger', async () => {
  const c = (await database.query("INSERT INTO companies(name) VALUES ('Line Pending Cart') RETURNING id")).rows[0].id;
  const loc = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES($1,'LCART','Cart inventory','LC') RETURNING id", [c])).rows[0].id;
  const item = (await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity,cost) VALUES($1,$2,'LCART1','Cart stock',20,40) RETURNING id", [c, loc])).rows[0].id;
  await database.query("INSERT INTO contacts(company_id,type,name,currency) VALUES($1,'customer','Cart Customer','AED')", [c]);
  const route = await vite.ssrLoadModule('/app/api/records/route.ts');
  const base = { kind: 'transactions', companyId: c, locationId: loc, type: 'invoice', number: 'LC-1', party: 'Cart Customer', transactionDate: '2026-10-05', dueDate: '2026-11-05', terms: 'Net 30', salesman: '', memo: 'Cart test', currency: 'AED', exchangeRate: 1, account: 'Accounts Receivable', status: 'open' };
  const call = (method, body) => route[method](new Request('https://app.test/api/records', { method, headers: { origin: 'https://app.test', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const line = { itemId: item, description: 'Cart stock', quantity: 2, unitPrice: 100, unitCost: 40, vatCode: 'STANDARD', comments: 'Keep me', serialNumber: 'CART-SERIAL' };
  const stock = async () => (await database.query('SELECT quantity FROM items WHERE id=$1', [item])).rows[0].quantity;
  const balance = async () => (await database.query('SELECT balance FROM contacts WHERE company_id=$1', [c])).rows[0].balance;
  const detail = async id => (await route.GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${c}&id=${id}`))).json();
  const count = async () => (await database.query('SELECT count(*)::int AS n FROM transactions WHERE company_id=$1', [c])).rows[0].n;
  let response = await call('POST', { ...base, lines: [line, { ...line, quantity: 3, pending: true }] });
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const { record: invoice, pendingRecord: pending } = await response.json();
  assert.equal(pending.number, 'PEND-0001');
  assert.equal(invoice.total, 210); assert.equal(pending.total, 315);
  assert.equal(await stock(), 18); assert.equal(await balance(), 210);
  const pendingDetail = await detail(pending.id);
  assert.equal(pendingDetail.lines[0].comments, line.comments); assert.equal(pendingDetail.lines[0].serialNumber, line.serialNumber);
  assert.equal((await database.query('SELECT count(*)::int AS n FROM journal_entries WHERE transaction_id=$1', [pending.id])).rows[0].n, 0);
  const before = await count();
  response = await call('POST', { ...base, lines: [{ ...line, quantity: 999 }, { ...line, pending: true }] });
  assert.equal(response.status, 409); assert.equal(await count(), before, 'failed invoice must roll back its new pending cart');
  assert.equal(await stock(), 18);
  let saved = await detail(invoice.id);
  const editBody = { kind: 'transactions', companyId: c, id: invoice.id, editMode: 'details', revision: saved.revision, number: invoice.number, transactionDate: base.transactionDate, dueDate: base.dueDate, terms: base.terms, salesman: '', memo: base.memo, lineDetails: [{ id: saved.lines[0].id, pending: true }] };
  response = await call('PATCH', { ...editBody, appendLines: [{ ...line, quantity: 1 }] });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const moved = await response.json();
  assert.equal(moved.record.total, 105); assert.equal(moved.pendingRecord.total, 210);
  assert.equal(moved.pendingRecord.number, 'PEND-0002');
  assert.equal(await stock(), 19); assert.equal(await balance(), 105);
  saved = await detail(invoice.id); assert.equal(saved.lines.length, 1); assert.equal(saved.lines[0].quantity, 1);
  assert.equal((await call('PATCH', editBody)).status, 409, 'stale retry cannot move a line twice');
  const journal = (await database.query('SELECT SUM(debit) AS debit,SUM(credit) AS credit FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE transaction_id=$1)', [invoice.id])).rows[0];
  assert.equal(journal.debit, journal.credit);
  const ar = (await database.query("SELECT SUM(debit-credit) AS amount FROM journal_lines WHERE account_name IN (SELECT name FROM accounts WHERE company_id=$2 AND system_role='AR') AND journal_entry_id IN (SELECT id FROM journal_entries WHERE transaction_id=$1)", [invoice.id,c])).rows[0];
  assert.equal(ar.amount, 105);
  const finalMove = { ...editBody, revision: saved.revision, lineDetails: [{ id: saved.lines[0].id, pending: true }] };
  const paymentId = (await database.query("INSERT INTO transactions(company_id,location_id,type,number,party,transaction_date,total) VALUES($1,$2,'customer payment','LC-PAY','Cart Customer','2026-10-05',50) RETURNING id", [c,loc])).rows[0].id;
  await database.query('INSERT INTO invoice_payment_allocations(payment_id,invoice_id,amount) VALUES($1,$2,50)', [paymentId,invoice.id]);
  assert.equal((await call('PATCH', finalMove)).status,409,'cannot reduce total below allocated payments');
  assert.equal(await stock(),19); assert.equal(await balance(),105);
  await database.query('DELETE FROM transactions WHERE id=$1',[paymentId]);
  const pack = (await database.query("INSERT INTO packing_lists(company_id,invoice_id,number,packing_date) VALUES($1,$2,'LC-PACK','2026-10-05') RETURNING id",[c,invoice.id])).rows[0].id;
  await database.query("INSERT INTO packing_list_lines(packing_list_id,invoice_line_id,description,packed_quantity,units_per_carton,carton_count) VALUES($1,$2,'Packed cart',1,1,1)",[pack,saved.lines[0].id]);
  assert.equal((await call('PATCH',finalMove)).status,409,'packed line must stay attached');
  await database.query('DELETE FROM packing_lists WHERE id=$1',[pack]);
  const countBeforeFailure = await count();
  response = await call('PATCH',{...finalMove,appendLines:[{...line,itemId:99999999,pending:true}]});
  assert.equal(response.ok,false); assert.equal(await stock(),19); assert.equal(await balance(),105);
  assert.equal(await count(),countBeforeFailure,'invalid pending line rolls back posted reversal');
  assert.equal((await detail(invoice.id)).lines.length,1);
  try {
    globalThis.__transferTestUser = {id:1,role:'viewer',companyIds:[c]};
    assert.equal((await call('PATCH',finalMove)).status,403);
    assert.equal((await call('POST',{...base,lines:[{...line,pending:true}]})).status,403);
    globalThis.__transferTestUser = {id:1,role:'admin',companyIds:[c+999]};
    assert.equal((await call('PATCH',finalMove)).status,403);
  } finally { delete globalThis.__transferTestUser; }
  response = await call('PATCH', { ...editBody, revision: saved.revision, lineDetails: [{ id: saved.lines[0].id, pending: true }] });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal((await response.json()).record.status, 'cancelled');
  assert.equal(await stock(), 20); assert.equal(await balance(), 0);
  response = await call('POST', { ...base, number: 'LC-ALL', lines: [{ ...line, pending: true }] });
  assert.equal(response.status, 201); assert.equal((await response.json()).record.type, 'pending invoice'); assert.equal(await stock(), 20);
  response = await call('POST', { ...base, number: 'LC-NEG', lines: [{ ...line, quantity: -1, unitPrice: 0, pending: true }] });
  assert.equal(response.status, 400);
  response = await call('POST', { ...base, number: 'LC-CONVERT', sourceTransactionId: pending.id });
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const converted = (await response.json()).record;
  const convertedDetail = await detail(converted.id);
  assert.equal(convertedDetail.lines[0].serialNumber, line.serialNumber);
  assert.equal((await call('PATCH', { ...editBody, id: converted.id, number: converted.number, revision: convertedDetail.revision, lineDetails: [{ id: convertedDetail.lines[0].id, pending: true }] })).status, 409);
});

test('custom invoice series previews and issues exact formats with duplicate, stale and company protections', async () => {
  const { formatInvoiceNumber, invoiceSeriesError, invoiceSeriesRevision } = await vite.ssrLoadModule('/lib/invoice-series.ts');
  assert.equal(formatInvoiceNumber(7,{invoicePrefix:'MAIN',nextInvoiceNumber:1}), 'C007-MAIN-INV-0001');
  assert.equal(formatInvoiceNumber(7,{invoicePrefix:'',nextInvoiceNumber:12345,invoiceNumberFormat:'INV/{NUMBER}/A',invoiceNumberPadding:2}), 'INV/12345/A');
  for (const format of ['INV', '{NUMBER}-{NUMBER}', '{UNKNOWN}-{NUMBER}', '<script>{NUMBER}']) assert.ok(invoiceSeriesError(7,{invoicePrefix:'MAIN',nextInvoiceNumber:1,invoiceNumberFormat:format}));
  assert.ok(invoiceSeriesError(7,{invoicePrefix:'MAIN',nextInvoiceNumber:0}));
  assert.ok(invoiceSeriesError(7,{invoicePrefix:'MAIN',nextInvoiceNumber:1,invoiceNumberPadding:13}));
  const c = (await database.query("INSERT INTO companies(name) VALUES ('Custom series company') RETURNING id")).rows[0].id;
  const loc = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES($1,'SERIES','Series inventory','MAIN') RETURNING id",[c])).rows[0].id;
  const otherLoc = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES($1,'OTHER','Other inventory','OTHER') RETURNING id",[c])).rows[0].id;
  await database.query("INSERT INTO contacts(company_id,type,name,currency) VALUES($1,'customer','Series Customer','AED')",[c]);
  const workspace = await vite.ssrLoadModule('/app/api/workspaces/route.ts');
  const records = await vite.ssrLoadModule('/app/api/records/route.ts');
  const request = (method,body) => new Request('https://app.test/api/records',{method,headers:{origin:'https://app.test','content-type':'application/json'},body:JSON.stringify(body)});
  const patch = body => workspace.PATCH(request('PATCH',{type:'invoiceSeries',companyId:c,locationId:loc,...body}));
  const series = {invoicePrefix:'',invoiceNumberFormat:'COMNET/2026/{NUMBER}/A',invoiceNumberPadding:5,nextInvoiceNumber:28};
  let response = await patch(series);
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  let result = await response.json(); assert.equal(result.preview,'COMNET/2026/00028/A');
  const savedSeries = result.location;
  const post = body => records.POST(request('POST',{kind:'transactions',companyId:c,locationId:loc,type:'invoice',party:'Series Customer',transactionDate:'2026-10-05',currency:'AED',exchangeRate:1,account:'Accounts Receivable',lines:[{description:'Service',quantity:1,unitPrice:100,vatCode:'ZERO'}],...body}));
  response = await post({}); assert.equal(response.status,201,JSON.stringify(await response.clone().json()));
  const first = (await response.json()).record; assert.equal(first.number,result.preview);
  response = await patch({...series,expectedSeries:invoiceSeriesRevision(savedSeries)}); assert.equal(response.status,409,'an invoice issued while editing must invalidate the preview');
  response = await patch(series); assert.equal(response.status,409,'cannot reset to a used number');
  response = await patch({...series,nextInvoiceNumber:29,invoiceNumberFormat:'{NUMBER}',invoiceNumberPadding:1}); assert.equal(response.status,200);
  response = await post({}); assert.equal(response.status,201); assert.equal((await response.json()).record.number,'29');
  assert.equal((await database.query('SELECT number FROM transactions WHERE id=$1',[first.id])).rows[0].number,'COMNET/2026/00028/A','old invoices remain unchanged');
  const other = (await database.query('SELECT invoice_number_format,next_invoice_number FROM inventory_locations WHERE id=$1',[otherLoc])).rows[0];
  assert.equal(other.next_invoice_number,1); assert.equal(other.invoice_number_format,'C{COMPANY}-{PREFIX}-INV-{NUMBER}');
  // A later collision also fails safely without consuming the counter or posting money.
  await database.query("INSERT INTO transactions(company_id,location_id,type,number,party,transaction_date) VALUES($1,$2,'invoice','30','Series Customer','2026-10-05')",[c,loc]);
  response = await post({}); assert.equal(response.status,409);
  assert.equal((await database.query('SELECT next_invoice_number FROM inventory_locations WHERE id=$1',[loc])).rows[0].next_invoice_number,30);
  assert.equal((await database.query('SELECT balance FROM contacts WHERE company_id=$1',[c])).rows[0].balance,200);
  response = await patch({...series,invoiceNumberFormat:'{NUMBER}-{BAD}',nextInvoiceNumber:31}); assert.equal(response.status,400);
  try {
    globalThis.__transferTestUser={id:1,role:'accountant',companyIds:[c]}; assert.equal((await patch({...series,nextInvoiceNumber:31})).status,403);
    globalThis.__transferTestUser={id:1,role:'admin',companyIds:[c+999]}; assert.equal((await patch({...series,nextInvoiceNumber:31})).status,403);
  } finally { delete globalThis.__transferTestUser; }
  assert.equal((await database.query("SELECT count(*)::int AS n FROM audit_log WHERE company_id=$1 AND entity_type='invoice-series'",[c])).rows[0].n,2);
  for (const statement of (await readFile(`${root}drizzle/0083_custom_invoice_series.sql`,'utf8')).split('--> statement-breakpoint')) await database.exec(statement);
  assert.equal((await database.query('SELECT invoice_number_format FROM inventory_locations WHERE id=$1',[loc])).rows[0].invoice_number_format,'{NUMBER}','migration retry preserves customization');
});

test('Insights entry-day activity uses UAE boundaries, complete pagination and server-side role/company scope', async () => {
  const company = (await database.query("INSERT INTO companies(name) VALUES ('Insights test') RETURNING id")).rows[0].id;
  const other = (await database.query("INSERT INTO companies(name) VALUES ('Insights other') RETURNING id")).rows[0].id;
  const location = async c => (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES($1,'INS','Insights stock','INS') RETURNING id", [c])).rows[0].id;
  const loc = await location(company), otherLoc = await location(other);
  const user = (await database.query("INSERT INTO app_users(full_name,email,password_hash,role) VALUES('Insights Rep','insights@tests.test','test','sales') RETURNING id")).rows[0].id;
  await database.query("INSERT INTO contacts(company_id,type,name,sales_owner_id) VALUES($1,'customer','Insights customer',$2)", [company,user]);
  const { GET } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const insert = async (number, type, createdAt, companyId = company, locationId = loc, creator = user, party = 'Insights customer') => (await database.query("INSERT INTO transactions(company_id,location_id,number,type,party,transaction_date,created_at,created_by_user_id,total) VALUES($1,$2,$3,$4,$5,'2020-01-01',$6,$7,100) RETURNING id", [companyId,locationId,number,type,party,createdAt,creator])).rows[0].id;
  const get = (params = {}) => GET(new Request('https://app.test/api/records?' + new URLSearchParams({ kind:'transactions',companyId:String(company),enteredDate:'2026-01-10',...params })));
  try {
    const start = await insert('START','invoice','2026-01-09T20:00:00Z');
    const end = await insert('END','invoice','2026-01-10T19:59:59.999Z');
    await insert('BEFORE','invoice','2026-01-09T19:59:59.999Z');
    await insert('AFTER','invoice','2026-01-10T20:00:00Z');
    await insert('FOREIGN','invoice','2026-01-10T10:00:00Z',other,otherLoc);
    for(let i=0;i<53;i++) await insert(`PAGE-${i}`,'invoice','2026-01-10T10:00:00Z');
    globalThis.__transferTestUser = { id:user,role:'admin',companyIds:[company] };
    const response = await get(); assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    const first = await response.json(), second = await (await get({page:'2'})).json();
    assert.equal(first.total,55); assert.equal(first.records.length,50); assert.equal(second.records.length,5);
    const ids = [...first.records,...second.records].map(row=>row.id);
    assert.equal(new Set(ids).size,55); assert.equal(ids[0],end); assert.equal(ids.at(-1),start);
    assert.equal(first.records[0].transactionDate,'2020-01-01');
    assert.equal(first.records[0].enteredBy,'Insights Rep');
    assert.equal((await get({companyId:String(other)})).status,403);
    assert.equal((await get({locationId:String(otherLoc)})).status,403);
    for(const enteredDate of ['','2026-02-30','bad']) assert.equal((await get({enteredDate})).status,400);
    for(const page of ['0','1.5','no']) assert.equal((await get({page})).status,400);
    await insert('PENDING','pending invoice','2026-01-10T10:00:00Z');
    await insert('PO','purchase order','2026-01-10T10:00:00Z');
    await insert('BILL','bill','2026-01-10T10:00:00Z');
    const quote = await insert('OWN-QUOTE','quotation','2026-01-10T10:00:00Z');
    const notOwner = await insert('NOT-OWNER','invoice','2026-01-10T10:00:00Z',company,loc,user,'Unassigned customer');
    const notCreator = await insert('NOT-CREATOR','invoice','2026-01-10T10:00:00Z',company,loc,null);
    globalThis.__transferTestUser.role='sales';
    const salesFirst = await (await get()).json(), salesSecond = await (await get({page:'2'})).json();
    const salesIds = [...salesFirst.records,...salesSecond.records].map(row=>row.id);
    assert.equal(salesFirst.total,55); assert.ok(salesIds.includes(end));
    for (const hidden of [quote,notOwner,notCreator]) assert.ok(!salesIds.includes(hidden));
    globalThis.__transferTestUser.role='purchasing';
    const purchasing = await (await get()).json(); assert.equal(purchasing.total,2); assert.deepEqual(new Set(purchasing.records.map(row=>row.type)),new Set(['purchase order','bill']));
    globalThis.__transferTestUser.role='inventory';
    const inventory = await (await get()).json(); assert.equal(inventory.total,59); assert.ok(inventory.records.every(row=>['invoice','purchase order','bill'].includes(row.type)));
    globalThis.__transferTestUser.role='viewer';
    const viewer = await (await get({page:'2'})).json(); assert.equal(viewer.total,60); assert.ok(viewer.records.every(row=>row.type!=='pending invoice'));
    globalThis.__transferTestUser.role='accountant'; assert.equal((await (await get()).json()).total,61);
    globalThis.__transferTestUser.role='customization'; assert.equal((await get()).status,403);
    globalThis.__transferTestUser.role='all_admin'; assert.equal((await (await get({companyId:String(other)})).json()).total,1);
  } finally { delete globalThis.__transferTestUser; }
});

test('bills entered from a PO keep the chosen reference, sales rep and one VAT code', async () => {
  const companyId = (await database.query("INSERT INTO companies (name) VALUES ('PO bill details') RETURNING id")).rows[0].id;
  const locationId = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES ($1,'PBD','PBD','PBD') RETURNING id",[companyId])).rows[0].id;
  const itemId = (await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity,cost) VALUES ($1,$2,'PBD','Monitor',0,20) RETURNING id",[companyId,locationId])).rows[0].id;
  const { POST } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const request = (body) => new Request('https://app.test/api/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const base = {kind:'transactions',companyId,locationId,party:'Detail vendor',currency:'AED',exchangeRate:1,transactionDate:'2026-10-06'};
  const po = (await (await POST(request({...base,type:'purchase order',number:'PO-PBD',salesman:'PO rep',lines:[{itemId,description:'Monitor',quantity:10,unitPrice:100,unitCost:100,vatCode:'ZERO'}]}))).json()).record;
  const order = await database.query('SELECT id FROM transaction_lines WHERE transaction_id=$1',[po.id]);
  const bad = await POST(request({...base,type:'bill',purchaseOrderId:po.id,number:'SUP-1',vatCode:'NOT_A_CODE',lines:[{orderLineId:order.rows[0].id,quantity:2}]}));
  assert.equal(bad.status,400);
  const saved = await POST(request({...base,type:'bill',purchaseOrderId:po.id,number:'SUP-INV-77',salesman:'Bill rep',vatCode:'STANDARD',lines:[{orderLineId:order.rows[0].id,quantity:2}]}));
  assert.equal(saved.status,201,JSON.stringify(await saved.clone().json()));
  const { record } = await saved.json();
  assert.equal(record.number,'SUP-INV-77'); assert.equal(record.salesman,'Bill rep'); assert.equal(record.vatAmount,10); assert.equal(record.total,210);
  const lines = await database.query('SELECT vat_code FROM transaction_lines WHERE transaction_id=$1 AND NOT is_freight_charge',[record.id]);
  assert.deepEqual(lines.rows.map((row) => row.vat_code),['STANDARD']);
  const fallback = await POST(request({...base,type:'bill',purchaseOrderId:po.id,number:'SUP-INV-78',lines:[{orderLineId:order.rows[0].id,quantity:1}]}));
  assert.equal(fallback.status,201); const plain = (await fallback.json()).record;
  assert.equal(plain.salesman,'PO rep'); assert.equal(plain.vatAmount,0);
});

test('layout builder saves only the validated layout and hides it from sales users', async () => {
  const companyId=(await database.query("INSERT INTO companies (name, phone) VALUES ('Layout company', '+971 4 000') RETURNING id")).rows[0].id;
  const {GET,PATCH}=await vite.ssrLoadModule('/app/api/company-setup/route.ts');
  const {defaultLayout}=await vite.ssrLoadModule('/lib/layout/defaults.ts');
  const patch=(body)=>PATCH(new Request('https://app.test/api/company-setup',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({companyId,...body})}));
  const layout=defaultLayout('invoice');layout.enabled=true;layout.name='Branch layout';
  const saved=await patch({documentLayout:JSON.stringify(layout)});assert.equal(saved.status,200,JSON.stringify(await saved.clone().json()));
  const record=(await saved.json()).record;assert.equal(JSON.parse(record.documentLayout).layouts.Invoice.name,'Branch layout');assert.equal(record.phone,'+971 4 000');
  assert.equal((await patch({documentLayout:JSON.stringify({...layout,rows:[]})})).status,400);
  assert.equal((await patch({documentLayout:'{"version":1}'})).status,400);
  assert.equal(JSON.parse((await (await GET(new Request(`https://app.test/api/company-setup?companyId=${companyId}`))).json()).record.documentLayout).layouts.Invoice.name,'Branch layout');
  const quote={...layout,name:'Quote layout'};
  const both=await patch({documentLayout:JSON.stringify({version:3,layouts:{Invoice:layout,Quotation:quote}})});assert.equal(both.status,200);assert.deepEqual(Object.keys(JSON.parse((await both.json()).record.documentLayout).layouts),['Invoice','Quotation']);
  assert.equal((await patch({documentLayout:JSON.stringify({version:3,layouts:{Brochure:layout}})})).status,400);
  try { globalThis.__transferTestUser={id:7,role:'sales',companyIds:[companyId]};
    const sales=await GET(new Request(`https://app.test/api/company-setup?companyId=${companyId}`));
    if (sales.status===200) assert.equal((await sales.json()).record.documentLayout,'');
    assert.notEqual((await patch({documentLayout:JSON.stringify(layout)})).status,200);
  } finally { delete globalThis.__transferTestUser; }
});

test('company bank accounts by currency are validated, saved by accountants and hidden from sales', async () => {
  const companyId=(await database.query("INSERT INTO companies (name) VALUES ('Bank currency company') RETURNING id")).rows[0].id;
  const {GET,PATCH}=await vite.ssrLoadModule('/app/api/company-setup/route.ts');
  const patch=(body)=>PATCH(new Request('https://app.test/api/company-setup',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({companyId,...body})}));
  const usd={id:'usd',currency:'usd',bankName:'Mashreq',accountName:'Co',accountNumber:'1',iban:'ae01',swift:'boml'};
  try { globalThis.__transferTestUser={id:9,role:'accountant',companyIds:[companyId]};
    assert.equal((await patch({bankAccounts:JSON.stringify([usd,{...usd,id:'usd2'}])})).status,200,'two accounts in one currency are allowed');
    assert.equal((await patch({bankAccounts:JSON.stringify([{...usd,primary:true},{...usd,id:'usd2',primary:true}])})).status,400,'only one may print per currency');
    assert.equal((await patch({bankAccounts:JSON.stringify([{...usd,currency:'XX'}])})).status,400);
    const saved=await patch({bankAccounts:JSON.stringify([usd])});assert.equal(saved.status,200,JSON.stringify(await saved.clone().json()));
    assert.deepEqual(JSON.parse((await saved.json()).record.bankAccounts),[{id:'usd',currency:'USD',bankName:'Mashreq',accountName:'Co',accountNumber:'1',iban:'AE01',swift:'BOML'}]);
    // The accountant settings screen saves the default bank stamp and per-currency stamps in one request.
    const stamp='data:image/png;base64,QUJD';
    const stamped=await patch({bankName:'ENBD',bankCurrency:'AED',bankStampData:stamp,bankAccounts:JSON.stringify([{...usd,stampData:stamp}])});
    assert.equal(stamped.status,200,JSON.stringify(await stamped.clone().json()));
    const stampedRecord=(await stamped.json()).record;assert.equal(stampedRecord.bankStampData,stamp);assert.equal(JSON.parse(stampedRecord.bankAccounts)[0].stampData,stamp);
    assert.equal((await patch({bankStampData:'data:image/svg+xml;base64,PHN2Zz4='})).status,400);
    globalThis.__transferTestUser={id:7,role:'sales',companyIds:[companyId]};
    const sales=await GET(new Request(`https://app.test/api/company-setup?companyId=${companyId}`));
    if (sales.status===200) { const salesRecord=(await sales.json()).record; assert.equal(salesRecord.bankAccounts,''); assert.equal(salesRecord.bankStampData,''); }
  } finally { delete globalThis.__transferTestUser; }
});

test('administrators can save bank accounts on their own without the rest of Company Setup', async () => {
  const companyId=(await database.query("INSERT INTO companies (name, phone) VALUES ('Bank save company', '+971 4 111') RETURNING id")).rows[0].id;
  const {PATCH}=await vite.ssrLoadModule('/app/api/company-setup/route.ts');
  const patch=(body)=>PATCH(new Request('https://app.test/api/company-setup',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({companyId,...body})}));
  const saved=await patch({bankName:'ENBD',bankCurrency:'AED',bankAccounts:JSON.stringify([{id:'eur',currency:'EUR',bankName:'BNP',accountName:'',accountNumber:'9',iban:'',swift:''}])});
  assert.equal(saved.status,200,JSON.stringify(await saved.clone().json()));
  const record=(await saved.json()).record;assert.equal(record.bankName,'ENBD');assert.equal(JSON.parse(record.bankAccounts)[0].currency,'EUR');assert.equal(record.phone,'+971 4 111');
  assert.equal((await patch({})).status,400);
});

test('stamp positions save per document type on their own and reject invalid placements', async () => {
  const companyId=(await database.query("INSERT INTO companies (name, phone) VALUES ('Stamp position company', '+971 4 222') RETURNING id")).rows[0].id;
  const {PATCH}=await vite.ssrLoadModule('/app/api/company-setup/route.ts');
  const patch=(body)=>PATCH(new Request('https://app.test/api/company-setup',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({companyId,...body})}));
  const positions={'tax-invoice':{company:{show:true,left:150,top:4},bank:{show:true,left:20,top:6}}};
  const saved=await patch({stampPositions:JSON.stringify(positions)});
  assert.equal(saved.status,200,JSON.stringify(await saved.clone().json()));
  const record=(await saved.json()).record;assert.deepEqual(JSON.parse(record.stampPositions),positions);assert.equal(record.phone,'+971 4 222');
  assert.equal((await patch({stampPositions:JSON.stringify({'tax-invoice':{company:{show:true,left:-5,top:0}}})})).status,400);
  assert.equal((await patch({stampPositions:JSON.stringify({'Bad Type':{}})})).status,400);
});

test('cargo list: every user can add, only the creator or an admin edits, only admins delete', async () => {
  const company = (await database.query("INSERT INTO companies(name) VALUES('Cargo list test') RETURNING id")).rows[0].id;
  const [sales, other] = (await database.query("INSERT INTO app_users(full_name,email,password_hash,role) VALUES('Cargo Sales',$1,'x','sales'),('Cargo Viewer',$2,'x','viewer') RETURNING id", [`cargo-sales-${company}@example.test`, `cargo-viewer-${company}@example.test`])).rows.map((row) => row.id);
  const api = await vite.ssrLoadModule('/app/api/cargos/route.ts');
  const call = (method, body, query = '') => api[method](new Request(`https://app.test/api/cargos${query}`, { method, headers: { 'content-type': 'application/json', origin: 'https://app.test', host: 'app.test' }, ...(body ? { body: JSON.stringify({ companyId: company, ...body }) } : {}) }));
  try {
    globalThis.__transferTestUser = { id: sales, role: 'sales', fullName: 'Cargo Sales', companyIds: [company] };
    const created = await call('POST', { name: 'Fast Phoenix Cargo', telephone: '+97145470420', mobile: '+971504658431', email: 'jeena@fastphoenix.ae', modes: ['Air', 'Sea'], destinations: ['Zambia', 'Malawi'], address: 'Ras Al Khor' });
    assert.equal(created.status, 201, await created.clone().text());
    const cargo = (await created.json()).record;
    assert.deepEqual([cargo.modes, cargo.destinations, cargo.createdByName], [['Air', 'Sea'], ['Zambia', 'Malawi'], 'Cargo Sales']);
    assert.equal((await call('POST', { name: '', email: 'x' })).status, 400);
    assert.equal((await call('POST', { name: 'Bad mode', modes: ['Rocket'] })).status, 400);
    const list = await (await call('GET', null, `?companyId=${company}`)).json();
    assert.equal(list.records.length, 1); assert.equal(list.canDelete, false);
    globalThis.__transferTestUser = { id: other, role: 'viewer', fullName: 'Cargo Viewer', companyIds: [company] };
    assert.equal((await call('PATCH', { id: cargo.id, name: 'Taken over' })).status, 403);
    assert.equal((await call('DELETE', null, `?companyId=${company}&id=${cargo.id}`)).status, 403);
    globalThis.__transferTestUser = { id: 1, role: 'all_admin', fullName: 'Admin', companyIds: [] };
    const edited = await call('PATCH', { id: cargo.id, name: 'Fast Phoenix Cargo Services LLC', modes: ['Air'] });
    assert.equal(edited.status, 200); assert.equal((await edited.json()).record.name, 'Fast Phoenix Cargo Services LLC');
    assert.equal((await call('DELETE', null, `?companyId=${company}&id=${cargo.id}`)).status, 200);
  } finally { delete globalThis.__transferTestUser; }
});

test('duplicated items start with no stock or cost and the list shows the purchase average cost', async () => {
  const { GET, POST } = await vite.ssrLoadModule('/app/api/records/route.ts');
  const companyId = (await database.query("INSERT INTO companies (name) VALUES ('Duplicate cost test') RETURNING id")).rows[0].id;
  const locationId = (await database.query("INSERT INTO inventory_locations (company_id, code, name, invoice_prefix) VALUES ($1, 'DUP', 'Duplicate', 'DUP') RETURNING id", [companyId])).rows[0].id;
  const sourceId = (await database.query("INSERT INTO items (company_id, location_id, sku, name, quantity, cost) VALUES ($1, $2, 'DUP-SRC', 'DELL ALIENWARE 16', 100, 4220.5) RETURNING id", [companyId, locationId])).rows[0].id;
  const response = await POST(new Request('https://app.test/api/records', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'items', companyId, locationId, duplicateOfItemId: sourceId, itemType: 'stock-part', name: 'MSI VECTOR 16', quantity: 100, cost: 4220.5, salesPrice: 0 }) }));
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const copy = (await response.json()).record;
  assert.equal(copy.quantity, 0); assert.equal(copy.cost, 0);
  // Its own bill at 8,000 sets the average cost the list shows, whatever the saved cost field holds.
  await database.query("UPDATE items SET cost=4220.5 WHERE id=$1", [copy.id]);
  const billId = (await database.query("INSERT INTO transactions (company_id, location_id, type, number, party, total, subtotal, transaction_date, status) VALUES ($1, $2, 'bill', 'DUP-BILL', 'Supplier', 800000, 800000, '2026-10-09', 'open') RETURNING id", [companyId, locationId])).rows[0].id;
  await database.query("INSERT INTO transaction_lines (transaction_id, item_id, description, quantity, unit_price) VALUES ($1, $2, 'MSI VECTOR 16', 100, 8000)", [billId, copy.id]);
  const listed = (await (await GET(new Request(`https://app.test/api/records?kind=items&companyId=${companyId}&locationId=${locationId}`))).json()).records;
  assert.equal(listed.find((item) => item.id === copy.id).averageCost, 8000);
  assert.equal(listed.find((item) => item.id === sourceId).averageCost, 4220.5);
});

test("warehouses: every inventory gets a default warehouse that holds the remainder; switching the default moves no stock", async () => {
  const company = (await database.query("INSERT INTO companies (name) VALUES ('Warehouse test') RETURNING id")).rows[0].id;
  const location = (await database.query("INSERT INTO inventory_locations (company_id, code, name, invoice_prefix) VALUES ($1, 'WH', 'WH', 'WH') RETURNING id", [company])).rows[0].id;
  const defaults = (await database.query("SELECT id, code, is_default FROM warehouses WHERE location_id = $1", [location])).rows;
  assert.equal(defaults.length, 1, "new inventories get one default warehouse from the trigger");
  assert.equal(defaults[0].is_default, true);
  const mainId = defaults[0].id;
  const itemA = (await database.query("INSERT INTO items (company_id, location_id, sku, name, quantity) VALUES ($1, $2, 'WH-A', 'A', 10) RETURNING id", [company, location])).rows[0].id;
  await database.query("INSERT INTO items (company_id, location_id, sku, name, quantity) VALUES ($1, $2, 'WH-B', 'B', 4)", [company, location]);
  const route = await vite.ssrLoadModule("/app/api/warehouses/route.ts");
  const call = (method, body) => route[method](new Request("https://app.test/api/warehouses", { method, headers: { "content-type": "application/json", origin: "https://app.test" }, body: JSON.stringify({ companyId: company, ...body }) }));
  const list = async () => (await (await route.GET(new Request(`https://app.test/api/warehouses?companyId=${company}&locationId=${location}`))).json()).warehouses;

  assert.deepEqual((await list()).map((row) => [row.code, row.isDefault, row.quantity, row.itemCount]), [["MAIN", true, 14, 2]]);
  const created = await call("POST", { locationId: location, name: "Jebel Ali store", code: "jafza" });
  assert.equal(created.status, 201, await created.clone().text());
  const store = (await created.json()).warehouse;
  assert.equal(store.code, "JAFZA");
  assert.equal((await call("POST", { locationId: location, name: "jebel ali STORE", code: "X1" })).status, 409, "duplicate names are rejected");
  assert.equal((await call("POST", { locationId: location, name: "Bad", code: "no spaces" })).status, 400);

  // Explicit stock in the new warehouse comes out of the default warehouse's remainder; the inventory total is unchanged.
  await database.query("INSERT INTO warehouse_stock (company_id, warehouse_id, item_id, quantity) VALUES ($1, $2, $3, 6)", [company, store.id, itemA]);
  assert.deepEqual((await list()).map((row) => [row.code, row.quantity]), [["MAIN", 8], ["JAFZA", 6]]);
  assert.equal((await call("PATCH", { id: store.id, action: "deactivate" })).status, 409, "a warehouse with stock stays active");
  assert.equal((await call("DELETE", { id: store.id })).status, 409);
  assert.equal((await call("PATCH", { id: mainId, action: "deactivate" })).status, 409, "the default warehouse cannot be deactivated");
  assert.equal((await call("PATCH", { id: store.id, action: "update", name: "Jebel Ali", code: "JA" })).status, 200);

  // Switching the default keeps every warehouse's quantity: the old default's remainder becomes explicit.
  assert.equal((await call("PATCH", { id: store.id, action: "setDefault" })).status, 200);
  assert.deepEqual((await list()).map((row) => [row.code, row.isDefault, row.quantity]), [["JA", true, 6], ["MAIN", false, 8]]);
  assert.equal((await database.query("SELECT count(*)::int AS count FROM warehouse_stock WHERE warehouse_id = $1", [store.id])).rows[0].count, 0, "the default warehouse keeps no explicit rows");
  assert.equal((await database.query("SELECT sum(quantity)::float AS total FROM items WHERE location_id = $1", [location])).rows[0].total, 14);

  // A warehouse without stock can be deactivated and removed.
  const empty = (await (await call("POST", { locationId: location, name: "Overflow", code: "OVF" })).json()).warehouse;
  assert.equal((await call("PATCH", { id: empty.id, action: "deactivate" })).status, 200);
  assert.equal((await call("DELETE", { id: empty.id })).status, 200);
  assert.equal((await database.query("SELECT count(*)::int AS count FROM audit_log WHERE entity_type = 'warehouse' AND company_id = $1", [company])).rows[0].count >= 6, true);
});

test("warehouses: stock documents post to their warehouse, shortages are checked per warehouse, and voids/deletes return stock there", async () => {
  const companyId = (await database.query("INSERT INTO companies(name) VALUES ('Warehouse posting') RETURNING id")).rows[0].id;
  const locationId = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES ($1,'WHP','WHP','WHP') RETURNING id", [companyId])).rows[0].id;
  const otherLocation = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES ($1,'WHO','WHO','WHO') RETURNING id", [companyId])).rows[0].id;
  const itemId = (await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity,cost,item_type) VALUES ($1,$2,'WHP-1','Laptop',10,40,'stock-part') RETURNING id", [companyId, locationId])).rows[0].id;
  await database.query("INSERT INTO contacts(company_id,type,name,currency,status) VALUES ($1,'customer','WH Customer','AED','active'),($1,'vendor','WH Vendor','AED','active')", [companyId]);
  const mainId = (await database.query("SELECT id FROM warehouses WHERE location_id=$1 AND is_default", [locationId])).rows[0].id;
  const store = (await database.query("INSERT INTO warehouses(company_id,location_id,code,name) VALUES ($1,$2,'STORE','Store') RETURNING id", [companyId, locationId])).rows[0].id;
  const closed = (await database.query("INSERT INTO warehouses(company_id,location_id,code,name,active) VALUES ($1,$2,'OLD','Old',false) RETURNING id", [companyId, locationId])).rows[0].id;
  const foreignWarehouse = (await database.query("SELECT id FROM warehouses WHERE location_id=$1", [otherLocation])).rows[0].id;
  const { POST, DELETE } = await vite.ssrLoadModule("/app/api/records/route.ts");
  const req = (method, body) => new Request("https://app.test/api/records", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const base = { kind: "transactions", companyId, locationId, currency: "AED", exchangeRate: 1, transactionDate: "2026-10-12", dueDate: "2026-10-12" };
  const bill = (quantity, warehouseId, number) => POST(req("POST", { ...base, type: "bill", number, party: "WH Vendor", account: "Accounts Payable", ...(warehouseId ? { warehouseId } : {}), lines: [{ itemId, description: "Laptop", quantity, unitPrice: 40, unitCost: 40, vatCode: "ZERO" }] }));
  const invoice = (quantity, warehouseId, number) => POST(req("POST", { ...base, type: "invoice", number, party: "WH Customer", account: "Sales Revenue", ...(warehouseId ? { warehouseId } : {}), lines: [{ itemId, description: "Laptop", quantity, unitPrice: 100, unitCost: 40, vatCode: "ZERO" }] }));
  const remove = (id) => DELETE(req("DELETE", { deletionReason: "Warehouse test", kind: "transactions", companyId, id }));
  const total = async () => Number((await database.query("SELECT quantity FROM items WHERE id=$1", [itemId])).rows[0].quantity);
  const inStore = async () => Number((await database.query("SELECT COALESCE(SUM(quantity),0) AS q FROM warehouse_stock WHERE warehouse_id=$1 AND item_id=$2", [store, itemId])).rows[0].q);
  const inMain = async () => (await total()) - (await inStore());

  assert.equal((await bill(1, closed, "WH-B0")).status, 400, "inactive warehouses are rejected");
  assert.equal((await bill(1, foreignWarehouse, "WH-B0")).status, 400, "another inventory's warehouse is rejected");

  const received = await bill(5, store, "WH-B1");
  assert.equal(received.status, 201, await received.clone().text());
  const billRecord = (await received.json()).record;
  assert.equal(billRecord.warehouseId, store);
  assert.deepEqual([await total(), await inStore(), await inMain()], [15, 5, 10]);
  assert.equal((await database.query("SELECT warehouse_id FROM inventory_movements WHERE transaction_id=$1", [billRecord.id])).rows[0].warehouse_id, store);

  const tooMuchMain = await invoice(12, null, "WH-I0");
  assert.equal(tooMuchMain.status, 409, "the default warehouse only has 10");
  const tooMuchStore = await invoice(6, store, "WH-I0");
  assert.equal(tooMuchStore.status, 409);
  assert.match((await tooMuchStore.json()).error, /available in Store 5/);

  const fromStore = await invoice(4, store, "WH-I1");
  assert.equal(fromStore.status, 201, await fromStore.clone().text());
  const storeInvoice = (await fromStore.json()).record;
  assert.deepEqual([await total(), await inStore(), await inMain()], [11, 1, 10]);
  const fromMain = await invoice(3, null, "WH-I2");
  assert.equal(fromMain.status, 201, await fromMain.clone().text());
  assert.equal((await fromMain.json()).record.warehouseId, mainId, "documents without a warehouse use the default");
  assert.deepEqual([await total(), await inStore(), await inMain()], [8, 1, 7]);

  // The bill's 5 units went into Store, which now has 1: deleting the bill would take Store negative.
  assert.equal((await remove(billRecord.id)).status, 409);
  // Voiding the Store invoice brings its 4 units back to Store, not to the default warehouse.
  assert.equal((await remove(storeInvoice.id)).status, 200);
  assert.deepEqual([await total(), await inStore(), await inMain()], [12, 5, 7]);
  assert.equal((await remove(billRecord.id)).status, 200);
  assert.deepEqual([await total(), await inStore(), await inMain()], [7, 0, 7]);

  const route = await vite.ssrLoadModule("/app/api/warehouses/route.ts");
  const removeWarehouse = await route.DELETE(new Request("https://app.test/api/warehouses", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyId, id: store }) }));
  assert.equal(removeWarehouse.status, 409, "a warehouse used by documents or stock history cannot be removed");
});

test("warehouses: bill edits keep or move their warehouse and invoice edits take stock from the invoice's warehouse", async () => {
  const companyId = (await database.query("INSERT INTO companies(name) VALUES ('Warehouse edits') RETURNING id")).rows[0].id;
  const locationId = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES ($1,'WHE','WHE','WHE') RETURNING id", [companyId])).rows[0].id;
  const itemId = (await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity,cost,item_type) VALUES ($1,$2,'WHE-1','Laptop',10,40,'stock-part') RETURNING id", [companyId, locationId])).rows[0].id;
  await database.query("INSERT INTO contacts(company_id,type,name,currency,status) VALUES ($1,'customer','WHE Customer','AED','active'),($1,'vendor','WHE Vendor','AED','active')", [companyId]);
  const mainId = (await database.query("SELECT id FROM warehouses WHERE location_id=$1 AND is_default", [locationId])).rows[0].id;
  const store = (await database.query("INSERT INTO warehouses(company_id,location_id,code,name) VALUES ($1,$2,'STORE','Store') RETURNING id", [companyId, locationId])).rows[0].id;
  const { GET, POST, PATCH } = await vite.ssrLoadModule("/app/api/records/route.ts");
  const req = (method, body) => new Request("https://app.test/api/records", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const revision = async (id) => (await (await GET(new Request(`https://app.test/api/records?kind=transactions&companyId=${companyId}&id=${id}`))).json());
  const total = async () => Number((await database.query("SELECT quantity FROM items WHERE id=$1", [itemId])).rows[0].quantity);
  const inStore = async () => Number((await database.query("SELECT COALESCE(SUM(quantity),0) AS q FROM warehouse_stock WHERE warehouse_id=$1 AND item_id=$2", [store, itemId])).rows[0].q);
  const billBody = { kind: "transactions", companyId, locationId, type: "bill", number: "WHE-B1", party: "WHE Vendor", transactionDate: "2026-10-12", account: "Accounts Payable", status: "open", currency: "AED", exchangeRate: 1, lines: [{ itemId, description: "Laptop", quantity: 5, unitPrice: 40, unitCost: 40, vatCode: "ZERO" }] };
  const created = await POST(req("POST", { ...billBody, warehouseId: store }));
  assert.equal(created.status, 201, await created.clone().text());
  const billId = (await created.json()).record.id;
  assert.deepEqual([await total(), await inStore()], [15, 5]);

  let edited = await PATCH(req("PATCH", { ...billBody, id: billId, revision: (await revision(billId)).revision, lines: [{ ...billBody.lines[0], quantity: 3 }] }));
  assert.equal(edited.status, 200, await edited.clone().text());
  assert.equal((await edited.json()).record.warehouseId, store, "an edit without a warehouse keeps the bill's warehouse");
  assert.deepEqual([await total(), await inStore()], [13, 3]);
  edited = await PATCH(req("PATCH", { ...billBody, id: billId, revision: (await revision(billId)).revision, warehouseId: mainId, lines: [{ ...billBody.lines[0], quantity: 3 }] }));
  assert.equal(edited.status, 200, await edited.clone().text());
  assert.deepEqual([await total(), await inStore()], [13, 0], "moving the bill to the default warehouse moves its stock out of Store");

  assert.equal((await POST(req("POST", { ...billBody, number: "WHE-B2", warehouseId: store, lines: [{ ...billBody.lines[0], quantity: 4 }] }))).status, 201);
  const sold = await POST(req("POST", { kind: "transactions", companyId, locationId, type: "invoice", number: "WHE-I1", party: "WHE Customer", transactionDate: "2026-10-12", dueDate: "2026-10-12", currency: "AED", exchangeRate: 1, account: "Sales Revenue", warehouseId: store, lines: [{ itemId, description: "Laptop", quantity: 2, unitPrice: 100, unitCost: 40, vatCode: "ZERO" }] }));
  assert.equal(sold.status, 201, await sold.clone().text());
  const invoiceId = (await sold.json()).record.id;
  assert.deepEqual([await total(), await inStore()], [15, 2]);
  const details = async (quantity) => {
    const detail = await revision(invoiceId);
    const line = detail.lines[0];
    return PATCH(req("PATCH", { kind: "transactions", companyId, id: invoiceId, editMode: "details", revision: detail.revision, number: "WHE-I1", transactionDate: "2026-10-12", dueDate: "2026-10-12", lineDetails: [{ id: line.id, description: line.description, quantity, unitPrice: line.unitPrice, vatCode: line.vatCode, comments: "", serialNumber: "" }] }));
  };
  const more = await details(3);
  assert.equal(more.status, 200, await more.clone().text());
  assert.deepEqual([await total(), await inStore()], [14, 1]);
  assert.equal((await details(5)).status, 409, "Store has 1 left, so 2 more cannot come from it");
  assert.deepEqual([await total(), await inStore()], [14, 1]);
  assert.equal((await database.query("SELECT count(*)::int AS n FROM inventory_movements WHERE transaction_id=$1 AND warehouse_id=$2", [invoiceId, store])).rows[0].n, 2);
});

test("warehouses: moves between warehouses shift warehouse stock only, can be reversed, and items show a per-warehouse breakdown", async () => {
  const companyId = (await database.query("INSERT INTO companies(name) VALUES ('Warehouse moves') RETURNING id")).rows[0].id;
  const locationId = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES ($1,'WHM','WHM','WHM') RETURNING id", [companyId])).rows[0].id;
  const single = (await database.query("INSERT INTO inventory_locations(company_id,code,name,invoice_prefix) VALUES ($1,'WHS','WHS','WHS') RETURNING id", [companyId])).rows[0].id;
  const itemId = (await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity,cost,item_type) VALUES ($1,$2,'WHM-1','Laptop',10,40,'stock-part') RETURNING id", [companyId, locationId])).rows[0].id;
  await database.query("INSERT INTO items(company_id,location_id,sku,name,quantity,cost,item_type) VALUES ($1,$2,'WHS-1','Mouse',3,5,'stock-part')", [companyId, single]);
  const mainId = (await database.query("SELECT id FROM warehouses WHERE location_id=$1 AND is_default", [locationId])).rows[0].id;
  const store = (await database.query("INSERT INTO warehouses(company_id,location_id,code,name) VALUES ($1,$2,'STORE','Store') RETURNING id", [companyId, locationId])).rows[0].id;
  const route = await vite.ssrLoadModule("/app/api/warehouse-transfers/route.ts");
  const records = await vite.ssrLoadModule("/app/api/records/route.ts");
  const call = (method, body) => route[method](new Request("https://app.test/api/warehouse-transfers", { method, headers: { "content-type": "application/json", origin: "https://app.test" }, body: JSON.stringify({ companyId, ...body }) }));
  const total = async () => Number((await database.query("SELECT quantity FROM items WHERE id=$1", [itemId])).rows[0].quantity);
  const inStore = async () => Number((await database.query("SELECT COALESCE(SUM(quantity),0) AS q FROM warehouse_stock WHERE warehouse_id=$1 AND item_id=$2", [store, itemId])).rows[0].q);

  assert.equal((await call("POST", { locationId, fromWarehouseId: mainId, toWarehouseId: mainId, lines: [{ itemId, quantity: 1 }] })).status, 400);
  assert.equal((await call("POST", { locationId, fromWarehouseId: mainId, toWarehouseId: store, lines: [{ itemId, quantity: 11 }] })).status, 409, "the default warehouse only has 10");
  const moved = await call("POST", { locationId, fromWarehouseId: mainId, toWarehouseId: store, reference: "wh-1", lines: [{ itemId, quantity: 4 }] });
  assert.equal(moved.status, 201, await moved.clone().text());
  const move = (await moved.json()).transfers[0];
  assert.equal(move.reference, "WH-1");
  assert.deepEqual([await total(), await inStore()], [10, 4], "a move changes warehouse stock, not the inventory total");
  assert.equal((await database.query("SELECT count(*)::int AS n FROM inventory_movements WHERE item_id=$1", [itemId])).rows[0].n, 0, "moves write no stock movement or journal");

  const listed = (await (await records.GET(new Request(`https://app.test/api/records?kind=items&companyId=${companyId}&locationId=${locationId}`))).json()).records.find((row) => row.id === itemId);
  assert.deepEqual(listed.warehouses.map((share) => [share.name, share.quantity]), [["Main warehouse", 6], ["Store", 4]]);
  const singleListed = (await (await records.GET(new Request(`https://app.test/api/records?kind=items&companyId=${companyId}&locationId=${single}`))).json()).records[0];
  assert.equal(singleListed.warehouses, undefined, "single-warehouse inventories carry no breakdown");

  // Sell 3 from Store: only 1 is left there, so reversing the 4-unit move is refused.
  await database.query("INSERT INTO contacts(company_id,type,name,currency,status) VALUES ($1,'customer','WHM Customer','AED','active')", [companyId]);
  const sale = await records.POST(new Request("https://app.test/api/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "transactions", companyId, locationId, type: "invoice", number: "WHM-I1", party: "WHM Customer", transactionDate: "2026-10-12", dueDate: "2026-10-12", currency: "AED", exchangeRate: 1, account: "Sales Revenue", warehouseId: store, lines: [{ itemId, description: "Laptop", quantity: 3, unitPrice: 100, unitCost: 40, vatCode: "ZERO" }] }) }));
  assert.equal(sale.status, 201, await sale.clone().text());
  assert.equal((await call("DELETE", { id: move.id })).status, 409);
  const back = await call("POST", { locationId, fromWarehouseId: mainId, toWarehouseId: store, lines: [{ itemId, quantity: 3 }] });
  assert.equal(back.status, 201);
  assert.equal((await call("DELETE", { id: move.id })).status, 200, "with Store restocked the first move can be reversed");
  assert.deepEqual([await total(), await inStore()], [7, 0]);
  const history = (await (await route.GET(new Request(`https://app.test/api/warehouse-transfers?companyId=${companyId}&locationId=${locationId}`))).json()).transfers;
  assert.equal(history.length, 1);
  const warehousesRoute = await vite.ssrLoadModule("/app/api/warehouses/route.ts");
  assert.equal((await warehousesRoute.DELETE(new Request("https://app.test/api/warehouses", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyId, id: store }) }))).status, 409, "warehouses with history cannot be removed");
});

test("stock reports filter to one warehouse's quantities and offer only multi-warehouse inventories", async () => {
  const company = (await database.query("INSERT INTO companies (name) VALUES ('Warehouse reports') RETURNING id")).rows[0].id;
  const location = (await database.query("INSERT INTO inventory_locations (company_id, code, name, invoice_prefix) VALUES ($1, 'WRP', 'WRP', 'WRP') RETURNING id", [company])).rows[0].id;
  const single = (await database.query("INSERT INTO inventory_locations (company_id, code, name, invoice_prefix) VALUES ($1, 'WRS', 'WRS', 'WRS') RETURNING id", [company])).rows[0].id;
  const laptop = (await database.query("INSERT INTO items (company_id, location_id, sku, name, quantity, cost, item_type) VALUES ($1, $2, 'WRP-1', 'Laptop', 10, 40, 'stock-part') RETURNING id", [company, location])).rows[0].id;
  await database.query("INSERT INTO items (company_id, location_id, sku, name, quantity, cost, item_type) VALUES ($1, $2, 'WRP-2', 'Cable', 2, 5, 'stock-part')", [company, location]);
  await database.query("INSERT INTO items (company_id, location_id, sku, name, quantity, cost, item_type) VALUES ($1, $2, 'WRS-1', 'Mouse', 3, 5, 'stock-part')", [company, single]);
  const store = (await database.query("INSERT INTO warehouses (company_id, location_id, code, name) VALUES ($1, $2, 'STORE', 'Store') RETURNING id", [company, location])).rows[0].id;
  const mainId = (await database.query("SELECT id FROM warehouses WHERE location_id = $1 AND is_default", [location])).rows[0].id;
  const singleMain = (await database.query("SELECT id FROM warehouses WHERE location_id = $1 AND is_default", [single])).rows[0].id;
  await database.query("INSERT INTO warehouse_stock (company_id, warehouse_id, item_id, quantity) VALUES ($1, $2, $3, 4)", [company, store, laptop]);
  const { GET } = await vite.ssrLoadModule("/app/api/reports/route.ts");
  const open = async (query) => { const response = await GET(new Request(`https://app.test/api/reports?type=inventory-valuation-detail&companyId=${company}&currency=AED${query}`)); return { status: response.status, report: (await response.json()).report }; };

  const all = await open("&locationId=0");
  assert.deepEqual(all.report.warehouseOptions.map((option) => option.name), ["Main warehouse", "Store"], "single-warehouse inventories are not offered");
  assert.equal(all.report.warehouse, undefined);
  assert.ok(all.report.inventoryLedger, "the unfiltered report keeps the ledger check");

  const inStore = await open(`&locationId=${location}&warehouseId=${store}`);
  assert.equal(inStore.status, 200);
  assert.equal(inStore.report.warehouse.name, "Store");
  assert.equal(inStore.report.inventoryLedger, undefined, "the ledger check is hidden for one warehouse");
  assert.deepEqual(inStore.report.rows.map((row) => [row.sku, row.quantity, row.value]).sort(), [["WRP-1", 4, 160], ["WRP-2", 0, 0]], "Store quantities only; active items with none there show zero like the unfiltered report");
  const inMain = await open(`&locationId=0&warehouseId=${mainId}`);
  assert.deepEqual(inMain.report.rows.map((row) => [row.sku, row.quantity]).sort(), [["WRP-1", 6], ["WRP-2", 2]], "the default warehouse holds the remainder; other inventories drop out");

  assert.equal((await open(`&locationId=0&warehouseId=${singleMain}`)).status, 400, "single-warehouse inventories cannot be filtered");
  assert.equal((await open(`&locationId=${single}&warehouseId=${store}`)).status, 400, "a warehouse outside the selected inventory is refused");
});

test("inventory check reports can count one warehouse with that warehouse's quantities", async () => {
  const company = (await database.query("INSERT INTO companies (name) VALUES ('Warehouse count') RETURNING id")).rows[0].id;
  const location = (await database.query("INSERT INTO inventory_locations (company_id, code, name, invoice_prefix) VALUES ($1, 'WCT', 'WCT', 'WCT') RETURNING id", [company])).rows[0].id;
  const laptop = (await database.query("INSERT INTO items (company_id, location_id, sku, name, quantity, cost, item_type) VALUES ($1, $2, 'WCT-1', 'Laptop', 10, 40, 'stock-part') RETURNING id", [company, location])).rows[0].id;
  await database.query("INSERT INTO items (company_id, location_id, sku, name, quantity, cost, item_type) VALUES ($1, $2, 'WCT-2', 'Cable', 2, 5, 'stock-part')", [company, location]);
  const store = (await database.query("INSERT INTO warehouses (company_id, location_id, code, name) VALUES ($1, $2, 'STORE', 'Store') RETURNING id", [company, location])).rows[0].id;
  const mainId = (await database.query("SELECT id FROM warehouses WHERE location_id = $1 AND is_default", [location])).rows[0].id;
  await database.query("INSERT INTO warehouse_stock (company_id, warehouse_id, item_id, quantity) VALUES ($1, $2, $3, 4)", [company, store, laptop]);
  const route = await vite.ssrLoadModule("/app/api/inventory-check-reports/route.ts");
  const options = async (warehouseId) => { const response = await route.GET(new Request(`https://app.test/api/inventory-check-reports?companyId=${company}&locationId=${location}&options=1&warehouseId=${warehouseId}`)); return { status: response.status, data: await response.json() }; };

  const inStore = await options(store);
  assert.deepEqual(inStore.data.items.map((item) => [item.sku, item.totalQuantity, item.companyQuantities.length]), [["WCT-1", 4, 1]], "only stock in Store, under its own company");
  const inMain = await options(mainId);
  assert.deepEqual(inMain.data.items.map((item) => [item.sku, item.totalQuantity]).sort(), [["WCT-1", 6], ["WCT-2", 2]], "the default warehouse holds the remainder");
  const other = (await database.query("INSERT INTO inventory_locations (company_id, code, name, invoice_prefix) VALUES ($1, 'WCO', 'WCO', 'WCO') RETURNING id", [company])).rows[0].id;
  assert.equal((await route.GET(new Request(`https://app.test/api/inventory-check-reports?companyId=${company}&locationId=${other}&options=1&warehouseId=${store}`))).status, 400, "a warehouse of another inventory is refused");

  const created = await route.POST(new Request("https://app.test/api/inventory-check-reports", { method: "POST", headers: { "content-type": "application/json", origin: "https://app.test" }, body: JSON.stringify({ companyId: company, locationId: location, warehouseId: store, memo: "Store count", lines: [{ sku: "WCT-1", counts: { [company]: 3 } }, { sku: "WCT-2" }] }) }));
  assert.equal(created.status, 201, await created.clone().text());
  const record = (await created.json()).record;
  assert.equal(record.warehouseId, store);
  const lines = (await database.query("SELECT sku, system_quantity, company_quantities FROM inventory_check_lines WHERE report_id = $1", [record.id])).rows;
  assert.deepEqual(lines.map((line) => [line.sku, Number(line.system_quantity), JSON.parse(line.company_quantities)[0].countedQuantity]), [["WCT-1", 4, 3]], "items without stock in Store are not added");
  const listed = (await (await route.GET(new Request(`https://app.test/api/inventory-check-reports?companyId=${company}&locationId=${location}`))).json()).records;
  assert.equal(listed[0].warehouseName, "Store");
  const { warehouseInUse } = await vite.ssrLoadModule("/lib/warehouses.ts");
  const { getDb } = await vite.ssrLoadModule("/db/index.ts");
  assert.equal(await warehouseInUse(getDb(), store), true, "a counted warehouse cannot be removed");
});

test("stock transfers report lists only item transfers, filtered by period and warehouse", async () => {
  const company = (await database.query("INSERT INTO companies (name) VALUES ('Transfer report') RETURNING id")).rows[0].id;
  const location = (await database.query("INSERT INTO inventory_locations (company_id, code, name, invoice_prefix) VALUES ($1, 'MVR', 'MVR', 'MVR') RETURNING id", [company])).rows[0].id;
  const branch = (await database.query("INSERT INTO inventory_locations (company_id, code, name, invoice_prefix) VALUES ($1, 'MVB', 'MVB', 'MVB') RETURNING id", [company])).rows[0].id;
  const laptop = (await database.query("INSERT INTO items (company_id, location_id, sku, name, quantity, cost, item_type) VALUES ($1, $2, 'MVR-1', 'Laptop', 7, 40, 'stock-part') RETURNING id", [company, location])).rows[0].id;
  await database.query("INSERT INTO items (company_id, location_id, sku, name, quantity, cost, item_type) VALUES ($1, $2, 'MVR-1', 'Laptop', 1, 40, 'stock-part')", [company, branch]);
  const mainId = (await database.query("SELECT id FROM warehouses WHERE location_id = $1 AND is_default", [location])).rows[0].id;
  const store = (await database.query("INSERT INTO warehouses (company_id, location_id, code, name) VALUES ($1, $2, 'STORE', 'Store') RETURNING id", [company, location])).rows[0].id;
  const sale = (await database.query("INSERT INTO transactions (company_id, location_id, type, number, party, total, subtotal, transaction_date, status, warehouse_id) VALUES ($1, $2, 'invoice', 'MVR-INV', 'Customer', 200, 200, '2026-10-05', 'open', $3) RETURNING id", [company, location, store])).rows[0].id;
  await database.query("INSERT INTO inventory_movements (item_id, transaction_id, movement_date, movement_type, quantity, unit_cost, reference, warehouse_id) VALUES ($1, $2, '2026-10-05', 'invoice', -2, 40, 'MVR-INV', $3)", [laptop, sale, store]);
  await database.query("INSERT INTO warehouse_transfers (company_id, location_id, item_id, from_warehouse_id, to_warehouse_id, quantity, reference, transfer_date) VALUES ($1, $2, $3, $4, $5, 4, 'WHT-1', '2026-10-03')", [company, location, laptop, mainId, store]);
  await database.query("INSERT INTO stock_transfers (reference, source_company_id, source_location_id, destination_company_id, destination_location_id, sku, item_name, quantity, transfer_date) VALUES ('TRF-1', $1, $2, $1, $3, 'MVR-1', 'Laptop', 1, '2026-10-06')", [company, location, branch]);
  const { GET } = await vite.ssrLoadModule("/app/api/reports/route.ts");
  const open = async (query) => (await (await GET(new Request(`https://app.test/api/reports?type=stock-transfers&companyId=${company}&currency=AED${query}`))).json()).report;

  const all = await open(`&locationId=${location}`);
  assert.deepEqual(all.rows.map((row) => [row.date, row.reference, row.status, row.from, row.to, row.quantity, row.value]), [
    ["2026-10-03", "WHT-1", "Warehouse move", "MVR · Main warehouse", "MVR · Store", 4, 160],
    ["2026-10-06", "TRF-1", "Inventory transfer", "MVR · Main warehouse", "MVB · Main warehouse", 1, 40],
  ], "sales and other documents are not listed");
  assert.deepEqual(all.warehouseOptions.map((option) => option.name), ["Main warehouse", "Store"]);

  const inStore = await open(`&locationId=${location}&warehouseId=${store}`);
  assert.deepEqual(inStore.rows.map((row) => row.reference), ["WHT-1"], "only transfers into or out of Store");
  const period = await open(`&locationId=${location}&periodStart=2026-10-04&periodEnd=2026-10-06`);
  assert.deepEqual(period.rows.map((row) => row.reference), ["TRF-1"], "rows follow the selected period");
  const receiving = await open(`&locationId=${branch}`);
  assert.deepEqual(receiving.rows.map((row) => [row.reference, row.to]), [["TRF-1", "MVB · Main warehouse"]], "the receiving inventory also lists the transfer");
});


test("a sales document can print a chosen company bank account", async () => {
  const usd = { id: "usd1", currency: "USD", bankName: "Mashreq", accountName: "Co", accountNumber: "0191", iban: "", swift: "" };
  const usd2 = { ...usd, id: "usd2", bankName: "ADCB", accountNumber: "7788" };
  const company = (await database.query("INSERT INTO companies (name, bank_name, bank_account_number, bank_currency, bank_accounts) VALUES ('Bank choice', 'ENBD', '1015', 'AED', $1) RETURNING id", [JSON.stringify([usd, usd2])])).rows[0].id;
  const invoice = (await database.query("INSERT INTO transactions (company_id, type, number, party, total, subtotal, transaction_date, status, currency) VALUES ($1, 'invoice', 'BANK-INV-1', 'Customer', 100, 100, '2026-10-12', 'open', 'USD') RETURNING id", [company])).rows[0].id;
  const bill = (await database.query("INSERT INTO transactions (company_id, type, number, party, total, subtotal, transaction_date, status) VALUES ($1, 'bill', 'BANK-BILL-1', 'Supplier', 100, 100, '2026-10-12', 'open') RETURNING id", [company])).rows[0].id;
  const { PATCH } = await vite.ssrLoadModule("/app/api/records/route.ts");
  const choose = (id, bankAccountKey) => PATCH(new Request("https://app.test/api/records", { method: "PATCH", headers: { "content-type": "application/json", origin: "https://app.test" }, body: JSON.stringify({ kind: "transactions", id, companyId: company, editMode: "bank-account", bankAccountKey }) }));
  const saved = await choose(invoice, "usd2");
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.equal((await saved.json()).record.bankAccountKey, "usd2");
  assert.equal((await choose(invoice, "default")).status, 200, "the main bank account can be chosen");
  assert.equal((await choose(invoice, "missing")).status, 400, "only the company's own accounts");
  assert.equal((await choose(bill, "usd2")).status, 400, "purchase documents print the supplier's bank");
  const receipt = (await database.query("INSERT INTO transactions (company_id, type, number, party, total, subtotal, transaction_date, status, currency) VALUES ($1, 'sales receipt', 'BANK-SR-1', 'Customer', 50, 50, '2026-10-12', 'paid', 'USD') RETURNING id", [company])).rows[0].id;
  const receiptSaved = await choose(receipt, "usd2");
  assert.equal(receiptSaved.status, 200, await receiptSaved.clone().text());
  assert.equal((await receiptSaved.json()).record.bankAccountKey, "usd2", "sales receipts take a chosen bank account too");
  try {
    globalThis.__transferTestUser = { id: 9, role: "inventory", companyIds: [company] };
    assert.equal((await choose(invoice, "usd1")).status, 403);
  } finally { delete globalThis.__transferTestUser; }
  assert.equal((await choose(invoice, "")).status, 200, "back to the currency rule");
  assert.equal((await database.query("SELECT bank_account_key FROM transactions WHERE id = $1", [invoice])).rows[0].bank_account_key, "");

  const { bankForDocument, companyBankAccounts } = await vite.ssrLoadModule("/lib/bank-accounts.ts");
  const setup = { bankName: "ENBD", bankAccountNumber: "1015", bankCurrency: "AED", bankAccounts: JSON.stringify([usd, usd2]) };
  assert.deepEqual(companyBankAccounts(setup).map((account) => account.id), ["default", "usd1", "usd2"]);
  assert.equal(bankForDocument(setup, "USD", "").bankName, "Mashreq", "automatic: the first USD account");
  assert.equal(bankForDocument(setup, "USD", "usd2").bankName, "ADCB");
  assert.equal(bankForDocument(setup, "USD", "default").bankName, "ENBD", "the main AED account on a USD invoice when chosen");
  assert.equal(bankForDocument(setup, "USD", "removed").bankName, "Mashreq", "a removed account falls back to the currency rule");
  const { transactionDocumentData } = await vite.ssrLoadModule("/app/layout-builder/company-data.ts");
  const branding = { name: "Co", logoData: "", phone: "", trn: "", addressLine1: "", addressLine2: "", city: "", country: "", ...setup };
  assert.equal(transactionDocumentData({ currency: "USD", total: 1, bankAccountKey: "usd2" }, [], null, branding).company.bank.name, "ADCB");
});
