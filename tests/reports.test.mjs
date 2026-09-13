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
        export const requireApiUser = async () => globalThis.__reportTestUser || ({ id: 1, email: "test@example.test", role: "all_admin", companyIds: [], mustChangePassword: false });
      `;
    },
  }],
});
after(async () => {
  await vite.close(); await database.close();
  delete globalThis.__comnetPg; delete globalThis.__comnetPoolClosed;
  if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
});

const { getDb } = await vite.ssrLoadModule("/db/index.ts");
const post = (body) => new Request("https://app.test/api", { method: "POST", headers: { origin: "https://app.test", "content-type": "application/json" }, body: JSON.stringify(body) });

// Apply the actual migration chain to an isolated in-memory PostgreSQL engine.
for (const name of (await readdir(`${root}drizzle`)).filter((name) => name.endsWith(".sql")).sort()) {
  for (const statement of (await readFile(`${root}drizzle/${name}`, "utf8")).split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
    try { await database.exec(statement); } catch (error) { throw new Error(`Migration ${name} failed`, { cause: error }); }
  }
}

const workspaces = await vite.ssrLoadModule("/app/api/workspaces/route.ts");
const created = await workspaces.POST(post({ type: "company", name: "Report Test", baseCurrency: "AED" }));
assert.equal(created.status, 201);
const { company } = await created.json();
const companyId = company.id;
const locationId = company.locations[0].id;
const db = getDb();
const schema = await vite.ssrLoadModule("/db/schema.ts");
const [otherLocation] = await db.insert(schema.inventoryLocations).values({ companyId, name: "Second", code: "SECOND", invoicePrefix: "SECOND" }).returning();
await db.insert(schema.contacts).values({ companyId, name: "USD Customer", type: "customer", currency: "USD", balance: 19428.57 });

async function transaction(type, number, subtotal, vatAmount, rate = 1, inventory = locationId, party = "USD Customer") {
  const [row] = await db.insert(schema.transactions).values({ companyId, locationId: inventory, number, type, party, transactionDate: "2026-09-11", currency: rate === 1 ? "AED" : "USD", exchangeRate: rate, subtotal, vatAmount, total: subtotal + vatAmount, baseTotal: Math.round((subtotal + vatAmount) * rate * 100) / 100 }).returning();
  await db.insert(schema.transactionLines).values({ transactionId: row.id, description: number, quantity: 1, subtotal, vatAmount, total: subtotal + vatAmount });
  return row;
}
await transaction("invoice", "INV-USD", 1000, 50, 3.675);
await transaction("customer payment", "PAY-USD", 200, 0, 3.675);
await transaction("credit memo", "CR-USD", 100, 5, 3.675);
await transaction("invoice", "INV-OTHER", 500, 25, 1, otherLocation.id);
await transaction("bill", "BILL", 1000, 50);
await transaction("cheque", "CHQ-DEWA", 1000, 50);
await transaction("cheque", "CHQ-INTERNET", 1200, 60);
await transaction("credit card charge", "CARD-USD", 100, 5, 3.675);
await transaction("vendor credit", "VENDOR-CREDIT", 100, 5);
await transaction("cheque", "CHQ-OTHER", 2000, 100, 1, otherLocation.id);
const [journal] = await db.insert(schema.journalEntries).values({ companyId, locationId, entryDate: "2026-09-11", reference: "REPORT-TEST" }).returning();
await db.insert(schema.journalLines).values([
  { journalEntryId: journal.id, accountName: "Sales Revenue", debit: 0, credit: 1000 },
  { journalEntryId: journal.id, accountName: "Cost of Goods Sold", debit: 600, credit: 0 },
  { journalEntryId: journal.id, accountName: "Operating Expenses", debit: 50, credit: 0 },
  { journalEntryId: journal.id, accountName: "Accounts Receivable", debit: 350, credit: 0 },
]);
const { GET } = await vite.ssrLoadModule("/app/api/reports/route.ts");
async function report(type, location = locationId) {
  // A caller cannot relabel AED ledger amounts as USD.
  const response = await GET(new Request(`https://app.test/api/reports?type=${type}&companyId=${companyId}&locationId=${location}&currency=USD`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const { report } = await response.json();
  assert.equal(report.currency, "AED");
  return report;
}

test("customer summary matches detail in home currency after payments and credits", async () => {
  const summary = await report("customer-balances");
  const detail = await report("customer-balance-detail");
  assert.equal(summary.rows[0].amount, 2737.87);
  assert.equal(summary.rows[0].amount, detail.rows.at(-1).balance);
  assert.equal((await report("customer-balances", 0)).rows[0].amount, 3262.87);
});

test("VAT includes expense cheques and foreign card charges, subtracts credits, and scopes inventories", async () => {
  const summary = await report("vat-summary");
  assert.equal(summary.rows[1].amount, 173.375);
  const detail = await report("vat-detail");
  assert.ok(detail.rows.some(row => row.number === "CHQ-DEWA"));
  assert.ok(detail.rows.some(row => row.number === "CHQ-INTERNET"));
  assert.ok(detail.rows.some(row => row.number === "CARD-USD"));
  assert.ok(!detail.rows.some(row => row.number === "CHQ-OTHER"));
  assert.equal((await report("vat-summary", 0)).rows[1].amount, 273.375);
});

test("live P&L totals are the same ledger figures as the standard report", async () => {
  const result = await report("profit-loss");
  assert.deepEqual(result.summary, { income: 1000, expenses: 650, netIncome: 350 });
  assert.equal(result.rows.at(-1).amount, result.summary.netIncome);
});

test("summary destinations preserve their titles and selected inventory", async () => {
  const customers = await report("sales-by-customer");
  assert.equal(customers.title, "Sales by Customer Summary");
  assert.equal(customers.rows[0].amount, 3858.75);
  assert.equal((await report("sales-by-item")).title, "Sales by Item Summary");
  assert.equal((await report("sales-by-item")).rows.length, 1);
  assert.equal((await report("sales-by-item", 0)).rows.length, 2);
});

test("reports reject inventory IDs outside the selected company", async () => {
  const response = await GET(new Request(`https://app.test/api/reports?type=profit-loss&companyId=${companyId}&locationId=999999`));
  assert.equal(response.status, 400);
});

test("customer statements filter native currency and customer, carry opening balances and validate dates", async () => {
  const companyId = (await database.query("INSERT INTO companies(name) VALUES ('Statement test') RETURNING id")).rows[0].id;
  await database.query("INSERT INTO contacts(company_id,type,name,currency) VALUES ($1,'customer','Statement Customer','USD'),($1,'customer','Other Customer','USD')", [companyId]);
  const add = async (number, party, date, type, total, currency = 'USD') => database.query("INSERT INTO transactions(company_id,number,party,transaction_date,type,total,base_total,currency,exchange_rate) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,3.675)", [companyId,number,party,date,type,total,total*3.675,currency]);
  await add('OPEN','Statement Customer','2026-08-31','invoice',100);
  await add('INV','Statement Customer','2026-09-02','invoice',50);
  await add('PAY','Statement Customer','2026-09-03','customer payment',30);
  await add('LATE','Statement Customer','2026-09-20','invoice',500);
  await add('AED','Statement Customer','2026-09-02','invoice',999,'AED');
  await add('OTHER','Other Customer','2026-09-02','invoice',888);
  const { GET } = await vite.ssrLoadModule('/app/api/reports/route.ts');
  const query = {type:'customer-statements',companyId:String(companyId),currency:'USD',customer:'Statement Customer',statementDate:'2026-09-12',periodStart:'2026-09-01',periodEnd:'2026-09-12'};
  const get = (changes = {}) => GET(new Request('https://app.test/api/reports?' + new URLSearchParams({...query,...changes})));
  const response = await get(); assert.equal(response.status,200);
  const {report} = await response.json();
  assert.equal(report.currency,'USD');
  assert.equal(report.statement.opening,100);
  assert.equal(report.statement.charges,50);
  assert.equal(report.statement.credits,30);
  assert.equal(report.statement.closing,120);
  assert.deepEqual(report.rows.map(row=>row.balance),[150,120]);
  assert.equal((await get({customer:'Unknown'})).status,400);
  assert.equal((await get({periodStart:'2026-09-13'})).status,400);
  assert.equal((await get({periodEnd:'2026-09-20'})).status,400);
  assert.equal((await get({statementDate:'2026-02-30'})).status,400);
  const empty = await (await get({periodStart:'2026-09-10'})).json();
  assert.equal(empty.report.rows.length,0);
  assert.equal(empty.report.statement.opening,120);
  assert.equal(empty.report.statement.closing,120);
});

test("vendor statements filter native currency and customer, carry opening balances and validate dates", async () => {
  const companyId = (await database.query("INSERT INTO companies(name) VALUES ('Vendor statement test') RETURNING id")).rows[0].id;
  await database.query("INSERT INTO contacts(company_id,type,name,currency) VALUES ($1,'vendor','Statement Customer','USD'),($1,'vendor','Other Customer','USD')", [companyId]);
  const add = async (number, party, date, type, total, currency = 'USD') => database.query("INSERT INTO transactions(company_id,number,party,transaction_date,type,total,base_total,currency,exchange_rate) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,3.675)", [companyId,number,party,date,type,total,total*3.675,currency]);
  await add('OPEN','Statement Customer','2026-08-31','bill',100);
  await add('INV','Statement Customer','2026-09-02','bill',50);
  await add('PAY','Statement Customer','2026-09-03','bill payment',30);
  await add('LATE','Statement Customer','2026-09-20','bill',500);
  await add('AED','Statement Customer','2026-09-02','bill',999,'AED');
  await add('OTHER','Other Customer','2026-09-02','bill',888);
  const { GET } = await vite.ssrLoadModule('/app/api/reports/route.ts');
  const query = {memo:'Please review your account.',type:'vendor-statements',companyId:String(companyId),currency:'USD',customer:'Statement Customer',statementDate:'2026-09-12',periodStart:'2026-09-01',periodEnd:'2026-09-12'};
  const get = (changes = {}) => GET(new Request('https://app.test/api/reports?' + new URLSearchParams({...query,...changes})));
  const response = await get(); assert.equal(response.status,200);
  const {report} = await response.json();
  assert.equal(report.currency,'USD');
  assert.equal(report.statement.partyType,'vendor');
  assert.equal(report.statement.memo,'Please review your account.');
  assert.ok(report.columns.some(column=>column.key==='memo'));
  assert.equal(report.statement.opening,100);
  assert.equal(report.statement.charges,50);
  assert.equal(report.statement.credits,30);
  assert.equal(report.statement.closing,120);
  assert.deepEqual(report.rows.map(row=>row.balance),[150,120]);
  assert.equal((await get({customer:'Unknown'})).status,400);
  assert.equal((await get({periodStart:'2026-09-13'})).status,400);
  assert.equal((await get({periodEnd:'2026-09-20'})).status,400);
  assert.equal((await get({statementDate:'2026-02-30'})).status,400);
  const empty = await (await get({periodStart:'2026-09-10'})).json();
  assert.equal(empty.report.rows.length,0);
  assert.equal(empty.report.statement.opening,120);
  assert.equal(empty.report.statement.closing,120);
});

test('customer open balance uses allocations, preserves unused credits, and links actual receivable postings', async () => {
  const response = await workspaces.POST(post({ type: 'company', name: 'Open Balance Fixture', baseCurrency: 'AED' }));
  const { company: fixture } = await response.json();
  const cid = fixture.id, lid = fixture.locations[0].id;
  const [second] = await db.insert(schema.inventoryLocations).values({ companyId: cid, name: 'Other inventory', code: 'OB-2', invoicePrefix: 'OB-2' }).returning();
  const [ar] = await db.insert(schema.accounts).values({ companyId: cid, code: 'OBAR', name: 'Customer Receivables AED', type: 'Accounts Receivable', currency: 'AED' }).returning();
  await db.insert(schema.contacts).values({ companyId: cid, name: 'BAQER RASULI', type: 'customer', currency: 'AED', ledgerAccountId: ar.id, balance: 999999 });
  const add = async (number, type, total, options = {}) => {
    const [row] = await db.insert(schema.transactions).values({ companyId: cid, locationId: lid, number, type, party: 'BAQER RASULI', total, baseTotal: total, currency: 'AED', transactionDate: '2026-06-06', ...options }).returning();
    const [entry] = await db.insert(schema.journalEntries).values({ companyId: cid, locationId: row.locationId, transactionId: row.id, entryDate: row.transactionDate, reference: row.number }).returning();
    await db.insert(schema.journalLines).values({ journalEntryId: entry.id, accountName: ar.name, debit: type === 'invoice' ? total : 0, credit: type === 'customer payment' ? total : 0 });
    return row;
  };
  const invoice = await add('OPEN-INV', 'invoice', 1350, { dueDate: '2026-06-06', memo: 'Laptop sale' });
  const payment = await add('OPEN-PAY', 'customer payment', 1375, { transactionDate: '2026-06-07', status: 'paid', memo: 'HWALE BY...' });
  await db.insert(schema.invoicePaymentAllocations).values({ paymentId: payment.id, invoiceId: invoice.id, amount: 1100 });
  const settled1 = await add('SETTLED-1', 'invoice', 100);
  const settled2 = await add('SETTLED-2', 'invoice', 200);
  const settlement = await add('SETTLEMENT', 'customer payment', 300, { status: 'paid' });
  await db.insert(schema.invoicePaymentAllocations).values([{ paymentId: settlement.id, invoiceId: settled1.id, amount: 100 }, { paymentId: settlement.id, invoiceId: settled2.id, amount: 200 }]);
  await add('OTHER-INVENTORY', 'invoice', 777, { locationId: second.id });
  await add('OTHER-CUSTOMER', 'invoice', 888, { party: 'Someone Else' });
  await add('FOREIGN', 'invoice', 12, { currency: 'USD', exchangeRate: 3.675, baseTotal: 44.1 });
  await add('VOID', 'invoice', 999, { status: 'void' });
  const query = { type: 'customer-open-balance', companyId: String(cid), locationId: String(lid), customer: 'BAQER RASULI', currency: 'AED', statementDate: '2026-06-10' };
  const get = (changes = {}) => GET(new Request('https://app.test/api/reports?' + new URLSearchParams({ ...query, ...changes })));
  const result = await get(); assert.equal(result.status, 200);
  const { report: r } = await result.json();
  assert.equal(r.currency, 'AED');
  assert.deepEqual(r.rows.map(row => [row.number, row.openBalance, row.amount]), [['OPEN-INV', 250, 1350], ['OPEN-PAY', -275, -1375]]);
  assert.equal(r.openBalance.totalOpen, -25);
  assert.equal(r.openBalance.totalAmount, -25);
  assert.equal(r.rows[0].transactionId, invoice.id);
  assert.equal(r.rows[0].accountId, ar.id);
  assert.equal(r.rows[0].memo, 'Laptop sale');
  assert.equal(r.rows[0].dueDate, '2026-06-06');
  assert.equal((await (await get({ statementDate: '2026-06-06' })).json()).report.openBalance.totalOpen, 1350);
  assert.equal((await (await get({ currency: 'USD' })).json()).report.openBalance.totalOpen, 12);
  assert.equal((await (await get({ locationId: '0' })).json()).report.openBalance.totalOpen, 752);
  await add('UNUSED-CREDIT', 'credit memo', 50);
  assert.equal((await (await get()).json()).report.openBalance.totalOpen, -75);
  const agingSummary = (await (await get({ type: 'ar-aging-summary' })).json()).report;
  const agingDetail = (await (await get({ type: 'ar-aging-detail' })).json()).report;
  assert.equal(agingSummary.currency, 'AED');
  assert.equal(agingSummary.rows[0].total, -30.90); // AED -75 plus USD 12 at its stored rate.
  assert.equal(agingDetail.rows.find(row => row.number === 'OPEN-INV').amount, 250);
  assert.equal(agingDetail.rows.find(row => row.number === 'OPEN-PAY').amount, -275);
  assert.equal(agingDetail.rows.find(row => row.number === 'FOREIGN').amount, 44.1);
  assert.equal(Math.round(agingDetail.rows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100, agingSummary.rows[0].total);
  const overdue = await (await get({ type: 'customers-overdue-invoices' })).json();
  assert.equal(overdue.report.title, 'Customers with Overdue Invoices');
  assert.equal(overdue.report.openBalance.overdueOnly, true);
  assert.deepEqual(overdue.report.rows.map(row => [row.number, row.openBalance, row.accountId]), [['OPEN-INV', 250, ar.id]]);
  assert.equal((await (await get({ type: 'customers-overdue-invoices', statementDate: '2026-06-06' })).json()).report.rows.length, 0);
  await add('DUE-TODAY', 'invoice', 25, { dueDate: '2026-06-10' });
  await add('DUE-FUTURE', 'invoice', 30, { dueDate: '2026-06-11' });
  const fullyPaid = await add('PAST-DUE-PAID', 'invoice', 40, { dueDate: '2026-06-01', status: 'paid' });
  const paid = await add('PAST-DUE-PAY', 'customer payment', 40, { status: 'paid' });
  await db.insert(schema.invoicePaymentAllocations).values({ invoiceId: fullyPaid.id, paymentId: paid.id, amount: 40 });
  assert.equal((await (await get({ type: 'customers-overdue-invoices' })).json()).report.rows.length, 1);
  await db.insert(schema.contacts).values([
    { companyId: cid, type: 'customer', name: 'New Active Customer', currency: 'USD', status: 'active' },
    { companyId: cid, type: 'customer', name: 'Inactive Customer', currency: 'AED', status: 'inactive' },
    { companyId: cid, type: 'vendor', name: 'Active Vendor', currency: 'AED', status: 'active' },
  ]);
  await add('INACTIVE-DEBT', 'invoice', 80, { party: 'Inactive Customer', dueDate: '2026-06-01' });
  const active = (await (await get({ type: 'active-customers', customer: '' })).json()).report;
  assert.equal(active.activeCustomers.count, 2);
  assert.deepEqual(active.rows.map(row => [row.customer, row.currency]), [['BAQER RASULI', 'AED'], ['BAQER RASULI', 'USD'], ['New Active Customer', 'USD']]);
  assert.equal(active.rows[0].accountId, ar.id);
  assert.equal(active.rows[0].overdueInvoices, 1);
  assert.equal(active.rows[0].overdueBalance, 250);
  assert.equal(active.rows[0].openBalance, -20);
  assert.equal(active.rows[1].openBalance, 12);
  assert.equal(active.rows[2].openBalance, 0);
  const allOverdue = (await (await get({ type: 'customers-overdue-invoices', customer: '' })).json()).report;
  assert.equal(allOverdue.rows.length, 2); // Inactive customers still owe their overdue invoices.
  assert.equal((await get({ statementDate: '2026-02-30' })).status, 400);
  assert.equal((await get({ currency: 'NOT-A-CURRENCY' })).status, 400);
  assert.equal((await get({ customer: 'Not in company' })).status, 400);
  assert.equal((await get({ locationId: String(locationId) })).status, 400);
  try {
    globalThis.__reportTestUser = { id: 2, role: 'viewer', companyIds: [cid], mustChangePassword: false };
    assert.equal((await (await get()).json()).report.openBalance.canViewAccounts, false);
    assert.equal((await get({ companyId: String(companyId), locationId: '0' })).status, 403);
    globalThis.__reportTestUser = { id: 3, role: 'inventory', companyIds: [cid], mustChangePassword: false };
    assert.equal((await get()).status, 403);
    assert.equal((await get({ type: 'customers-overdue-invoices' })).status, 403);
    assert.equal((await get({ type: 'active-customers' })).status, 403);
  } finally { delete globalThis.__reportTestUser; }
});

test("P&L reports reconcile item, rep, inventory and class to posted ledger with dates and credits", async () => {
  const response = await workspaces.POST(post({ type: "company", name: "Profit reconciliation", baseCurrency: "AED" }));
  const { company: c } = await response.json(); const loc = c.locations[0].id;
  const [first, second] = await db.insert(schema.items).values([
    { companyId: c.id, locationId: loc, sku: "PNL-A", name: "Same laptop" },
    { companyId: c.id, locationId: loc, sku: "PNL-B", name: "Same laptop" },
  ]).returning();
  const [invoice] = await db.insert(schema.transactions).values({ companyId: c.id, locationId: loc, type: "invoice", number: "PNL-USD", party: "Customer", salesman: "Rep A", transactionDate: "2026-09-10", currency: "USD", exchangeRate: 3.675, subtotal: 300, total: 315, vatAmount: 15, baseTotal: 1157.625 }).returning();
  await db.insert(schema.transactionLines).values([
    { transactionId: invoice.id, itemId: first.id, description: "Same laptop", quantity: 1, subtotal: 100, unitCost: 60 },
    { transactionId: invoice.id, itemId: second.id, description: "Same laptop", quantity: 1, subtotal: 200, unitCost: 120 },
  ]);
  const [credit] = await db.insert(schema.transactions).values({ companyId: c.id, locationId: loc, type: "credit memo", number: "PNL-CREDIT", party: "Customer", salesman: "Rep A", transactionDate: "2026-09-11", subtotal: 50, total: 50 }).returning();
  await db.insert(schema.transactionLines).values({ transactionId: credit.id, itemId: first.id, description: "Same laptop", quantity: 1, subtotal: 50, unitCost: 60 });
  async function entry(date, transactionId, values, posted = true) {
    const [j] = await db.insert(schema.journalEntries).values({ companyId: c.id, locationId: loc, transactionId, entryDate: date, reference: `J-${date}`, posted }).returning();
    await db.insert(schema.journalLines).values(values.map(v => ({ journalEntryId: j.id, ...v })));
  }
  await entry("2026-09-10", invoice.id, [{ accountName: "Sales Revenue", credit: 1102.5 }, { accountName: "Cost of Goods Sold", debit: 661.5 }, { accountName: "VAT Payable", credit: 55.125 }]);
  await entry("2026-09-11", credit.id, [{ accountName: "Sales Revenue", debit: 50 }]);
  await entry("2026-09-12", null, [{ accountName: "Operating Expenses", debit: 100 }]);
  await entry("2026-09-12", null, [{ accountName: "Sales Revenue", credit: 99999 }], false);
  await entry("2025-09-10", null, [{ accountName: "Sales Revenue", credit: 200 }]);
  const get = async (type, dates = "periodStart=2026-09-01&periodEnd=2026-09-30") => {
    const res = await GET(new Request(`https://app.test/api/reports?type=${type}&companyId=${c.id}&locationId=${loc}&${dates}`));
    assert.equal(res.status, 200); return (await res.json()).report;
  };
  const standard = await get("profit-loss");
  assert.deepEqual(standard.summary, { income: 1052.5, expenses: 761.5, netIncome: 291 });
  for (const key of ["profit-loss-item", "profit-loss-rep", "profit-loss-job", "profit-loss-class"]) {
    const r = await get(key); assert.deepEqual(r.summary, standard.summary); assert.equal(r.rows.at(-1).netIncome, 291);
    assert.equal(r.rows.slice(0, -1).reduce((n, r) => n + r.cost, 0), 661.5);
  }
  const byItem = await get("profit-loss-item");
  assert.equal(byItem.rows.find(r => r.name.startsWith("PNL-A")).income, 317.5);
  assert.equal(byItem.rows.find(r => r.name.startsWith("PNL-A")).cost, 220.5);
  assert.equal(byItem.rows.find(r => r.name.startsWith("PNL-B")).cost, 441);
  assert.equal(byItem.rows.find(r => r.name === "Unallocated").expenses, 100);
  assert.equal((await get("profit-loss-rep")).rows.find(r => r.name === "Rep A").income, 1052.5);
  assert.ok(standard.pnl.details.every(r => r.accountId > 0));
  assert.equal(standard.pnl.details.find(r => r.reference === "J-2026-09-10").transactionId, invoice.id);
  assert.equal((await get("profit-loss", "periodStart=2026-10-01")).summary.netIncome, 0);
  assert.equal((await get("profit-loss-ytd")).rows.at(-1).previous, 200);
  const bad = await GET(new Request(`https://app.test/api/reports?type=profit-loss&companyId=${c.id}&periodStart=2026-09-31`)); assert.equal(bad.status, 400);
  await entry("2026-09-12", null, [{ accountName: "Missing income", credit: 22 }]);
  assert.ok((await get("profit-loss")).pnl.warnings.some(w => w.includes("Missing income")));
  assert.equal((await get("profit-loss-unclassified")).rows[0].credit, 22);

  const { pnlCsv, pnlWorkbook, pnlPdf } = await vite.ssrLoadModule("/lib/pnl-export.ts");
  const exportReport = { ...byItem, rows: [...byItem.rows, { name: " =HYPERLINK(1)", income: -12.5 }] };
  const csv = pnlCsv(exportReport, "Company"); assert.ok(csv.includes("' =HYPERLINK(1)")); assert.ok(csv.includes(",-12.5,"));
  const bytes = await pnlWorkbook(exportReport, "Company");
  const { default: ExcelJS } = await import("exceljs"); const book = new ExcelJS.Workbook(); await book.xlsx.load(bytes);
  assert.equal(book.getWorksheet("Profit and Loss").getCell("B6").value, 317.5);
  assert.equal(book.getWorksheet("Profit and Loss").pageSetup.paperSize, 9);
  assert.equal(book.getWorksheet("Ledger detail").rowCount, 5);
  const pdf = Buffer.from(await pnlPdf(byItem, "Company")).toString("latin1");
  assert.ok(pdf.startsWith("%PDF-")); const box = pdf.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/); assert.ok(box); assert.ok(Math.abs(Number(box[1]) - 841.89) < 0.01); assert.ok(Math.abs(Number(box[2]) - 595.28) < 0.01);
});

test('report date presets handle weeks, leap days, month ends and fiscal boundaries', async () => {
  const {presetDates,reportPeriod,reportMonths,previousYearDate} = await vite.ssrLoadModule('/lib/report-period.ts');
  assert.deepEqual(reportMonths('2026-12-15','2027-01-10'),[{month:'2026-12',from:'2026-12-15',to:'2026-12-31'},{month:'2027-01',from:'2027-01-01',to:'2027-01-10'}]);
  assert.equal(previousYearDate('2024-02-29'),'2023-02-28');
  assert.deepEqual(presetDates('This Week','2026-09-13'),{from:'2026-09-07',to:'2026-09-13'});
  assert.deepEqual(presetDates('Last Month-to-date','2024-03-31'),{from:'2024-02-01',to:'2024-02-29'});
  assert.deepEqual(presetDates('Last Fiscal Year-to-date','2024-02-29'),{from:'2023-01-01',to:'2023-02-28'});
  assert.deepEqual(presetDates('Next Fiscal Quarter','2026-12-31'),{from:'2027-01-01',to:'2027-03-31'});
  assert.deepEqual(presetDates('Next 4 Weeks','2026-09-13'),{from:'2026-09-14',to:'2026-10-11'});
  assert.deepEqual(presetDates('All'),{from:'',to:''});
  assert.throws(()=>presetDates('This Fiscal Year-to-Last Month','2026-01-20'));
  assert.equal(reportPeriod('balance-sheet','2026-09-01','2026-09-13').from,'');
  assert.equal(reportPeriod('inventory-valuation','2026-09-01','2026-09-13').mode,'current');
});

test('shared report dates filter activity, preserve ledger opening and as-of balances, reject invalid dates', async () => {
  const companyId=(await database.query("INSERT INTO companies(name) VALUES ('Report date filters') RETURNING id")).rows[0].id;
  await database.query("INSERT INTO accounts(company_id,code,name,type) VALUES ($1,'1000','Date Bank','Bank')",[companyId]);
  for(const [date,n] of [['2026-08-31',10],['2026-09-01',20],['2026-09-30',30],['2026-10-01',40]]) {
    await database.query("INSERT INTO transactions(company_id,number,type,party,transaction_date,subtotal,total,base_total) VALUES ($1,$2,'invoice','Date Customer',$2,$3,$3,$3)",[companyId,date,n]);
    const id=(await database.query("INSERT INTO journal_entries(company_id,reference,entry_date,description,posted) VALUES ($1,$2,$2,'Date test',true) RETURNING id",[companyId,date])).rows[0].id;
    await database.query("INSERT INTO journal_lines(journal_entry_id,account_name,debit,credit) VALUES ($1,'Date Bank',$2,0)",[id,n]);
  }
  const {GET}=await vite.ssrLoadModule('/app/api/reports/route.ts');
  const report=async (type,from='2026-09-01',to='2026-09-30') => GET(new Request(`http://localhost/api/reports?type=${type}&companyId=${companyId}&periodStart=${from}&periodEnd=${to}`));
  const sales=(await (await report('sales-by-customer')).json()).report;
  assert.equal(sales.rows[0].amount,50);assert.equal(sales.period.from,'2026-09-01');
  const ledger=(await (await report('general-ledger')).json()).report;
  assert.equal(ledger.rows.length,2);assert.equal(ledger.rows[0].balance,30);assert.equal(ledger.rows[1].balance,60);
  const trial=(await (await report('trial-balance')).json()).report;
  assert.equal(trial.rows.find(r=>r.name==='Date Bank').balance,60);assert.equal(trial.period.mode,'asof');
  const all=(await (await report('sales-by-customer','','')).json()).report;assert.equal(all.rows[0].amount,100);
  assert.equal((await report('sales-by-customer','2026-02-30','2026-09-30')).status,400);
  assert.equal((await report('sales-by-customer','2026-10-01','2026-09-30')).status,400);
});
