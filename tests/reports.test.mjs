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
