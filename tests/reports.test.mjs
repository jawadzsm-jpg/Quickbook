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
await transaction("estimate", "EST-USD", 100, 5, 3.675);
await transaction("estimate", "EST-USD-2", 100, 5, 3.675);
await transaction("proforma invoice", "PRO-USD", 100, 5, 3.675);
await transaction("sales order", "SO-USD", 100, 5, 3.675);
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

test("sales postings hit revenue, VAT, COGS and inventory accounts and sales reports reconcile", async () => {
  const created = await workspaces.POST(post({ type: "company", name: "Sales account audit", baseCurrency: "AED" }));
  assert.equal(created.status, 201);
  const { company: salesCompany } = await created.json();
  const cid = salesCompany.id, lid = salesCompany.locations[0].id;

  const accounts = (await database.query("SELECT id,name,system_role FROM accounts WHERE company_id=$1", [cid])).rows;
  const idFor = (role) => accounts.find((account) => account.system_role === role)?.id;
  assert.ok(idFor("AR") && idFor("SALES") && idFor("OUTPUT_VAT") && idFor("COGS") && idFor("INVENTORY"));

  await database.query("INSERT INTO contacts(company_id,type,name,currency,ledger_account_id) VALUES ($1,'customer','Sales Audit Customer','AED',$2)", [cid,idFor("AR")]);
  const itemId = (await database.query("INSERT INTO items(company_id,location_id,sku,item_number,name,item_type,quantity,cost,sales_price,income_account_id,cogs_account_id,asset_account_id) VALUES ($1,$2,'SALE-STOCK','SALE-1','Sales Stock','stock-part',5,60,100,$3,$4,$5) RETURNING id", [cid,lid,idFor("SALES"),idFor("COGS"),idFor("INVENTORY")])).rows[0].id;

  const records = await vite.ssrLoadModule("/app/api/records/route.ts");
  const response = await records.POST(new Request("https://app.test/api/records", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "transactions", type: "invoice", companyId: cid, locationId: lid,
      number: "SALE-AUDIT-1", party: "Sales Audit Customer", salesman: "Rep Audit",
      transactionDate: "2026-09-20", dueDate: "2026-09-30", currency: "AED", exchangeRate: 1,
      lines: [{ itemId, description: "Sales Stock", quantity: 1, unitPrice: 100, unitCost: 60, vatCode: "STANDARD" }],
    }),
  }));
  assert.equal(response.status, 201, await response.clone().text());
  const invoice = (await response.json()).record;

  const journal = (await database.query("SELECT jl.account_name,jl.debit,jl.credit FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id WHERE je.transaction_id=$1 ORDER BY jl.id", [invoice.id])).rows;
  assert.deepEqual(journal, [
    { account_name: "Accounts Receivable", debit: 105, credit: 0 },
    { account_name: "Sales Revenue", debit: 0, credit: 100 },
    { account_name: "VAT Payable", debit: 0, credit: 5 },
    { account_name: "Cost of Goods Sold", debit: 60, credit: 0 },
    { account_name: "Inventory Asset", debit: 0, credit: 60 },
  ]);
  assert.equal((await database.query("SELECT quantity FROM items WHERE id=$1", [itemId])).rows[0].quantity, 4);

  const reportGet = async (type) => {
    const result = await GET(new Request("https://app.test/api/reports?" + new URLSearchParams({
      type, companyId: String(cid), locationId: String(lid), periodStart: "2026-09-01", periodEnd: "2026-09-30",
    })));
    assert.equal(result.status, 200, await result.clone().text());
    return (await result.json()).report;
  };

  const byCustomer = await reportGet("sales-by-customer");
  assert.equal(byCustomer.rows.find((row) => row.name === "Sales Audit Customer").amount, 100);

  const customerDetail = await reportGet("sales-by-customer-detail");
  const customerRow = customerDetail.rows.find((row) => row.number === invoice.number);
  assert.equal(customerRow.amount, 100);
  assert.equal(customerRow.vat, 5);
  assert.equal(customerRow.total, 105);

  const byItem = await reportGet("sales-by-item");
  assert.equal(byItem.rows.find((row) => row.name === "Sales Stock").amount, 100);

  const itemDetail = await reportGet("sales-by-item-detail");
  assert.equal(itemDetail.rows.find((row) => row.number === invoice.number).amount, 100);

  const byRep = await reportGet("sales-by-rep-summary");
  assert.equal(byRep.rows.find((row) => row.salesman === "Rep Audit").amount, 100);

  const repDetail = await reportGet("sales-by-rep-detail");
  assert.equal(repDetail.rows.find((row) => row.number === invoice.number).amount, 100);

  const daily = await reportGet("daily-sales-summary");
  const dailyRow = daily.rows.find((row) => row.date === "2026-09-20");
  assert.equal(dailyRow.sales, 100);
  assert.equal(dailyRow.vat, 5);
  assert.equal(dailyRow.total, 105);

  const graph = await reportGet("sales-graph");
  assert.equal(graph.rows.find((row) => row.month === "2026-09").netSales, 100);

  const profitability = await reportGet("item-profitability");
  const profitRow = profitability.rows.find((row) => row.name === "Sales Stock");
  assert.equal(profitRow.amount, 100);
  assert.equal(profitRow.cost, 60);
  assert.equal(profitRow.profit, 40);

  const pnl = await reportGet("profit-loss");
  assert.deepEqual(pnl.summary, { income: 100, expenses: 60, netIncome: 40 });
});

test("customer postings hit the right accounts and customer reports stay in sync", async () => {
  const created = await workspaces.POST(post({ type: "company", name: "Customer account audit", baseCurrency: "AED" }));
  assert.equal(created.status, 201);
  const { company: salesCompany } = await created.json();
  const cid = salesCompany.id, lid = salesCompany.locations[0].id;

  const accounts = (await database.query("SELECT id,name,system_role FROM accounts WHERE company_id=$1", [cid])).rows;
  const idFor = (role) => accounts.find((account) => account.system_role === role)?.id;
  assert.ok(idFor("AR") && idFor("SALES") && idFor("OUTPUT_VAT") && idFor("BANK"));

  await database.query("INSERT INTO contacts(company_id,type,name,currency,ledger_account_id) VALUES ($1,'customer','Customer Audit','AED',$2)", [cid,idFor("AR")]);
  const itemId = (await database.query("INSERT INTO items(company_id,location_id,sku,item_number,name,item_type,quantity,cost,sales_price,income_account_id) VALUES ($1,$2,'CUS-ITEM','CUS-1','Customer Item','non-stock-part',0,0,100,$3) RETURNING id", [cid,lid,idFor("SALES")])).rows[0].id;

  const records = await vite.ssrLoadModule("/app/api/records/route.ts");
  const invoiceResponse = await records.POST(new Request("https://app.test/api/records", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "transactions", type: "invoice", companyId: cid, locationId: lid,
      number: "CUS-AUDIT-1", party: "Customer Audit", transactionDate: "2026-09-20", dueDate: "2026-09-30",
      currency: "AED", exchangeRate: 1,
      lines: [{ itemId, description: "Customer Item", quantity: 1, unitPrice: 100, unitCost: 0, vatCode: "STANDARD" }],
    }),
  }));
  assert.equal(invoiceResponse.status, 201, await invoiceResponse.clone().text());
  const invoice = (await invoiceResponse.json()).record;

  const invoiceJournal = (await database.query("SELECT jl.account_name,jl.debit,jl.credit FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id WHERE je.transaction_id=$1 ORDER BY jl.id", [invoice.id])).rows;
  assert.deepEqual(invoiceJournal, [
    { account_name: "Accounts Receivable", debit: 105, credit: 0 },
    { account_name: "Sales Revenue", debit: 0, credit: 100 },
    { account_name: "VAT Payable", debit: 0, credit: 5 },
  ]);

  const paymentResponse = await records.POST(new Request("https://app.test/api/records", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "transactions", type: "customer payment", companyId: cid, locationId: lid,
      number: "CUS-PAY-1", party: "Customer Audit", account: "Business Bank",
      transactionDate: "2026-09-21", currency: "AED", exchangeRate: 1,
      invoiceIds: [invoice.id],
      lines: [{ description: "Partial payment", quantity: 1, unitPrice: 40, unitCost: 0, vatCode: "ZERO" }],
    }),
  }));
  assert.equal(paymentResponse.status, 201, await paymentResponse.clone().text());
  const payment = (await paymentResponse.json()).record;
  const paymentJournal = (await database.query("SELECT jl.account_name,jl.debit,jl.credit FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id WHERE je.transaction_id=$1 ORDER BY jl.id", [payment.id])).rows;
  assert.deepEqual(paymentJournal, [
    { account_name: "Business Bank", debit: 40, credit: 0 },
    { account_name: "Accounts Receivable", debit: 0, credit: 40 },
  ]);

  const reportGet = async (type) => {
    const result = await GET(new Request("https://app.test/api/reports?" + new URLSearchParams({
      type, companyId: String(cid), locationId: String(lid), currency: "AED",
      customer: "Customer Audit", statementDate: "2026-09-30", periodStart: "2026-09-01", periodEnd: "2026-09-30",
    })));
    assert.equal(result.status, 200, await result.clone().text());
    return (await result.json()).report;
  };

  const open = await reportGet("customer-open-balance");
  assert.equal(open.openBalance.totalOpen, 65);
  assert.equal(open.rows.find((row) => row.number === invoice.number).openBalance, 65);

  const agingDetail = await reportGet("ar-aging-detail");
  assert.equal(agingDetail.rows.find((row) => row.number === invoice.number).amount, 65);

  const agingSummary = await reportGet("ar-aging-summary");
  assert.equal(agingSummary.rows.find((row) => row.name === "Customer Audit").total, 65);

  const openInvoices = await reportGet("open-invoices");
  assert.equal(openInvoices.rows.find((row) => row.number === invoice.number).amount, 65);

  const balance = await reportGet("customer-balances");
  assert.equal(balance.rows.find((row) => row.name === "Customer Audit").amount, 65);

  const detail = await reportGet("customer-balance-detail");
  assert.equal(detail.rows.filter((row) => row.customer === "Customer Audit").at(-1).balance, 65);

  const sales = await reportGet("sales-by-customer");
  assert.equal(sales.rows.find((row) => row.name === "Customer Audit").amount, 100); // Net sales excludes VAT.

  const received = await reportGet("online-received-payments");
  assert.equal(received.rows.find((row) => row.number === payment.number).amount, 40);

  const pnl = await reportGet("profit-loss");
  assert.equal(pnl.summary.income, 100);
});

test("purchase postings hit the right accounts and purchase reports stay in sync", async () => {
  const created = await workspaces.POST(post({ type: "company", name: "Purchase account audit", baseCurrency: "AED" }));
  assert.equal(created.status, 201);
  const { company: purchaseCompany } = await created.json();
  const cid = purchaseCompany.id, lid = purchaseCompany.locations[0].id;

  // Use SQL here because report fixtures need exact system-role IDs.
  const accounts = (await database.query("SELECT id,name,system_role FROM accounts WHERE company_id=$1", [cid])).rows;
  const idFor = (role) => accounts.find((account) => account.system_role === role)?.id;
  assert.ok(idFor("INVENTORY") && idFor("PURCHASES") && idFor("INPUT_VAT") && idFor("AP"));

  await database.query("INSERT INTO contacts(company_id,type,name,currency) VALUES ($1,'vendor','Purchase Audit Vendor','AED')", [cid]);
  const stockId = (await database.query("INSERT INTO items(company_id,location_id,sku,item_number,name,item_type,quantity,reorder_point,cost,asset_account_id,cogs_account_id) VALUES ($1,$2,'PUR-STOCK','PUR-1','Purchase Stock','stock-part',0,2,0,$3,$4) RETURNING id", [cid,lid,idFor("INVENTORY"),idFor("PURCHASES")])).rows[0].id;
  const serviceId = (await database.query("INSERT INTO items(company_id,location_id,sku,item_number,name,item_type,quantity,cost,cogs_account_id) VALUES ($1,$2,'PUR-SERVICE','PUR-2','Purchase Service','non-stock-part',0,0,$3) RETURNING id", [cid,lid,idFor("PURCHASES")])).rows[0].id;

  const records = await vite.ssrLoadModule("/app/api/records/route.ts");
  const response = await records.POST(new Request("https://app.test/api/records", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "transactions", type: "bill", companyId: cid, locationId: lid,
      number: "PUR-AUDIT-1", party: "Purchase Audit Vendor", account: "Purchases",
      transactionDate: "2026-09-20", dueDate: "2026-09-30", currency: "AED", exchangeRate: 1,
      lines: [
        { itemId: stockId, description: "Purchase Stock", quantity: 1, unitPrice: 100, unitCost: 100, vatCode: "STANDARD" },
        { itemId: serviceId, description: "Purchase Service", quantity: 1, unitPrice: 50, unitCost: 50, vatCode: "STANDARD" },
      ],
    }),
  }));
  assert.equal(response.status, 201, await response.clone().text());
  const bill = (await response.json()).record;

  const journal = (await database.query("SELECT jl.account_name,jl.debit,jl.credit FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id WHERE je.transaction_id=$1 ORDER BY jl.id", [bill.id])).rows;
  assert.deepEqual(journal, [
    { account_name: "Inventory Asset", debit: 100, credit: 0 },
    { account_name: "Purchases", debit: 50, credit: 0 },
    { account_name: "Recoverable VAT", debit: 7.5, credit: 0 },
    { account_name: "Accounts Payable", debit: 0, credit: 157.5 },
  ]);

  const reportGet = async (type) => {
    const result = await GET(new Request("https://app.test/api/reports?" + new URLSearchParams({
      type, companyId: String(cid), locationId: String(lid), periodStart: "2026-09-01", periodEnd: "2026-09-30",
    })));
    assert.equal(result.status, 200, await result.clone().text());
    return (await result.json()).report;
  };

  const supplierDetail = await reportGet("purchases-by-supplier-detail");
  const purchaseRow = supplierDetail.rows.find((row) => row.number === bill.number);
  assert.equal(purchaseRow.subtotal, 150);
  assert.equal(purchaseRow.vat, 7.5);
  assert.equal(purchaseRow.total, 157.5);

  const itemSummary = await reportGet("purchases-by-item");
  assert.equal(Math.round(itemSummary.rows.reduce((sum, row) => sum + Number(row.amount), 0) * 100) / 100, 150);

  const pnl = await reportGet("profit-loss");
  assert.equal(pnl.summary.expenses, 50); // Stock stays on Inventory Asset; only non-stock purchase is expensed.

  for (const type of ["inventory-valuation", "inventory-valuation-detail", "inventory-status", "inventory-status-supplier", "physical-inventory", "pending-builds"]) {
    const inventoryReport = await reportGet(type);
    assert.ok(inventoryReport.columns.some((column) => column.key === "account" && column.label === "Inventory Asset Account"));
    assert.ok(inventoryReport.rows.length > 0, `${type} should include the stock item`);
    assert.ok(inventoryReport.rows.every((row) => row.account === "1200 · Inventory Asset"));
    assert.ok(inventoryReport.rows.every((row) => row.sku !== "PUR-SERVICE"), `${type} must exclude non-stock items`);
  }
  const valuationDetail = await reportGet("inventory-valuation-detail");
  assert.deepEqual(valuationDetail.rows.map((row) => ({ sku: row.sku, cost: row.cost, value: row.value })), [{ sku: "PUR-STOCK", cost: 100, value: 100 }]);
  const supplierStock = await reportGet("inventory-status-supplier");
  assert.equal(supplierStock.rows[0].supplier, "Purchase Audit Vendor");
  const pendingBuilds = await reportGet("pending-builds");
  assert.equal(pendingBuilds.rows[0].required, 1);

  const payment = (await database.query("INSERT INTO transactions(company_id,location_id,number,type,party,transaction_date,total,base_total,currency,exchange_rate,status) VALUES ($1,$2,'PUR-PAY-1','bill payment','Purchase Audit Vendor','2026-09-21',57.5,57.5,'AED',1,'paid') RETURNING id", [cid,lid])).rows[0].id;
  await database.query("INSERT INTO bill_payment_allocations(payment_id,bill_id,amount) VALUES ($1,$2,57.5)", [payment,bill.id]);

  const agingDetail = await reportGet("ap-aging-detail");
  assert.equal(agingDetail.rows.find((row) => row.number === bill.number).amount, 100);
  const unpaid = await reportGet("unpaid-bills-detail");
  assert.equal(unpaid.rows.find((row) => row.number === bill.number).amount, 100);
  const agingSummary = await reportGet("ap-aging-summary");
  assert.equal(agingSummary.rows.find((row) => row.name === "Purchase Audit Vendor").total, 100);
  try {
    globalThis.__reportTestUser = { id: 4, role: "purchasing", companyIds: [cid], mustChangePassword: false };
    const supplierWorkflowReport = await GET(new Request(`https://app.test/api/reports?type=ap-aging-summary&companyId=${cid}&locationId=${lid}`));
    assert.equal(supplierWorkflowReport.status, 200);
    assert.equal((await supplierWorkflowReport.json()).report.rows.find((row) => row.name === "Purchase Audit Vendor").total, 100);
  } finally { delete globalThis.__reportTestUser; }
});

test("every Report Center entry opens its matching backend report", async () => {
  // Keep this test tied directly to the visible Report Center catalogue so a renamed,
  // moved, or newly added button cannot silently fall back to a different report.
  const enterpriseSource = await readFile(`${root}app/enterprise-app.tsx`, "utf8");
  const start = enterpriseSource.indexOf("const allReports = [");
  const end = enterpriseSource.indexOf("] as const;", start);
  assert.ok(start >= 0 && end > start, "Report Center catalogue not found");
  const catalogue = enterpriseSource.slice(start, end);
  const definitions = [...catalogue.matchAll(/\["([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)"\]/g)]
    .map((match) => ({ name: match[1], description: match[2], category: match[3], key: match[4] }));
  assert.ok(definitions.length >= 100, `Expected full Report Center catalogue, found ${definitions.length}`);
  assert.equal(new Set(definitions.map((definition) => definition.key)).size, definitions.length, "Report Center keys must be unique");
  assert.equal(new Set(definitions.map((definition) => definition.name)).size, definitions.length, "Report Center titles must be unique");

  // Statement reports need a matching vendor as well as the customer fixture.
  await db.insert(schema.contacts).values({ companyId, name: "USD Customer", type: "vendor", currency: "USD", balance: 0 });

  const failures = [];
  for (const definition of definitions) {
    const params = new URLSearchParams({
      type: definition.key,
      companyId: String(companyId),
      locationId: String(locationId),
      currency: "USD",
      customer: "USD Customer",
      statementDate: "2026-09-30",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      memo: "Report Center smoke check",
    });
    const response = await GET(new Request(`https://app.test/api/reports?${params}`));
    if (response.status !== 200) {
      let error = "";
      try { error = JSON.stringify(await response.clone().json()); } catch { error = await response.text(); }
      failures.push(`${definition.key}: HTTP ${response.status} ${error}`);
      continue;
    }
    const payload = await response.json();
    if (!payload.report || payload.report.key !== definition.key) {
      failures.push(`${definition.key}: returned ${payload.report?.key ?? "no report key"}`);
      continue;
    }
    if (!Array.isArray(payload.report.columns) || !Array.isArray(payload.report.rows) || !payload.report.title) {
      failures.push(`${definition.key}: incomplete report payload`);
    }
  }
  assert.deepEqual(failures, []);
});

test("customer summary matches detail in home currency after payments and credits", async () => {
  const summary = await report("customer-balances");
  const detail = await report("customer-balance-detail");
  assert.equal(summary.rows[0].amount, 2737.87);
  assert.equal(summary.rows[0].amount, detail.rows.at(-1).balance);
  assert.equal((await report("customer-balances", 0)).rows[0].amount, 3262.87);
});

test("customer document summary counts each pre-sale document and keeps zero-count customers", async () => {
  await db.insert(schema.contacts).values({ companyId, name: "No Documents Customer", type: "customer", currency: "AED", balance: 0 });
  const result = await report("customer-document-summary");
  assert.deepEqual(result.columns.map((column) => column.key), ["customer", "estimates", "proformaInvoices", "salesOrders", "totalDocuments"]);
  assert.deepEqual(result.rows.find((row) => row.customer === "USD Customer"), { customer: "USD Customer", estimates: 2, proformaInvoices: 1, salesOrders: 1, totalDocuments: 4 });
  assert.deepEqual(result.rows.find((row) => row.customer === "No Documents Customer"), { customer: "No Documents Customer", estimates: 0, proformaInvoices: 0, salesOrders: 0, totalDocuments: 0 });
});

test("purchase order summary counts supplier statuses within the selected inventory and dates", async () => {
  await db.insert(schema.contacts).values({ companyId, name: "No Orders Supplier", type: "vendor", currency: "AED", balance: 0 });
  await db.insert(schema.transactions).values([
    { companyId, locationId, number: "PO-SUM-OPEN", type: "purchase order", party: "Summary Supplier", transactionDate: "2026-09-20", status: "open" },
    { companyId, locationId, number: "PO-SUM-PART", type: "purchase order", party: "Summary Supplier", transactionDate: "2026-09-21", status: "partially received" },
    { companyId, locationId, number: "PO-SUM-DONE", type: "purchase order", party: "Summary Supplier", transactionDate: "2026-09-22", status: "received" },
    { companyId, locationId: otherLocation.id, number: "PO-SUM-OTHER", type: "purchase order", party: "Summary Supplier", transactionDate: "2026-09-22", status: "open" },
  ]);
  const result = await report("purchase-order-summary");
  assert.deepEqual(result.columns.map((column) => column.key), ["supplier", "open", "partiallyReceived", "received", "totalOrders"]);
  assert.deepEqual(result.rows.find((row) => row.supplier === "Summary Supplier"), { supplier: "Summary Supplier", open: 1, partiallyReceived: 1, received: 1, totalOrders: 3 });
  assert.deepEqual(result.rows.find((row) => row.supplier === "No Orders Supplier"), { supplier: "No Orders Supplier", open: 0, partiallyReceived: 0, received: 0, totalOrders: 0 });
  const response = await GET(new Request(`https://app.test/api/reports?type=purchase-order-summary&companyId=${companyId}&locationId=${locationId}&periodStart=2026-09-21&periodEnd=2026-09-21`));
  assert.equal(response.status, 200);
  const dated = (await response.json()).report;
  assert.deepEqual(dated.rows.find((row) => row.supplier === "Summary Supplier"), { supplier: "Summary Supplier", open: 0, partiallyReceived: 1, received: 0, totalOrders: 1 });
});

test("supplier centre reports stay on the selected supplier and show only open bills", async () => {
  const created = await workspaces.POST(post({ type: "company", name: "Supplier Centre audit", baseCurrency: "AED" }));
  const { company: centre } = await created.json();
  const cid = centre.id, lid = centre.locations[0].id;
  const [supplier, other] = await db.insert(schema.contacts).values([
    { companyId: cid, name: "Centre Supplier", type: "vendor", currency: "AED" },
    { companyId: cid, name: "Other Centre Supplier", type: "vendor", currency: "AED" },
  ]).returning();
  await db.insert(schema.transactions).values([
    { companyId: cid, locationId: lid, number: "CENTRE-OPEN", type: "bill", party: supplier.name, transactionDate: "2026-09-11", currency: "AED", exchangeRate: 1, subtotal: 200, vatAmount: 10, total: 210, baseTotal: 210 },
    { companyId: cid, locationId: lid, number: "CENTRE-OTHER", type: "bill", party: other.name, transactionDate: "2026-09-11", currency: "AED", exchangeRate: 1, subtotal: 300, vatAmount: 15, total: 315, baseTotal: 315 },
  ]);
  const getSelected = (type, supplierId) => GET(new Request(`https://app.test/api/reports?type=${type}&companyId=${cid}&locationId=0&supplierId=${supplierId}`));
  const quick = await getSelected("supplier-quickreport", supplier.id);
  assert.equal(quick.status, 200, await quick.clone().text());
  assert.deepEqual((await quick.json()).report.rows.map((row) => row.number), ["CENTRE-OPEN"]);
  const balance = await getSelected("supplier-open-balance", supplier.id);
  assert.equal(balance.status, 200, await balance.clone().text());
  assert.deepEqual((await balance.json()).report.rows.map((row) => [row.number, row.amount]), [["CENTRE-OPEN", 210]]);
  assert.equal((await getSelected("supplier-open-balance", 99999999)).status, 404);
  assert.equal((await getSelected("supplier-quickreport", "")).status, 400);
  const otherCompany = await workspaces.POST(post({ type: "company", name: "Other supplier company", baseCurrency: "AED" }));
  const { company: elsewhere } = await otherCompany.json();
  const [outside] = await db.insert(schema.contacts).values({ companyId: elsewhere.id, name: "Outside Supplier", type: "vendor", currency: "AED" }).returning();
  assert.equal((await getSelected("supplier-quickreport", outside.id)).status, 404);
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
  assert.equal(customers.rows[0].amount, 3675);
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
  // Balance-sheet/control accounts must never leak into Profit & Loss.
  await entry("2026-09-12", null, [
    { accountName: "Business Bank", debit: 500 },
    { accountName: "Accounts Receivable", debit: 250 },
    { accountName: "Inventory Asset", debit: 150 },
    { accountName: "Accounts Payable", credit: 300 },
    { accountName: "Opening Balance Equity", credit: 600 },
  ]);
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
  assert.ok(standard.pnl.details.every(r => !["Business Bank","Accounts Receivable","Accounts Payable","Inventory Asset","Opening Balance Equity","VAT Payable"].includes(String(r.account))));
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

test('shared report downloads are date-stamped, safe, styled, and include linked account detail', async () => {
  const { reportCsv, reportFilename, reportPdf, reportWorkbook } = await vite.ssrLoadModule('/lib/report-export.ts');
  const report = {
    key: 'balance-sheet-detail', title: 'Balance Sheet Detail', generatedAt: '2026-09-20T10:00:00.000Z', currency: 'AED',
    period: { label: 'As of 2026-09-20' },
    columns: [{ key: 'section', label: 'Section' }, { key: 'name', label: 'Account' }, { key: 'amount', label: 'Balance', type: 'money' }],
    rows: [{ section: 'Assets', name: '=BAD()', amount: 1250.5 }],
    financial: { details: [{ date: '2026-09-20', reference: 'J-1', account: 'Inventory Asset', amount: 1250.5 }] },
  };
  assert.equal(reportFilename(report, 'xlsx', new Date('2026-09-20T10:00:00.000Z')), 'balance-sheet-detail-2026-09-20.xlsx');
  const csv = reportCsv(report, 'Audit Company', 'Main Inventory');
  assert.ok(csv.includes('"Audit Company"'));
  assert.ok(csv.includes('"Main Inventory"'));
  assert.ok(csv.includes("'=BAD()"));
  const bytes = await reportWorkbook(report, 'Audit Company', 'Main Inventory');
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook(); await book.xlsx.load(bytes);
  assert.equal(book.getWorksheet('Report').getCell('B10').value, '=BAD()');
  assert.equal(book.getWorksheet('Report').views[0].ySplit, 9);
  assert.equal(book.getWorksheet('Report').pageSetup.paperSize, 9);
  assert.equal(book.getWorksheet('Report').pageSetup.fitToWidth, 1);
  assert.equal(book.getWorksheet('Account detail').getCell('C2').value, 'Inventory Asset');
  const pdf = Buffer.from(await reportPdf(report, 'Audit Company', 'Main Inventory')).toString('latin1');
  assert.ok(pdf.startsWith('%PDF-'));
  const page = pdf.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/); assert.ok(page); assert.ok(Math.abs(Number(page[1]) - 595.28) < 0.01); assert.ok(Math.abs(Number(page[2]) - 841.89) < 0.01);
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
  const aedAccount=(await database.query("INSERT INTO accounts(company_id,code,name,type,currency) VALUES ($1,'1000','Date Bank','Bank','AED') RETURNING id",[companyId])).rows[0].id;
  const usdAccount=(await database.query("INSERT INTO accounts(company_id,code,name,type,currency) VALUES ($1,'1001','Date Bank','Bank','USD') RETURNING id",[companyId])).rows[0].id;
  for(const [date,n] of [['2026-08-31',10],['2026-09-01',20],['2026-09-30',30],['2026-10-01',40]]) {
    await database.query("INSERT INTO transactions(company_id,number,type,party,transaction_date,subtotal,total,base_total) VALUES ($1,$2,'invoice','Date Customer',$2,$3,$3,$3)",[companyId,date,n]);
    const id=(await database.query("INSERT INTO journal_entries(company_id,reference,entry_date,description,posted) VALUES ($1,$2,$2,'Date test',true) RETURNING id",[companyId,date])).rows[0].id;
    await database.query("INSERT INTO journal_lines(journal_entry_id,account_name,debit,credit) VALUES ($1,'Date Bank',$2,0)",[id,n]);
  }
  const usdEntry=(await database.query("INSERT INTO journal_entries(company_id,reference,entry_date,description,posted,currency) VALUES ($1,'USD-DATE','2026-09-15','USD duplicate-name test',true,'USD') RETURNING id",[companyId])).rows[0].id;
  await database.query("INSERT INTO journal_lines(journal_entry_id,account_name,debit,credit) VALUES ($1,'Date Bank',5,0)",[usdEntry]);
  const {GET}=await vite.ssrLoadModule('/app/api/reports/route.ts');
  const report=async (type,from='2026-09-01',to='2026-09-30') => GET(new Request(`http://localhost/api/reports?type=${type}&companyId=${companyId}&periodStart=${from}&periodEnd=${to}`));
  const sales=(await (await report('sales-by-customer')).json()).report;
  assert.equal(sales.rows[0].amount,50);assert.equal(sales.period.from,'2026-09-01');
  const ledger=(await (await report('general-ledger')).json()).report;
  assert.equal(ledger.rows.length,3);assert.equal(ledger.rows.find(r=>r.reference==='2026-09-30').balance,60);assert.equal(ledger.rows.find(r=>r.reference==='USD-DATE').balance,5);
  assert.equal(ledger.rows.find(r=>r.reference==='2026-09-30').accountAccountId,aedAccount);assert.equal(ledger.rows.find(r=>r.reference==='USD-DATE').accountAccountId,usdAccount);
  const trial=(await (await report('trial-balance')).json()).report;
  assert.equal(trial.rows.find(r=>r.name==='1000 · Date Bank').balance,60);assert.equal(trial.rows.find(r=>r.name==='1001 · Date Bank').balance,5);assert.equal(trial.period.mode,'asof');
  assert.deepEqual(new Set(trial.rows.map(r=>r.nameAccountId)),new Set([aedAccount,usdAccount]));assert.deepEqual(trial.accountLinkIssues,[]);
  const all=(await (await report('sales-by-customer','','')).json()).report;assert.equal(all.rows[0].amount,100);
  assert.equal((await report('sales-by-customer','2026-02-30','2026-09-30')).status,400);
  assert.equal((await report('sales-by-customer','2026-10-01','2026-09-30')).status,400);
});

test('all 14 financial reports reconcile posted accounts, settlements, dates and company links', async () => {
 const c=(await (await workspaces.POST(post({type:'company',name:'Financial audit',baseCurrency:'AED'}))).json()).company;
 const cid=c.id,loc=c.locations[0].id;
 const addAccount=async(code,name,type,currency='AED')=>(await db.insert(schema.accounts).values({companyId:cid,code,name,type,currency}).returning())[0];
 const bank=await addAccount('B1','Audit Bank','Bank'),bank2=await addAccount('B2','Audit Bank 2','Bank');
 const ar=await addAccount('R1','Audit Receivable','Accounts Receivable','USD'),ap=await addAccount('P1','Audit Payable','Accounts Payable','USD');
 const revenue=await addAccount('I1','Audit Income','Income'),cost=await addAccount('E1','Audit Cost','Cost of Goods Sold'),asset=await addAccount('A1','Audit Equipment','Fixed Asset'),equity=await addAccount('Q1','Audit Equity','Equity');
 const entry=async(date,transactionId,lines,posted=true,location=loc)=>{
  const [j]=await db.insert(schema.journalEntries).values({companyId:cid,locationId:location,entryDate:date,transactionId,reference:`AUD-${date}-${transactionId||lines[0][0].id}`,posted}).returning();
  await db.insert(schema.journalLines).values(lines.map(([a,debit,credit])=>({journalEntryId:j.id,accountName:a.name,debit,credit})));
 };
 const doc=async(number,type,total,rate,date='2026-01-05',extra={})=>(await db.insert(schema.transactions).values({companyId:cid,locationId:loc,number,type,party:'Audit Party',currency:'USD',exchangeRate:rate,total,subtotal:total,baseTotal:total*rate,transactionDate:date,dueDate:'2026-02-01',...extra}).returning())[0];
 await entry('2025-01-01',null,[[bank,1000,0],[equity,0,1000]]);
 const invoice=await doc('AUD-INV','invoice',100,3);
 await entry(invoice.transactionDate,invoice.id,[[ar,300,0],[revenue,0,300]]);
 const bill=await doc('AUD-BILL','bill',100,3);
 await entry(bill.transactionDate,bill.id,[[cost,300,0],[ap,0,300]]);
 const payment=await doc('AUD-PAY','customer payment',40,4,'2026-01-06',{status:'paid'});
 await entry(payment.transactionDate,payment.id,[[bank,160,0],[ar,0,160]]);
 await db.insert(schema.invoicePaymentAllocations).values({paymentId:payment.id,invoiceId:invoice.id,amount:40});
 const cheque=await doc('AUD-CHQ','cheque',20,4,'2026-01-07',{billId:bill.id,status:'paid'});
 await entry(cheque.transactionDate,cheque.id,[[ap,80,0],[bank,0,80]]);
 // A payment posted after the cutoff must not reduce the historical open amount.
 const future=await doc('AUD-FUTURE','customer payment',10,3,'2027-01-01');
 await entry(future.transactionDate,future.id,[[bank,30,0],[ar,0,30]]);
 await db.insert(schema.invoicePaymentAllocations).values({paymentId:future.id,invoiceId:invoice.id,amount:10});
 // Credits reverse P&L and remain separate unapplied credit positions.
 const credit=await doc('AUD-CREDIT','credit memo',10,3,'2026-01-08');
 await entry(credit.transactionDate,credit.id,[[revenue,30,0],[ar,0,30]]);
 await entry('2026-01-09',null,[[asset,200,0],[bank,0,200]]);
 await entry('2026-01-10',null,[[bank2,100,0],[bank,0,100]]);
 await entry('2026-01-11',null,[[bank,50,0],[revenue,0,50]]);
 await entry('2026-01-11',null,[[bank,9999,0],[revenue,0,9999]],false);
 await db.insert(schema.exchangeRates).values({companyId:cid,currencyCode:'USD',name:'Dollar',rate:5});
 const get=async(type,extra='')=>{const response=await GET(new Request(`https://app.test/api/reports?type=${type}&companyId=${cid}&locationId=${loc}&periodStart=2026-01-01&periodEnd=2026-01-31${extra}`));assert.equal(response.status,200);return(await response.json()).report;};
 const {financialKeys}=await vite.ssrLoadModule('/lib/financial-reports.ts');assert.equal(financialKeys.length,14);
 for(const key of financialKeys){const r=await get(key);assert.equal(r.companyId,cid);assert.equal(r.currency,'AED');assert.ok(r.title);for(const detail of r.financial.details){if(detail.accountId)assert.ok([bank.id,bank2.id,ar.id,ap.id,revenue.id,cost.id,asset.id,equity.id].includes(detail.accountId));}}
 const inc=await get('income-customer-summary');assert.deepEqual(inc.rows,[{name:'Audit Party',amount:270},{name:'Unallocated',amount:50}]);
 assert.equal((await get('income-customer-detail')).rows.reduce((n,r)=>n+r.amount,0),320);
 assert.equal((await get('expenses-supplier-summary')).rows[0].amount,300); // cheque isn't a second expense
 assert.equal((await get('expenses-supplier-detail')).rows.length,1);
 assert.deepEqual((await get('income-expense-graph')).rows,[{month:'2026-01',income:320,expenses:300,net:20}]);
 const standard=await get('balance-sheet');assert.equal(standard.rows.find(r=>r.name==='Accumulated earnings').amount,20);
 const section=(rows,name)=>rows.filter(r=>r.section===name).reduce((n,r)=>n+r.amount,0);
 assert.equal(section(standard.rows,'Assets'),section(standard.rows,'Liabilities')+section(standard.rows,'Equity'));
 assert.deepEqual((await get('balance-sheet-detail')).rows,standard.rows);
 const comparison=await get('balance-sheet-prev-year');assert.equal(comparison.rows.find(r=>r.accountId===bank.id).previous,1000);assert.equal(comparison.rows.find(r=>r.name==='Accumulated earnings').previous,0);
 const summary=await get('balance-sheet-summary');assert.equal(summary.rows.find(r=>r.section==='Equity').amount,1020);
 const worth=await get('net-worth-graph');assert.equal(worth.rows[0].netWorth,1020);
 const flow=await get('cash-flow');const flowAmount=name=>flow.rows.find(r=>r.name===name).amount;
 assert.equal(flowAmount('Opening cash'),1000);assert.equal(flowAmount('Operating'),130);assert.equal(flowAmount('Investing'),-200);assert.equal(flowAmount('Internal transfers'),0);assert.equal(flowAmount('Closing cash'),930);
 const realised=await get('realised-gains-losses');assert.deepEqual(realised.rows.map(r=>[r.reference,r.gainLoss,r.accountId]),[['AUD-PAY',40,ar.id],['AUD-CHQ',-20,ap.id]]);
 const unrealised=await get('unrealised-gains-losses');assert.deepEqual(unrealised.rows.map(r=>[r.reference,r.bookedValue,r.gainLoss]).sort(),[['AUD-BILL',-240,-160],['AUD-CREDIT',-30,-20],['AUD-INV',180,120]]);
 const forecast=await get('cash-flow-forecast');assert.equal(forecast.rows[0].projected,930);assert.equal(forecast.rows.at(-1).projected,840);
 assert.ok((await get('income-customer-detail')).rows.every(r=>r.accountId===revenue.id));
 // Ambiguous account names must not link to the wrong ID or silently classify.
 await addAccount('I2',revenue.name,'Expense');const ambiguous=await get('income-customer-summary');assert.equal(ambiguous.rows.length,0);assert.ok(ambiguous.financial.issues.some(s=>s.includes('multiple matches')));
 // Reports retain company access restrictions and account-link permissions.
 try{globalThis.__reportTestUser={id:2,role:'viewer',companyIds:[cid],mustChangePassword:false};assert.equal((await get('balance-sheet')).financial.canViewAccounts,false);const forbidden=await GET(new Request(`https://app.test/api/reports?type=balance-sheet&companyId=${companyId}`));assert.equal(forbidden.status,403);}finally{delete globalThis.__reportTestUser;}
});

test('VAT management includes every taxable document type and posts adjustments to the linked accounts', async () => {
 const c=(await (await workspaces.POST(post({type:'company',name:'VAT management audit',baseCurrency:'AED'}))).json()).company;
 const cid=c.id,loc=c.locations[0].id;
 const [userRow]=await db.insert(schema.appUsers).values({fullName:'VAT Auditor',email:`vat-auditor-${cid}@example.test`,passwordHash:'test',role:'admin'}).returning();
 const add=async(type,number,vatAmount)=>{
  const [record]=await db.insert(schema.transactions).values({companyId:cid,locationId:loc,type,number,party:'VAT Audit',transactionDate:'2026-09-21',currency:'AED',exchangeRate:1,subtotal:100,total:100+vatAmount,vatAmount,baseTotal:100+vatAmount}).returning();
  await db.insert(schema.transactionLines).values({transactionId:record.id,description:number,quantity:1,subtotal:100,vatAmount,total:100+vatAmount});
 };
 for(const [type,number,vat] of [
  ['invoice','VAT-INV',5],['sales receipt','VAT-RECEIPT',5],['statement charge','VAT-STATEMENT',5],['credit memo','VAT-CREDIT',2],
  ['bill','VAT-BILL',5],['received item bill','VAT-ITEM-BILL',5],['expense','VAT-EXPENSE',5],['cheque','VAT-CHEQUE',5],['credit card charge','VAT-CARD',5],['vendor credit','VAT-VENDOR-CREDIT',2],
 ]) await add(type,number,vat);

 const vatManagement=await vite.ssrLoadModule('/app/api/vat-management/route.ts');
 const summaryUrl=`https://app.test/api/vat-management?companyId=${cid}&locationId=${loc}&periodStart=2026-09-01&periodEnd=2026-09-30`;
 const readSummary=async()=>{const response=await vatManagement.GET(new Request(summaryUrl));assert.equal(response.status,200,await response.clone().text());return(await response.json()).summary;};
 assert.deepEqual(await readSummary(),{outputVat:13,inputVat:23,adjustments:0,netVatDue:-10,transactionLines:10});

 globalThis.__reportTestUser={id:userRow.id,email:userRow.email,role:'all_admin',companyIds:[],mustChangePassword:false};
 try {
  const adjust=await vatManagement.POST(post({action:'adjust',companyId:cid,locationId:loc,adjustmentDate:'2026-09-21',reference:'VAT-ADJ-1',reason:'Audit correction',direction:'increase',amount:3}));
  assert.equal(adjust.status,201,await adjust.clone().text());
  assert.deepEqual(await readSummary(),{outputVat:13,inputVat:23,adjustments:3,netVatDue:-7,transactionLines:10});
  const lines=(await database.query("SELECT jl.account_name,jl.debit,jl.credit FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id WHERE je.reference='VAT-ADJ-1' ORDER BY jl.id")).rows;
  assert.deepEqual(lines,[{account_name:'Suspense',debit:3,credit:0},{account_name:'VAT Payable',debit:0,credit:3}]);
  const duplicate=await vatManagement.POST(post({action:'adjust',companyId:cid,locationId:loc,adjustmentDate:'2026-09-21',reference:'VAT-ADJ-1',reason:'Duplicate',direction:'increase',amount:3}));
  assert.equal(duplicate.status,409);
  assert.equal((await database.query("SELECT count(*)::int AS count FROM journal_entries WHERE reference='VAT-ADJ-1'")).rows[0].count,1);

  const filed=await vatManagement.POST(post({action:'file',companyId:cid,locationId:loc,periodStart:'2026-09-01',periodEnd:'2026-09-30',reference:'VAT-RETURN-SEP'}));
  assert.equal(filed.status,201,await filed.clone().text());
  const filedRecord=(await filed.json()).record;
  assert.deepEqual({outputVat:filedRecord.outputVat,inputVat:filedRecord.inputVat,adjustments:filedRecord.adjustments,netVatDue:filedRecord.netVatDue},{outputVat:13,inputVat:23,adjustments:3,netVatDue:-7});

  const vatCodes=await vite.ssrLoadModule('/app/api/vat-codes/route.ts');
  const createdCode=await vatCodes.POST(post({companyId:cid,code:'REDUCED_75',name:'Reduced 7.5%',rate:7.5,description:'Audit code'}));
  assert.equal(createdCode.status,201,await createdCode.clone().text());
  const code=(await createdCode.json()).record;
  const updatedCode=await vatCodes.PATCH(new Request('https://app.test/api/vat-codes',{method:'PATCH',headers:{origin:'https://app.test','content-type':'application/json'},body:JSON.stringify({companyId:cid,id:code.id,name:'Reduced VAT',rate:7,description:'Updated',active:true})}));
  assert.equal(updatedCode.status,200,await updatedCode.clone().text());
  assert.equal((await updatedCode.json()).record.rate,7);
 } finally { delete globalThis.__reportTestUser; }
});
