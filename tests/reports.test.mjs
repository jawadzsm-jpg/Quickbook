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
  assert.equal(customerRow.transactionId, invoice.id);
  assert.equal(customerRow.accountAccountId, idFor("AR"));
  assert.equal(customerRow.revenueAccountAccountId, idFor("SALES"));
  const dailyDetail = await reportGet("daily-sales-detail");
  const dailyDocument = dailyDetail.rows.find((row) => row.number === invoice.number);
  assert.equal(dailyDocument.amount, 100); assert.equal(dailyDocument.vat, 5); assert.equal(dailyDocument.total, 105);

  const byItem = await reportGet("sales-by-item");
  assert.equal(byItem.rows.find((row) => row.name === "Sales Stock").amount, 100);
  assert.equal(byItem.rows.find((row) => row.name === "Sales Stock").sourceReferenceTransactionId, invoice.id);
  assert.ok(byItem.columns.some((column) => column.key === "sourceReference"));

  const itemDetail = await reportGet("sales-by-item-detail");
  assert.equal(itemDetail.rows.find((row) => row.number === invoice.number).amount, 100);
  assert.equal(itemDetail.rows.find((row) => row.number === invoice.number).transactionId, invoice.id);

  const byRep = await reportGet("sales-by-rep-summary");
  assert.equal(byRep.rows.find((row) => row.salesman === "Rep Audit").amount, 100);

  const repDetail = await reportGet("sales-by-rep-detail");
  assert.equal(repDetail.rows.find((row) => row.number === invoice.number).amount, 100);
  assert.equal(repDetail.rows.find((row) => row.number === invoice.number).transactionId, invoice.id);

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
  assert.equal(profitRow.sourceReferenceTransactionId, invoice.id);
  assert.match(profitRow.sourceReference, new RegExp(`^${invoice.number} · 1 document$`));

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
  assert.equal(openInvoices.rows.find((row) => row.number === invoice.number).transactionId, invoice.id);

  const balance = await reportGet("customer-balances");
  assert.equal(balance.rows.find((row) => row.name === "Customer Audit").amount, 65);

  const detail = await reportGet("customer-balance-detail");
  assert.equal(detail.rows.filter((row) => row.customer === "Customer Audit").at(-1).balance, 65);
  assert.equal(detail.rows.find((row) => row.number === invoice.number).transactionId, invoice.id);

  const sales = await reportGet("sales-by-customer");
  assert.equal(sales.rows.find((row) => row.name === "Customer Audit").amount, 100); // Net sales excludes VAT.

  const received = await reportGet("online-received-payments");
  assert.equal(received.rows.find((row) => row.number === payment.number).amount, 40);
  assert.equal(received.rows.find((row) => row.number === payment.number).transactionId, payment.id);

  const statement = await reportGet("customer-statements");
  assert.equal(statement.rows.find((row) => row.number === invoice.number).transactionId, invoice.id);
  assert.equal(statement.rows.find((row) => row.number === payment.number).transactionId, payment.id);

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
  assert.equal(purchaseRow.accountAccountId, idFor("AP"));
  const supplierSummary = await reportGet("purchases-by-vendor");
  assert.equal(supplierSummary.rows.find((row) => row.name === "Purchase Audit Vendor").amount, 150);

  const itemSummary = await reportGet("purchases-by-item");
  assert.equal(Math.round(itemSummary.rows.reduce((sum, row) => sum + Number(row.amount), 0) * 100) / 100, 150);

  const pnl = await reportGet("profit-loss");
  assert.equal(pnl.summary.expenses, 50); // Stock stays on Inventory Asset; only non-stock purchase is expensed.

  for (const type of ["inventory-valuation", "inventory-valuation-detail", "inventory-status", "inventory-status-supplier", "physical-inventory", "pending-builds"]) {
    const inventoryReport = await reportGet(type);
    assert.ok(inventoryReport.columns.some((column) => column.key === "account" && column.label === "Inventory Asset Account"));
    assert.ok(inventoryReport.rows.length > 0, `${type} should include the stock item`);
    assert.ok(inventoryReport.rows.every((row) => row.account === "1200 · Inventory Asset"));
    assert.ok(inventoryReport.rows.every((row) => row.accountAccountId === idFor("INVENTORY")), `${type} should link its Inventory Asset account`);
    assert.ok(inventoryReport.rows.every((row) => row.sku !== "PUR-SERVICE"), `${type} must exclude non-stock items`);
  }
  const valuationDetail = await reportGet("inventory-valuation-detail");
  assert.deepEqual(valuationDetail.rows.map((row) => ({ sku: row.sku, cost: row.cost, value: row.value })), [{ sku: "PUR-STOCK", cost: 100, value: 100 }]);
  const supplierStock = await reportGet("inventory-status-supplier");
  assert.equal(supplierStock.rows[0].supplier, "Purchase Audit Vendor");
  const pendingBuilds = await reportGet("pending-builds");
  assert.equal(pendingBuilds.rows[0].required, 1);
  const stockAging = await reportGet("inventory-stock-aging");
  const agedStock = stockAging.rows.find((row) => row.sku === "PUR-STOCK");
  assert.ok(agedStock);
  assert.equal(agedStock.quantity, 1);
  assert.equal(agedStock.sourceReference, bill.number);
  assert.equal(agedStock.sourceReferenceTransactionId, bill.id);
  assert.equal(agedStock.account, "1200 · Inventory Asset");
  assert.equal(agedStock.accountAccountId, idFor("INVENTORY"));
  await database.query("INSERT INTO items(company_id,location_id,sku,item_number,name,item_type,category,quantity,cost,asset_account_id) VALUES ($1,$2,'PUR-NEG','PUR-NEG-1','Negative Stock Item','stock-part','Laptop',-3,40,$3)", [cid,lid,idFor("INVENTORY")]);
  const negativeItems = await reportGet("negative-item-list");
  const negative = negativeItems.rows.find((row) => row.sku === "PUR-NEG");
  assert.ok(negative);
  assert.equal(negative.quantity, -3);
  assert.equal(negative.shortageQuantity, 3);
  assert.equal(negative.shortageValue, 120);

  const payment = (await database.query("INSERT INTO transactions(company_id,location_id,number,type,party,transaction_date,total,base_total,currency,exchange_rate,status) VALUES ($1,$2,'PUR-PAY-1','bill payment','Purchase Audit Vendor','2026-09-21',57.5,57.5,'AED',1,'paid') RETURNING id", [cid,lid])).rows[0].id;
  await database.query("INSERT INTO bill_payment_allocations(payment_id,bill_id,amount) VALUES ($1,$2,57.5)", [payment,bill.id]);

  const agingDetail = await reportGet("ap-aging-detail");
  assert.equal(agingDetail.rows.find((row) => row.number === bill.number).amount, 100);
  assert.equal(agingDetail.rows.find((row) => row.number === bill.number).transactionId, bill.id);
  const unpaid = await reportGet("unpaid-bills-detail");
  assert.equal(unpaid.rows.find((row) => row.number === bill.number).amount, 100);
  assert.equal(unpaid.rows.find((row) => row.number === bill.number).transactionId, bill.id);
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
  const [reportVendor] = await db.insert(schema.contacts).values({ companyId, name: "USD Customer", type: "vendor", currency: "USD", balance: 0 }).returning();

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
      supplierId: String(reportVendor.id),
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
  assert.deepEqual(result.columns.map((column) => column.key), ["supplier", "open", "partiallyReceived", "received", "closed", "totalOrders"]);
  assert.deepEqual(result.rows.find((row) => row.supplier === "Summary Supplier"), { supplier: "Summary Supplier", open: 1, partiallyReceived: 1, received: 1, closed: 0, totalOrders: 3 });
  assert.deepEqual(result.rows.find((row) => row.supplier === "No Orders Supplier"), { supplier: "No Orders Supplier", open: 0, partiallyReceived: 0, received: 0, closed: 0, totalOrders: 0 });
  const response = await GET(new Request(`https://app.test/api/reports?type=purchase-order-summary&companyId=${companyId}&locationId=${locationId}&periodStart=2026-09-21&periodEnd=2026-09-21`));
  assert.equal(response.status, 200);
  const dated = (await response.json()).report;
  assert.deepEqual(dated.rows.find((row) => row.supplier === "Summary Supplier"), { supplier: "Summary Supplier", open: 0, partiallyReceived: 1, received: 0, closed: 0, totalOrders: 1 });
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
    { companyId: cid, locationId: lid, number: "CENTRE-USD", type: "bill", party: supplier.name, transactionDate: "2026-09-12", currency: "USD", exchangeRate: 3.67, subtotal: 95.24, vatAmount: 4.76, total: 100, baseTotal: 367 },
    { companyId: cid, locationId: lid, number: "CENTRE-OTHER", type: "bill", party: other.name, transactionDate: "2026-09-11", currency: "AED", exchangeRate: 1, subtotal: 300, vatAmount: 15, total: 315, baseTotal: 315 },
  ]);
  const getSelected = (type, supplierId, currency = "AED") => GET(new Request(`https://app.test/api/reports?type=${type}&companyId=${cid}&locationId=0&supplierId=${supplierId}&currency=${currency}`));
  const quick = await getSelected("supplier-quickreport", supplier.id);
  assert.equal(quick.status, 200, await quick.clone().text());
  const quickReport = (await quick.json()).report;
  assert.deepEqual(quickReport.rows.map((row) => row.number), ["CENTRE-OPEN"]);
  assert.ok(quickReport.rows[0].transactionId > 0);
  const balance = await getSelected("supplier-open-balance", supplier.id);
  assert.equal(balance.status, 200, await balance.clone().text());
  const balanceReport = (await balance.json()).report;
  assert.deepEqual(balanceReport.rows.map((row) => [row.number, row.amount]), [["CENTRE-OPEN", 210]]);
  assert.equal(balanceReport.rows[0].transactionId, quickReport.rows[0].transactionId);
  const foreignBalance = await getSelected("supplier-open-balance", supplier.id, "USD");
  assert.equal(foreignBalance.status, 200, await foreignBalance.clone().text());
  const foreignReport = (await foreignBalance.json()).report;
  assert.equal(foreignReport.currency, "USD");
  assert.deepEqual(foreignReport.rows.map((row) => [row.number, row.amount]), [["CENTRE-USD", 100]]);
  assert.equal((await getSelected("supplier-open-balance", 99999999)).status, 404);
  assert.equal((await getSelected("supplier-quickreport", "")).status, 400);
  const otherCompany = await workspaces.POST(post({ type: "company", name: "Other supplier company", baseCurrency: "AED" }));
  const { company: elsewhere } = await otherCompany.json();
  const [outside] = await db.insert(schema.contacts).values({ companyId: elsewhere.id, name: "Outside Supplier", type: "vendor", currency: "AED" }).returning();
  assert.equal((await getSelected("supplier-quickreport", outside.id)).status, 404);
});

test("purchase returns reduce the linked supplier bill and appear in the supplier account", async () => {
  const created = await workspaces.POST(post({ type: "company", name: "Purchase Return account audit", baseCurrency: "AED" }));
  const { company: workspace } = await created.json();
  const cid = workspace.id, lid = workspace.locations[0].id;
  const [supplier] = await db.insert(schema.contacts).values({ companyId: cid, type: "vendor", name: "Return Audit Supplier", currency: "AED" }).returning();
  const stockId = (await database.query("INSERT INTO items(company_id,location_id,sku,name,item_type,quantity,cost) VALUES ($1,$2,'RETURN-AUDIT','Return Audit Item','stock-part',0,100) RETURNING id", [cid, lid])).rows[0].id;
  const records = await vite.ssrLoadModule("/app/api/records/route.ts");
  const save = (body) => records.POST(new Request("https://app.test/api/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "transactions", companyId: cid, locationId: lid, party: supplier.name, account: "Purchases", transactionDate: "2026-09-20", currency: "AED", exchangeRate: 1, ...body }) }));
  const billResponse = await save({ type: "bill", number: "RETURN-AUDIT-BILL", lines: [{ itemId: stockId, description: "Return Audit Item", quantity: 2, unitPrice: 100, vatCode: "STANDARD" }] });
  assert.equal(billResponse.status, 201, await billResponse.clone().text());
  const bill = (await billResponse.json()).record;
  const sourceLineId = (await database.query("SELECT id FROM transaction_lines WHERE transaction_id=$1", [bill.id])).rows[0].id;
  const returnResponse = await save({ type: "vendor credit", number: "RETURN-AUDIT-CREDIT", billId: bill.id, lines: [{ sourceLineId, itemId: stockId, description: "Return Audit Item", quantity: 1, unitPrice: 100, vatCode: "STANDARD" }] });
  assert.equal(returnResponse.status, 201, await returnResponse.clone().text());
  const returned = (await returnResponse.json()).record;
  const payable = (await database.query("SELECT jl.debit,jl.credit FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id WHERE je.transaction_id=$1 AND jl.account_name='Accounts Payable'", [returned.id])).rows;
  assert.deepEqual(payable, [{ debit: 105, credit: 0 }]);
  assert.equal((await database.query("SELECT balance FROM contacts WHERE id=$1", [supplier.id])).rows[0].balance, 105);
  assert.equal((await database.query("SELECT status FROM transactions WHERE id=$1", [bill.id])).rows[0].status, "partially paid");
  const getRecords = (kind, extra = "") => records.GET(new Request(`https://app.test/api/records?kind=${kind}&companyId=${cid}&locationId=${lid}&party=${encodeURIComponent(supplier.name)}&currency=AED${extra}`));
  const unpaidResponse = await getRecords("unpaid-bills");
  assert.equal(unpaidResponse.status, 200);
  assert.equal((await unpaidResponse.json()).records.find((entry) => entry.id === bill.id).remaining, 105);
  const returnsResponse = await getRecords("supplier-returns", `&supplierId=${supplier.id}`);
  assert.equal(returnsResponse.status, 200);
  assert.deepEqual((await returnsResponse.json()).records.map((entry) => [entry.id, entry.billNumber]), [[returned.id, bill.number]]);
  const supplierReport = await GET(new Request(`https://app.test/api/reports?type=supplier-quickreport&companyId=${cid}&locationId=0&supplierId=${supplier.id}`));
  assert.equal(supplierReport.status, 200);
  assert.deepEqual((await supplierReport.json()).report.rows.map((entry) => [entry.number, entry.amount]), [[bill.number, 210], [returned.number, -105]]);
  const openResponse = await GET(new Request(`https://app.test/api/reports?type=supplier-open-balance&companyId=${cid}&locationId=0&supplierId=${supplier.id}`));
  assert.equal(openResponse.status, 200);
  assert.equal((await openResponse.json()).report.rows[0].amount, 105);

  const detailResponse = await records.GET(new Request(`https://app.test/api/records?kind=transactions&id=${returned.id}&companyId=${cid}`));
  assert.equal(detailResponse.status, 200, await detailResponse.clone().text());
  const detail = await detailResponse.json();
  assert.equal(detail.lines[0].sourceLineId, sourceLineId);
  const editResponse = await records.PATCH(new Request("https://app.test/api/records", {
    method: "PATCH",
    headers: { origin: "https://app.test", "content-type": "application/json" },
    body: JSON.stringify({
      kind: "transactions", id: returned.id, companyId: cid, locationId: lid, revision: detail.revision,
      type: "vendor credit", number: "RETURN-AUDIT-CREDIT-EDITED", billId: bill.id, party: supplier.name,
      account: "Purchases", transactionDate: "2026-09-21", status: "open", currency: "AED", exchangeRate: 1,
      lines: [{ sourceLineId, itemId: stockId, description: "Return Audit Item", quantity: 0.5, unitPrice: 100, vatCode: "STANDARD" }],
    }),
  }));
  assert.equal(editResponse.status, 200, await editResponse.clone().text());
  assert.equal((await database.query("SELECT quantity FROM items WHERE id=$1", [stockId])).rows[0].quantity, 1.5);
  assert.equal((await database.query("SELECT balance FROM contacts WHERE id=$1", [supplier.id])).rows[0].balance, 157.5);

  const deleteResponse = await records.DELETE(new Request("https://app.test/api/records", {
    method: "DELETE",
    headers: { origin: "https://app.test", "content-type": "application/json" },
    body: JSON.stringify({ kind: "transactions", id: returned.id, companyId: cid, deletionReason: "Incorrect purchase return" }),
  }));
  assert.equal(deleteResponse.status, 200, await deleteResponse.clone().text());
  assert.equal((await database.query("SELECT quantity FROM items WHERE id=$1", [stockId])).rows[0].quantity, 2);
  assert.equal((await database.query("SELECT balance FROM contacts WHERE id=$1", [supplier.id])).rows[0].balance, 210);
  assert.equal((await database.query("SELECT status FROM transactions WHERE id=$1", [bill.id])).rows[0].status, "open");
  const remainingReturns = await (await getRecords("supplier-returns", `&supplierId=${supplier.id}`)).json();
  assert.equal(remainingReturns.records.length, 0);
});

test("UAE VAT reports include all company inventories, expense cheques and foreign card charges", async () => {
  const summary = await report("vat-summary");
  assert.equal(summary.rows[1].amount, 273.375);
  const detail = await report("vat-detail");
  assert.ok(detail.rows.some(row => row.number === "CHQ-DEWA"));
  assert.ok(detail.rows.some(row => row.number === "CHQ-INTERNET"));
  assert.ok(detail.rows.some(row => row.number === "CARD-USD"));
  assert.ok(detail.rows.some(row => row.number === "CHQ-OTHER"));
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
  assert.equal(agingDetail.canViewAccounts, true);
  assert.equal(agingDetail.rows.find(row => row.number === 'OPEN-INV').accountAccountId, ar.id);
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
  assert.equal(byItem.rows.find(r => r.name.startsWith("PNL-A")).itemId, first.id);
  assert.equal(byItem.rows.find(r => r.name.startsWith("PNL-A")).sku, "PNL-A");
  assert.equal(byItem.rows.find(r => r.name.startsWith("PNL-A")).linkArea, "inventory");
  assert.equal(byItem.rows.find(r => r.name.startsWith("PNL-A")).cost, 220.5);
  assert.equal(byItem.rows.find(r => r.name.startsWith("PNL-B")).cost, 441);
  assert.equal(byItem.rows.find(r => r.name === "Unallocated").expenses, 100);
  const byRep = await get("profit-loss-rep");
  assert.equal(byRep.rows.find(r => r.name === "Rep A").income, 1052.5);
  assert.equal(byRep.rows.find(r => r.name === "Rep A").linkArea, "sales");
  const byJob = await get("profit-loss-job");
  assert.equal(byJob.rows.find(r => r.name !== "Total").locationId, loc);
  assert.equal(byJob.rows.find(r => r.name !== "Total").linkArea, "inventory");
  const byClass = await get("profit-loss-class");
  assert.equal(byClass.rows.find(r => r.name === "invoice").linkArea, "sales");
  assert.equal(byClass.rows.find(r => r.name === "Manual journal").linkArea, "journal-entries");
  const cogs = await get("profit-loss-cost-of-goods");
  assert.equal(cogs.title, "Cost of Goods Sold Detail");
  assert.deepEqual(cogs.summary, { income: 1052.5, expenses: 661.5, netIncome: 391 });
  assert.equal(cogs.rows.length, 1);
  assert.equal(cogs.rows[0].cost, 661.5);
  assert.equal(cogs.rows[0].transactionId, invoice.id);
  assert.notEqual(cogs.rows[0].location, "Unassigned");
  assert.equal(cogs.rows[0].salesman, "Rep A");
  assert.ok(cogs.pnl.details.every(row => row.type === "Cost of Goods Sold"));
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
  assert.ok(pdf.startsWith("%PDF-")); const box = pdf.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/); assert.ok(box); assert.ok(Math.abs(Number(box[1]) - 595.28) < 0.01); assert.ok(Math.abs(Number(box[2]) - 841.89) < 0.01);
  const landscapePdf = Buffer.from(await pnlPdf(byItem, "Company", undefined, "landscape")).toString("latin1");
  const landscapeBox = landscapePdf.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/); assert.ok(landscapeBox); assert.ok(Math.abs(Number(landscapeBox[1]) - 841.89) < 0.01); assert.ok(Math.abs(Number(landscapeBox[2]) - 595.28) < 0.01);
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
  assert.equal(book.getWorksheet('Report').pageSetup.orientation, 'portrait');
  assert.equal(book.getWorksheet('Account detail').getCell('C2').value, 'Inventory Asset');
  const pdf = Buffer.from(await reportPdf(report, 'Audit Company', 'Main Inventory')).toString('latin1');
  assert.ok(pdf.startsWith('%PDF-'));
  const page = pdf.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/); assert.ok(page); assert.ok(Math.abs(Number(page[1]) - 595.28) < 0.01); assert.ok(Math.abs(Number(page[2]) - 841.89) < 0.01);
  const portraitPdf = Buffer.from(await reportPdf({ ...report, key: 'balance-sheet-summary', title: 'Balance Sheet Summary' }, 'Audit Company', 'Main Inventory')).toString('latin1');
  const portraitPage = portraitPdf.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/); assert.ok(portraitPage); assert.ok(Math.abs(Number(portraitPage[1]) - 595.28) < 0.01); assert.ok(Math.abs(Number(portraitPage[2]) - 841.89) < 0.01);
  const landscapePdf = Buffer.from(await reportPdf(report, 'Audit Company', 'Main Inventory', report.rows, undefined, 'landscape')).toString('latin1');
  const landscapePage = landscapePdf.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/); assert.ok(landscapePage); assert.ok(Math.abs(Number(landscapePage[1]) - 841.89) < 0.01); assert.ok(Math.abs(Number(landscapePage[2]) - 595.28) < 0.01);
});

test('budget summaries calculate account and monthly performance and export to selectable A4 PDF', async () => {
  const { budgetSummary } = await vite.ssrLoadModule('/lib/budget-report.ts');
  const accountSummary = budgetSummary({ key: 'budget-actual', rows: [
    { section: 'Income', budget: 1000, actual: 1200 },
    { section: 'Expenses', budget: 400, actual: 350 },
  ] });
  assert.deepEqual(accountSummary.cards.map(card => card.value), [1000, 1200, 400, 350, 250]);
  assert.equal(accountSummary.cards.at(-1).tone, 'positive');
  const monthlySummary = budgetSummary({ key: 'budget-actual-graph', rows: [
    { month: '2026-01', budget: 100, actual: 90 },
    { month: '2026-02', budget: 120, actual: 150 },
  ] });
  assert.deepEqual(monthlySummary.cards.map(card => card.value), [220, 240, 20, 2]);
  const { reportPdf } = await vite.ssrLoadModule('/lib/report-export.ts');
  const report = { key: 'budget-actual-graph', title: 'Budget vs. Actual Graph', generatedAt: '2026-09-27T10:00:00.000Z', currency: 'AED', columns: [{ key: 'month', label: 'Month' }, { key: 'budget', label: 'Budget', type: 'money' }, { key: 'actual', label: 'Actual', type: 'money' }], rows: [{ month: '2026-01', budget: 100, actual: 90 }] };
  const pdf = Buffer.from(await reportPdf(report, 'Budget Company', 'Main Inventory')).toString('latin1');
  const page = pdf.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/); assert.ok(page);
  assert.ok(Math.abs(Number(page[1]) - 595.28) < 0.01); assert.ok(Math.abs(Number(page[2]) - 841.89) < 0.01);
});

test('sales summaries provide report-specific KPIs and export every Sales report to A4 portrait by default', async () => {
  const { salesReportKeys, salesSummary, salesDetailTarget } = await vite.ssrLoadModule('/lib/sales-report.ts');
  assert.equal(salesReportKeys.size, 12);
  const customer = salesSummary({ key: 'sales-by-customer', rows: [{ name: 'A', amount: 100 }, { name: 'B', amount: 300 }] });
  assert.deepEqual(customer.cards.map(card => card.value), [400, 2, 200, 300]);
  assert.equal(salesDetailTarget('sales-by-customer'), 'sales-by-customer-detail');
  const graph = salesSummary({ key: 'sales-graph', rows: [{ month: '2026-08', sales: 500, refunds: 50 }, { month: '2026-09', sales: 300, refunds: 20 }] });
  assert.deepEqual(graph.cards.map(card => card.value), [800, 70, 730, 2]);
  const { reportPdf } = await vite.ssrLoadModule('/lib/report-export.ts');
  const report = { key: 'sales-by-customer', title: 'Sales by Customer Summary', generatedAt: '2026-09-27T10:00:00.000Z', currency: 'AED', columns: [{ key: 'name', label: 'Customer' }, { key: 'amount', label: 'Sales', type: 'money' }], rows: [{ name: 'A', amount: 100 }] };
  const pdf = Buffer.from(await reportPdf(report, 'Sales Company', 'Main Inventory')).toString('latin1');
  const page = pdf.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/); assert.ok(page);
  assert.ok(Math.abs(Number(page[1]) - 595.28) < 0.01); assert.ok(Math.abs(Number(page[2]) - 841.89) < 0.01);
});

test('customer summaries provide receivable KPIs and export every Customer report to A4 portrait by default', async () => {
  const { customerReportKeys, customerSummary, customerDetailTarget } = await vite.ssrLoadModule('/lib/customer-report.ts');
  assert.equal(customerReportKeys.size, 17);
  const aging = customerSummary({ key: 'ar-aging-summary', rows: [{ name: 'A', current: 100, days30: 50, days60: 25, days90: 10, total: 185 }] });
  assert.deepEqual(aging.cards.map(card => card.value), [100, 50, 25, 10, 185]);
  assert.equal(customerDetailTarget('ar-aging-summary'), 'ar-aging-detail');
  const collections = customerSummary({ key: 'collections-report', rows: [{ customer: 'A', balance: 500, openInvoices: 3, overdueInvoices: 2 }] });
  assert.deepEqual(collections.cards.map(card => card.value), [500, 1, 3, 2]);
  const { reportPdf } = await vite.ssrLoadModule('/lib/report-export.ts');
  const report = { key: 'collections-report', title: 'Collections Report', generatedAt: '2026-09-27T10:00:00.000Z', currency: 'AED', columns: [{ key: 'customer', label: 'Customer' }, { key: 'balance', label: 'Balance', type: 'money' }], rows: [{ customer: 'A', balance: 500 }] };
  const pdf = Buffer.from(await reportPdf(report, 'Customer Company', 'Main Inventory')).toString('latin1');
  const page = pdf.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/); assert.ok(page);
  assert.ok(Math.abs(Number(page[1]) - 595.28) < 0.01); assert.ok(Math.abs(Number(page[2]) - 841.89) < 0.01);
});

test('vendor summaries provide payable KPIs and export Vendor reports to fitted A4 PDF', async () => {
  const { vendorReportKeys, vendorSummary, vendorDetailTarget } = await vite.ssrLoadModule('/lib/vendor-report.ts');
  assert.equal(vendorReportKeys.size, 10);
  const aging = vendorSummary({ key: 'ap-aging-summary', rows: [{ name: 'A', current: 100, days30: 50, days60: 25, days90: 10, total: 185 }] });
  assert.deepEqual(aging.cards.map(card => card.value), [100, 50, 25, 10, 185]);
  assert.equal(vendorDetailTarget('ap-aging-summary'), 'ap-aging-detail');
  const detail = vendorSummary({ key: 'unpaid-bills-detail', rows: [{ supplier: 'A', amount: 500, overdueDays: 12 }, { supplier: 'B', amount: 200, overdueDays: 0 }] });
  assert.deepEqual(detail.cards.map(card => card.value), [700, 2, 2, 1]);
  const { reportPdf } = await vite.ssrLoadModule('/lib/report-export.ts');
  const defaultReport = { key: 'vendor-balances', title: 'Supplier Balance Summary', generatedAt: '2026-09-27T10:00:00.000Z', currency: 'AED', columns: [{ key: 'name', label: 'Supplier' }, { key: 'amount', label: 'Balance', type: 'money' }], rows: [{ name: 'A', amount: 500 }] };
  const defaultPdf = Buffer.from(await reportPdf(defaultReport, 'Vendor Company', 'Main Inventory')).toString('latin1');
  const defaultPage = defaultPdf.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/); assert.ok(defaultPage);
  assert.ok(Math.abs(Number(defaultPage[1]) - 595.28) < 0.01); assert.ok(Math.abs(Number(defaultPage[2]) - 841.89) < 0.01);
  const statementReport = { key: 'vendor-statements', title: 'Vendor Statements', generatedAt: '2026-09-27T10:00:00.000Z', currency: 'AED', statement: { opening: 0, charges: 500, credits: 200, closing: 300 }, columns: [{ key: 'customer', label: 'Vendor' }, { key: 'number', label: 'Reference' }, { key: 'debit', label: 'Charges', type: 'money' }, { key: 'credit', label: 'Payments', type: 'money' }], rows: [{ customer: 'A', number: 'B-1', debit: 500, credit: 200 }] };
  const portrait = Buffer.from(await reportPdf(statementReport, 'Vendor Company', 'Main Inventory')).toString('latin1');
  const portraitPage = portrait.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/); assert.ok(portraitPage);
  assert.ok(Math.abs(Number(portraitPage[1]) - 595.28) < 0.01); assert.ok(Math.abs(Number(portraitPage[2]) - 841.89) < 0.01);
});

test('purchase summaries provide purchasing KPIs and export all Purchase reports to fitted A4 portrait by default', async () => {
  const { purchaseReportKeys, purchaseSummary, purchaseDetailTarget } = await vite.ssrLoadModule('/lib/purchase-report.ts');
  assert.equal(purchaseReportKeys.size, 8);
  const suppliers = purchaseSummary({ key: 'purchases-by-vendor', rows: [{ name: 'A', amount: 100 }, { name: 'B', amount: 300 }] });
  assert.deepEqual(suppliers.cards.map(card => card.value), [400, 2, 200, 300]);
  assert.equal(purchaseDetailTarget('purchases-by-vendor'), 'purchases-by-supplier-detail');
  const orders = purchaseSummary({ key: 'purchase-order-summary', rows: [{ supplier: 'A', open: 2, partiallyReceived: 1, received: 3, totalOrders: 6 }] });
  assert.deepEqual(orders.cards.map(card => card.value), [6, 2, 1, 3, 1]);
  const { reportPdf } = await vite.ssrLoadModule('/lib/report-export.ts');
  const report = { key: 'purchases-by-vendor', title: 'Purchases by Supplier Summary', generatedAt: '2026-09-27T10:00:00.000Z', currency: 'AED', columns: [{ key: 'name', label: 'Supplier' }, { key: 'amount', label: 'Purchases', type: 'money' }], rows: [{ name: 'A', amount: 500 }] };
  const pdf = Buffer.from(await reportPdf(report, 'Purchase Company', 'Main Inventory')).toString('latin1');
  const page = pdf.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/); assert.ok(page);
  assert.ok(Math.abs(Number(page[1]) - 595.28) < 0.01); assert.ok(Math.abs(Number(page[2]) - 841.89) < 0.01);
});

test('inventory summaries provide stock KPIs and export all Inventory reports to fitted A4 portrait by default', async () => {
  const { inventoryReportKeys, inventorySummary, inventoryDetailTarget } = await vite.ssrLoadModule('/lib/inventory-report.ts');
  assert.equal(inventoryReportKeys.size, 8);
  const valuation = inventorySummary({ key: 'inventory-valuation', rows: [{ account: 'Inventory Asset', category: 'Laptop', items: 2, quantity: 8, value: 5000 }, { account: 'Inventory Asset', category: 'Monitor', items: 1, quantity: 4, value: 1000 }] });
  assert.deepEqual(valuation.cards.map(card => card.value), [6000, 12, 3, 2, 1]);
  assert.equal(inventoryDetailTarget('inventory-valuation'), 'inventory-valuation-detail');
  const valuationDetail = inventorySummary({ key: 'inventory-valuation-detail', rows: [{ quantity: 100, value: 422050 }, { quantity: 0, value: 0 }, { quantity: -2, value: -5000 }] });
  assert.deepEqual(valuationDetail.cards.map(card => card.value), [422050, 100, 3, 4220.5, 2]);
  const status = inventorySummary({ key: 'inventory-status', rows: [{ name: 'A', available: 5, status: 'In Stock', value: 500 }, { name: 'B', available: 1, status: 'Low Stock', value: 100 }, { name: 'C', available: 0, status: 'Out of Stock', value: 0 }] });
  assert.deepEqual(status.cards.map(card => card.value), [600, 6, 3, 1, 1]);
  const aging = inventorySummary({ key: 'inventory-stock-aging', rows: [{ quantity: 5, value: 500, ageDays: 45 }, { quantity: 2, value: 300, ageDays: 400 }] });
  assert.deepEqual(aging.cards.map(card => card.value), [800, 7, 2, 1, 1]);
  assert.equal(inventoryDetailTarget('inventory-stock-aging'), 'inventory-valuation-detail');
  const negative = inventorySummary({ key: 'negative-item-list', rows: [{ category: 'Laptop', inventory: 'Main', shortageQuantity: 3, shortageValue: 120 }, { category: 'Monitor', inventory: 'Branch', shortageQuantity: 2, shortageValue: 80 }] });
  assert.deepEqual(negative.cards.map(card => card.value), [2, 5, 200, 2, 2]);
  const { reportPdf } = await vite.ssrLoadModule('/lib/report-export.ts');
  const report = { key: 'inventory-valuation', title: 'Stock Valuation Summary', generatedAt: '2026-09-27T10:00:00.000Z', currency: 'AED', columns: [{ key: 'category', label: 'Category' }, { key: 'value', label: 'Stock Value', type: 'money' }], rows: [{ category: 'Laptop', value: 5000 }] };
  const pdf = Buffer.from(await reportPdf(report, 'Inventory Company', 'Main Inventory')).toString('latin1');
  const page = pdf.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/); assert.ok(page);
  assert.ok(Math.abs(Number(page[1]) - 595.28) < 0.01); assert.ok(Math.abs(Number(page[2]) - 841.89) < 0.01);
});

test('banking summaries provide cash-control KPIs and export both Banking reports to fitted A4 portrait by default', async () => {
  const { bankingReportKeys, bankingSummary, bankingDetailTarget } = await vite.ssrLoadModule('/lib/banking-report.ts');
  assert.equal(bankingReportKeys.size, 2);
  const register = bankingSummary({ key: 'bank-register', rows: [
    { account: 'Main Bank', accountAccountId: 1, baseDebit: 1000, baseCredit: 0, baseBalance: 1000 },
    { account: 'Main Bank', accountAccountId: 1, baseDebit: 0, baseCredit: 200, baseBalance: 800 },
    { account: 'Savings', accountAccountId: 2, baseDebit: 500, baseCredit: 0, baseBalance: 500 },
  ] });
  assert.deepEqual(register.cards.map(card => card.value), [1500, 200, 1300, 1300, 3, 2]);
  const reconciliation = bankingSummary({ key: 'bank-reconciliation', rows: [
    { account: 'Main Bank', status: 'Cleared', absoluteAmount: 1000 },
    { account: 'Main Bank', status: 'Uncleared', absoluteAmount: 200 },
  ] });
  assert.deepEqual(reconciliation.cards.map(card => card.value), [1000, 200, 1, 1, 1]);
  assert.equal(bankingDetailTarget('bank-reconciliation'), 'bank-register');
  const { reportPdf } = await vite.ssrLoadModule('/lib/report-export.ts');
  const report = { key: 'bank-reconciliation', title: 'Bank Reconciliation', generatedAt: '2026-09-27T10:00:00.000Z', currency: 'AED', columns: [{ key: 'account', label: 'Bank Account' }, { key: 'amount', label: 'Net', type: 'money' }], rows: [{ account: 'Main Bank', amount: 1000, status: 'Cleared', absoluteAmount: 1000 }] };
  const pdf = Buffer.from(await reportPdf(report, 'Banking Company', 'Main Inventory')).toString('latin1');
  const page = pdf.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/); assert.ok(page);
  assert.ok(Math.abs(Number(page[1]) - 595.28) < 0.01); assert.ok(Math.abs(Number(page[2]) - 841.89) < 0.01);
});

test('accountant summaries provide control KPIs and export all 11 Accountant reports to fitted A4 portrait by default', async () => {
  const { accountantReportKeys, accountantSummary, accountantDetailTarget } = await vite.ssrLoadModule('/lib/accountant-report.ts');
  assert.equal(accountantReportKeys.size, 11);
  const trialBalance = accountantSummary({ key: 'trial-balance', rows: [
    { name: 'Cash', debit: 1000, credit: 0, balance: 1000 },
    { name: 'Capital', debit: 0, credit: 1000, balance: -1000 },
  ] });
  assert.deepEqual(trialBalance.cards.map(card => card.value), [1000, 1000, 0, 2, 1, 1]);
  const ledger = accountantSummary({ key: 'general-ledger', rows: [
    { account: 'Cash', debit: 1000, credit: 0 },
    { account: 'Cash', debit: 0, credit: 200 },
    { account: 'Sales', debit: 0, credit: 800 },
  ] });
  assert.deepEqual(ledger.cards.map(card => card.value), [1000, 1000, 0, 3, 2]);
  const deleted = accountantSummary({ key: 'deleted-transactions-summary', rows: [{ action: 'Deleted', records: 2 }, { action: 'Voided', records: 1 }] });
  assert.deepEqual(deleted.cards.map(card => card.value), [3, 2, 1, 2]);
  assert.equal(accountantDetailTarget('trial-balance'), 'general-ledger');
  const { reportPdf } = await vite.ssrLoadModule('/lib/report-export.ts');
  const report = { key: 'trial-balance', title: 'Trial Balance', generatedAt: '2026-09-27T10:00:00.000Z', currency: 'AED', columns: [{ key: 'name', label: 'Account' }, { key: 'debit', label: 'Debit', type: 'money' }, { key: 'credit', label: 'Credit', type: 'money' }], rows: [{ name: 'Cash', debit: 1000, credit: 0, balance: 1000 }] };
  const pdf = Buffer.from(await reportPdf(report, 'Accountant Company', 'Main Inventory')).toString('latin1');
  const page = pdf.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/); assert.ok(page);
  assert.ok(Math.abs(Number(page[1]) - 595.28) < 0.01); assert.ok(Math.abs(Number(page[2]) - 841.89) < 0.01);
});

test('Lists summaries provide master-data KPIs and export all 15 reports to fitted A4 portrait by default', async () => {
  const { listReportKeys, listSummary, listDetailTarget } = await vite.ssrLoadModule('/lib/list-report.ts');
  assert.equal(listReportKeys.size, 15);
  const accounts = listSummary({ key: 'account-listing', rows: [
    { name: 'Cash', status: 'Active', parent: '—', type: 'Bank', balance: 1000 },
    { name: 'Petty Cash', status: 'Active', parent: 'Cash', type: 'Bank', balance: 200 },
    { name: 'Old Account', status: 'Inactive', parent: '—', type: 'Expense', balance: 0 },
  ] });
  assert.deepEqual(accounts.cards.map(card => card.value), [3, 2, 1, 1, 2, 1200]);
  const items = listSummary({ key: 'item-listing', rows: [
    { category: 'Hardware', quantity: 5, reorder: 2, cost: 100, status: 'active' },
    { category: 'Hardware', quantity: 1, reorder: 2, cost: 50, status: 'inactive' },
  ] });
  assert.deepEqual(items.cards.map(card => card.value), [550, 2, 6, 1, 1, 1]);
  const contacts = listSummary({ key: 'customer-contact-list', rows: [
    { status: 'active', email: 'a@example.test', phone: '123', country: 'UAE' },
    { status: 'inactive', email: '—', phone: '—', country: 'UAE' },
  ] });
  assert.deepEqual(contacts.cards.map(card => card.value), [2, 1, 1, 1, 1, 1]);
  assert.equal(listDetailTarget('item-listing'), 'item-price-list');
  const { reportPdf } = await vite.ssrLoadModule('/lib/report-export.ts');
  const report = { key: 'item-listing', title: 'Item Listing', generatedAt: '2026-09-27T10:00:00.000Z', currency: 'AED', columns: [{ key: 'item', label: 'Item' }, { key: 'quantity', label: 'On Hand' }, { key: 'cost', label: 'Cost', type: 'money' }], rows: [{ item: 'Laptop', quantity: 5, reorder: 2, cost: 100, status: 'active' }] };
  const pdf = Buffer.from(await reportPdf(report, 'Lists Company', 'Main Inventory')).toString('latin1');
  const page = pdf.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/); assert.ok(page);
  assert.ok(Math.abs(Number(page[1]) - 595.28) < 0.01); assert.ok(Math.abs(Number(page[2]) - 841.89) < 0.01);
});

test('employee reports keep native balances separate and export home-currency payments on A4', async () => {
  const { employeeSummary, employeeReportKeys } = await vite.ssrLoadModule('/lib/employee-report.ts');
  assert.equal(employeeReportKeys.size, 2);
  const balances = employeeSummary({ key: 'employee-balances', rows: [
    { name: 'A', status: 'active', currency: 'AED', balance: 100 },
    { name: 'B', status: 'inactive', currency: 'USD', balance: 0 },
  ] });
  assert.deepEqual(balances.cards.map(card => card.value), [2, 1, 1, 2]);
  const payments = employeeSummary({ key: 'employee-payments', rows: [
    { name: 'A', originalCurrency: 'AED', amount: 200 },
    { name: 'B', originalCurrency: 'USD', amount: 367.25 },
  ] });
  assert.deepEqual(payments.cards.map(card => card.value), [567.25, 2, 2, 2]);
  const { reportPdf } = await vite.ssrLoadModule('/lib/report-export.ts');
  const report = { key: 'employee-payments', title: 'Employee Payment Detail', generatedAt: '2026-09-28T10:00:00.000Z', currency: 'AED', columns: [{ key: 'name', label: 'Employee' }, { key: 'amount', label: 'Home currency', type: 'money' }], rows: [{ name: 'A', amount: 200 }] };
  const pdf = Buffer.from(await reportPdf(report, 'Comnet', 'All inventories')).toString('latin1');
  const page = pdf.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
  assert.ok(page);
  assert.ok(Math.abs(Number(page[1]) - 595.28) < 0.01);
  assert.ok(Math.abs(Number(page[2]) - 841.89) < 0.01);
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
 const incomeDetail=await get('income-customer-detail');assert.equal(incomeDetail.rows.reduce((n,r)=>n+r.amount,0),320);assert.equal(incomeDetail.rows.find(r=>r.reference.includes(String(invoice.id)))?.transactionId,invoice.id);
 assert.equal((await get('expenses-supplier-summary')).rows[0].amount,300); // cheque isn't a second expense
 const supplierDetail=await get('expenses-supplier-detail');assert.equal(supplierDetail.rows.length,1);assert.equal(supplierDetail.rows[0].transactionId,bill.id);
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
 assert.ok(flow.financial.details.some(r=>r.transactionId===payment.id));
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
 const add=async(type,number,vatAmount,extra={})=>{
  const subtotal=vatAmount/0.05;
  const [record]=await db.insert(schema.transactions).values({companyId:cid,locationId:loc,type,number,party:'VAT Audit',transactionDate:'2026-09-21',currency:'AED',exchangeRate:1,subtotal,total:subtotal+vatAmount,vatAmount,baseTotal:subtotal+vatAmount,...extra}).returning();
  await db.insert(schema.transactionLines).values({transactionId:record.id,description:number,quantity:1,subtotal,vatAmount,total:subtotal+vatAmount,vatCode:extra.vatCode||'STANDARD',vatRate:5});
 };
 for(const [type,number,vat] of [
  ['invoice','VAT-INV',5],['sales receipt','VAT-RECEIPT',5],['statement charge','VAT-STATEMENT',5],['credit memo','VAT-CREDIT',2],
  ['bill','VAT-BILL',5],['received item bill','VAT-ITEM-BILL',5],['expense','VAT-EXPENSE',5],['cheque','VAT-CHEQUE',5],['credit card charge','VAT-CARD',5],['vendor credit','VAT-VENDOR-CREDIT',2],
 ]) await add(type,number,vat);

 const vatManagement=await vite.ssrLoadModule('/app/api/vat-management/route.ts');
 const summaryUrl=`https://app.test/api/vat-management?companyId=${cid}&locationId=${loc}&periodStart=2026-09-01&periodEnd=2026-09-30`;
 const readSummary=async()=>{const response=await vatManagement.GET(new Request(summaryUrl));assert.equal(response.status,200,await response.clone().text());return(await response.json()).summary;};
 const initial=await readSummary();
 assert.equal(initial.basis,'UAE VAT — date of supply (accrual)');
 assert.equal(initial.currency,'AED');
 assert.equal(initial.filingDueDate,'2026-10-28');
 assert.deepEqual({outputVat:initial.outputVat,inputVat:initial.inputVat,adjustments:initial.adjustments,netVatDue:initial.netVatDue,transactionLines:initial.transactionLines},{outputVat:13,inputVat:23,adjustments:0,netVatDue:-10,transactionLines:10});
 assert.deepEqual(initial.boxes.box1,{amount:260,vat:13});
 assert.deepEqual(initial.boxes.box9,{amount:460,vat:23});
 assert.equal(initial.canRecordFiling,false); // Company TRN is a mandatory filing control.

 globalThis.__reportTestUser={id:userRow.id,email:userRow.email,role:'all_admin',companyIds:[],mustChangePassword:false};
 try {
  const adjust=await vatManagement.POST(post({action:'adjust',companyId:cid,locationId:loc,adjustmentDate:'2026-09-21',reference:'VAT-ADJ-1',reason:'Audit correction',direction:'increase',amount:3}));
  assert.equal(adjust.status,201,await adjust.clone().text());
  const adjusted=await readSummary();
  assert.deepEqual({outputVat:adjusted.outputVat,inputVat:adjusted.inputVat,adjustments:adjusted.adjustments,netVatDue:adjusted.netVatDue,transactionLines:adjusted.transactionLines},{outputVat:13,inputVat:23,adjustments:3,netVatDue:-7,transactionLines:10});
  const lines=(await database.query("SELECT jl.account_name,jl.debit,jl.credit FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id WHERE je.reference='VAT-ADJ-1' ORDER BY jl.id")).rows;
  assert.deepEqual(lines,[{account_name:'Suspense',debit:3,credit:0},{account_name:'VAT Payable',debit:0,credit:3}]);
  const duplicate=await vatManagement.POST(post({action:'adjust',companyId:cid,locationId:loc,adjustmentDate:'2026-09-21',reference:'VAT-ADJ-1',reason:'Duplicate',direction:'increase',amount:3}));
  assert.equal(duplicate.status,409);
  assert.equal((await database.query("SELECT count(*)::int AS count FROM journal_entries WHERE reference='VAT-ADJ-1'")).rows[0].count,1);

  const blocked=await vatManagement.POST(post({action:'file',companyId:cid,locationId:loc,periodStart:'2026-09-01',periodEnd:'2026-09-30',reference:'VAT-RETURN-BLOCKED'}));
  assert.equal(blocked.status,409);
  await database.query('UPDATE companies SET trn=$1 WHERE id=$2',['100000000000003',cid]);
  const filed=await vatManagement.POST(post({action:'file',companyId:cid,locationId:loc,periodStart:'2026-09-01',periodEnd:'2026-09-30',reference:'VAT-RETURN-SEP'}));
  assert.equal(filed.status,201,await filed.clone().text());
  const filedRecord=(await filed.json()).record;
  assert.deepEqual({outputVat:filedRecord.outputVat,inputVat:filedRecord.inputVat,adjustments:filedRecord.adjustments,netVatDue:filedRecord.netVatDue},{outputVat:13,inputVat:23,adjustments:3,netVatDue:-7});
  assert.equal(filedRecord.locationId,null);
  const overlap=await vatManagement.POST(post({action:'file',companyId:cid,locationId:loc,periodStart:'2026-09-15',periodEnd:'2026-10-15',reference:'VAT-RETURN-OVERLAP'}));
  assert.equal(overlap.status,409);

  // UAE VAT201 classification is company-wide and does not tax a bill-payment cheque twice.
  const [branch]=await db.insert(schema.inventoryLocations).values({companyId:cid,name:'VAT Branch',code:`VAT${cid}`,invoicePrefix:`VAT${cid}`}).returning();
  const addUaeLine=async({type,number,subtotal,vatAmount,vatCode='STANDARD',isImport=false,locationId=loc,status='open',billId=null})=>{
   const [record]=await db.insert(schema.transactions).values({companyId:cid,locationId,type,number,party:'UAE VAT Audit',transactionDate:'2026-10-10',currency:'AED',exchangeRate:1,subtotal,vatAmount,total:subtotal+vatAmount,baseTotal:subtotal+vatAmount,isImport,status,billId}).returning();
   await db.insert(schema.transactionLines).values({transactionId:record.id,description:number,quantity:1,subtotal,vatAmount,total:subtotal+vatAmount,vatCode,vatRate:vatAmount?5:0});
   return record;
  };
  await addUaeLine({type:'invoice',number:'UAE-STANDARD',subtotal:100,vatAmount:5,locationId:branch.id});
  await addUaeLine({type:'invoice',number:'UAE-ZERO',subtotal:300,vatAmount:0,vatCode:'ZERO'});
  await addUaeLine({type:'invoice',number:'UAE-EXEMPT',subtotal:400,vatAmount:0,vatCode:'EXEMPT'});
  await addUaeLine({type:'invoice',number:'UAE-CANCELLED',subtotal:100,vatAmount:5,status:'cancelled'});
  const imported=await addUaeLine({type:'bill',number:'UAE-IMPORT',subtotal:100,vatAmount:5,isImport:true});
  await addUaeLine({type:'bill',number:'UAE-RCM',subtotal:200,vatAmount:10,vatCode:'REVERSE_CHARGE'});
  await addUaeLine({type:'cheque',number:'UAE-BILL-PAYMENT',subtotal:100,vatAmount:5,billId:imported.id});
  const octoberResponse=await vatManagement.GET(new Request(`https://app.test/api/vat-management?companyId=${cid}&locationId=${loc}&periodStart=2026-10-01&periodEnd=2026-10-31`));
  assert.equal(octoberResponse.status,200,await octoberResponse.clone().text());
  const october=(await octoberResponse.json()).summary;
  assert.deepEqual(october.boxes.box1,{amount:100,vat:5});
  assert.deepEqual(october.boxes.box3,{amount:200,vat:10});
  assert.deepEqual(october.boxes.box4,{amount:300,vat:0});
  assert.deepEqual(october.boxes.box5,{amount:400,vat:0});
  assert.deepEqual(october.boxes.box6,{amount:100,vat:5});
  assert.deepEqual(october.boxes.box10,{amount:300,vat:15});
  assert.deepEqual({outputVat:october.outputVat,inputVat:october.inputVat,netVatDue:october.netVatDue,transactionLines:october.transactionLines},{outputVat:20,inputVat:15,netVatDue:5,transactionLines:5});

  const vatCodes=await vite.ssrLoadModule('/app/api/vat-codes/route.ts');
  const createdCode=await vatCodes.POST(post({companyId:cid,code:'REDUCED_75',name:'Reduced 7.5%',rate:7.5,description:'Audit code'}));
  assert.equal(createdCode.status,201,await createdCode.clone().text());
  const code=(await createdCode.json()).record;
  const updatedCode=await vatCodes.PATCH(new Request('https://app.test/api/vat-codes',{method:'PATCH',headers:{origin:'https://app.test','content-type':'application/json'},body:JSON.stringify({companyId:cid,id:code.id,name:'Reduced VAT',rate:7,description:'Updated',active:true})}));
  assert.equal(updatedCode.status,200,await updatedCode.clone().text());
  assert.equal((await updatedCode.json()).record.rate,7);
  const listedCodes=await vatCodes.GET(new Request(`https://app.test/api/vat-codes?companyId=${cid}`));
  assert.equal(listedCodes.status,200,await listedCodes.clone().text());
  const listed=await listedCodes.json();
  assert.ok(["STANDARD","ZERO","EXEMPT","REVERSE_CHARGE","OUT_OF_SCOPE"].every((value)=>listed.codes.some((entry)=>entry.code===value&&entry.system&&entry.active)));
  const attachments=await vite.ssrLoadModule('/app/api/attachments/route.ts');
  const {reportAttachmentId}=await vite.ssrLoadModule('/lib/report-attachments.ts');
  const reportEntityId=reportAttachmentId('inventory-stock-aging');
  const attachedReport=await attachments.POST(post({companyId:cid,entityType:'report',entityId:reportEntityId,attachments:[{fileName:'stock-aging-review.txt',mimeType:'text/plain',fileData:'data:text/plain;base64,QUdJTkc=',fileSize:5}]}));
  assert.equal(attachedReport.status,201,await attachedReport.clone().text());
  const reportFiles=await attachments.GET(new Request(`https://app.test/api/attachments?companyId=${cid}&entityType=report&entityId=${reportEntityId}`));
  assert.equal((await reportFiles.json()).attachments[0].file_name,'stock-aging-review.txt');
  const attached=await attachments.POST(post({companyId:cid,entityType:'vat_code',entityId:code.id,attachments:[{fileName:'reduced-vat-ruling.txt',mimeType:'text/plain',fileData:'data:text/plain;base64,VkFU',fileSize:3}]}));
  assert.equal(attached.status,201,await attached.clone().text());
  const detailResponse=await vatCodes.GET(new Request(`https://app.test/api/vat-codes?companyId=${cid}&id=${code.id}`));
  assert.equal(detailResponse.status,200,await detailResponse.clone().text());
  assert.equal((await detailResponse.json()).attachments[0].fileName,'reduced-vat-ruling.txt');
  const deletedCode=await vatCodes.DELETE(new Request('https://app.test/api/vat-codes',{method:'DELETE',headers:{origin:'https://app.test','content-type':'application/json'},body:JSON.stringify({companyId:cid,id:code.id})}));
  assert.equal(deletedCode.status,200,await deletedCode.clone().text());
  const removedAttachments=await attachments.GET(new Request(`https://app.test/api/attachments?companyId=${cid}&entityType=vat_code&entityId=${code.id}`));
  assert.equal((await removedAttachments.json()).attachments.length,0);
 } finally { delete globalThis.__reportTestUser; }
});

test('inventory filters keep quantities, summaries and downloads on the same row set', async () => {
  const { filterInventoryReportRows, inventorySummary, inventoryColumnTotal, inventoryAssetAccountLink } = await vite.ssrLoadModule('/lib/inventory-report.ts');
  const rows = [{ name: 'Laptop A', sku: 'A1', account: 'Stock A', status: 'Low Stock', quantity: 2.5, cost: 100, value: 250 }, { name: 'Laptop B', sku: 'B1', account: 'Stock B', status: 'In Stock', quantity: 10, cost: 200, value: 2000 }, { name: 'Monitor', sku: 'M1', account: 'Stock A', status: 'Low Stock', quantity: 1, cost: 50, value: 50 }];
  const columns = [{ key: 'name', label: 'Item' }, { key: 'sku', label: 'SKU' }, { key: 'account', label: 'Account' }, { key: 'quantity', label: 'Quantity' }, { key: 'cost', label: 'Average cost', type: 'money' }, { key: 'value', label: 'Value', type: 'money' }];
  const filtered = filterInventoryReportRows(rows, columns, { query: 'laptop', account: 'Stock A', status: 'Low Stock', sort: 'value' });
  assert.deepEqual(filtered, [rows[0]]);
  assert.equal(inventorySummary({ key: 'inventory-valuation-detail', rows: filtered }).cards[0].value, 250);
  assert.equal(inventoryColumnTotal(filtered, columns[3]), 2.5);
  assert.equal(inventoryColumnTotal(filtered, columns[4]), null); // Unit costs must never be added together.
  assert.equal(filterInventoryReportRows(rows, columns, { query: '', account: '', status: '', sort: 'quantity' })[0].name, 'Monitor');
  assert.equal(rows[0].name, 'Laptop A'); // Sorting must not mutate the API result.
  const accounts = [{ id: 1, code: '1200', name: 'Inventory Asset', systemRole: 'INVENTORY', currency: 'AED', active: true }, { id: 2, code: '1201', name: 'Warehouse Stock', systemRole: '', currency: 'AED', active: false }];
  assert.deepEqual(inventoryAssetAccountLink({ assetAccountId: 2 }, accounts, 'AED'), { account: '1201 · Warehouse Stock', accountAccountId: 2 });
  assert.equal(inventoryAssetAccountLink({ assetAccountId: 999 }, accounts, 'AED').accountAccountId, 0);
  assert.equal(inventoryAssetAccountLink({ assetAccountId: null }, accounts, 'AED').accountAccountId, 1);
  const { reportCsv, reportWorkbook, reportPdf } = await vite.ssrLoadModule('/lib/report-export.ts');
  const report = { key: 'inventory-valuation-detail', title: 'Stock Valuation Detail', generatedAt: '2026-10-03T08:00:00.000Z', currency: 'AED', columns, rows };
  const csv = reportCsv(report, 'QA Company', 'Main', filtered);
  assert.ok(csv.includes('Laptop A')); assert.ok(!csv.includes('Laptop B')); assert.ok(csv.includes('Summary')); assert.ok(csv.includes('250'));
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await reportWorkbook(report, 'QA Company', 'Main', filtered));
  assert.equal(workbook.getWorksheet('Report').getCell('D10').value, 2.5);
  assert.equal(workbook.getWorksheet('Report').getCell('E11').value, '');
  assert.equal(workbook.getWorksheet('Inventory summary').getCell('B7').value, 250);
  for (const orientation of ['portrait', 'landscape']) {
    const pdf = Buffer.from(await reportPdf(report, 'QA Company', 'Main', filtered, undefined, orientation)).toString('latin1');
    const box = pdf.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/); assert.ok(box);
    assert.ok(Math.abs(Number(box[1]) - (orientation === 'portrait' ? 595.28 : 841.89)) < 0.01);
    assert.ok(pdf.includes('Summary'));
  }
});


test("purchase receiving reports show outstanding allocations and consistent commitments", async () => {
  const result = await workspaces.POST(post({ type: "company", name: "PO reporting allocations", baseCurrency: "AED" }));
  const { company: c } = await result.json(); const cid = c.id, lid = c.locations[0].id;
  const ap = (await database.query("SELECT name FROM accounts WHERE company_id=$1 AND system_role='AP'", [cid])).rows[0].name;
  const po = (await database.query("INSERT INTO transactions(company_id,location_id,number,type,party,account,transaction_date,status,subtotal,vat_amount,total,base_total) VALUES ($1,$2,'PO-REMAIN','purchase order','Allocation Supplier',$3,'2026-09-20','partially received',1000,50,1050,1050) RETURNING id", [cid,lid,ap])).rows[0].id;
  const line = (await database.query("INSERT INTO transaction_lines(transaction_id,description,quantity,unit_price,subtotal,vat_amount,total) VALUES ($1,'Allocation Laptop',10,100,1000,50,1050) RETURNING id", [po])).rows[0].id;
  const receipt = (await database.query("INSERT INTO transactions(company_id,location_id,number,type,party,transaction_date,purchase_order_id) VALUES ($1,$2,'AFTER-PERIOD-RECEIPT','bill','Allocation Supplier','2026-10-01',$3) RETURNING id", [cid,lid,po])).rows[0].id;
  await database.query("INSERT INTO purchase_receipt_allocations(receipt_id,order_line_id,quantity) VALUES ($1,$2,4.25)", [receipt,line]);
  const get = async (key) => {const response = await GET(new Request(`https://app.test/api/reports?type=${key}&companyId=${cid}&locationId=${lid}&periodStart=2026-09-01&periodEnd=2026-09-30`));assert.equal(response.status,200);return (await response.json()).report;};
  const detail = await get("open-purchase-orders-detail");
  assert.equal(detail.rows[0].quantity,5.75); assert.equal(detail.rows[0].amount,575); assert.equal(detail.rows[0].receivedQuantity,4.25);
  assert.equal(detail.rows[0].orderedQuantity,10); assert.equal(detail.rows[0].unitCost,100); assert.ok(detail.rows[0].accountAccountId > 0);
  assert.equal((await get("open-purchase-orders")).rows[0].amount,575);
  assert.equal((await get("open-purchase-orders-job")).rows[0].amount,575);
  await database.query("UPDATE transactions SET status='void' WHERE id=$1",[po]);
  assert.equal((await get("open-purchase-orders-detail")).rows.length,0);
  const counts=(await get("purchase-order-summary")).rows.find(row=>row.supplier==='Allocation Supplier'); assert.equal(counts.closed,1);assert.equal(counts.totalOrders,1);assert.equal(counts.open,0);
});

test("purchase filters and exports preserve fractions, totals and account identity", async () => {
  const {emptyPurchaseFilters,filterPurchaseReportRows,purchaseColumnTotal,purchaseDocumentAccount,purchaseSummary} = await vite.ssrLoadModule('/lib/purchase-report.ts');
  const {reportCsv,reportWorkbook,reportPdf}=await vite.ssrLoadModule('/lib/report-export.ts');
  const columns=[{key:'supplier',label:'Supplier'},{key:'number',label:'Bill No.'},{key:'item',label:'Item'},{key:'account',label:'Payable account'},{key:'quantity',label:'Quantity'},{key:'unitCost',label:'Unit cost',type:'money'},{key:'total',label:'Total',type:'money'}];
  const rows=[{supplier:'Selected Supplier',number:'B-001',item:'Fractional Laptop',account:'2100 · USD Payable',quantity:2.5,unitCost:100,total:250,status:'open'},{supplier:'Other Supplier',number:'B-002',item:'Other Laptop',account:'2100 · AED Payable',quantity:1,unitCost:300,total:300,status:'paid'}];
  const report={key:'purchases-by-item-detail',title:'Purchases by Item Detail',generatedAt:'2026-10-03T08:00:00Z',currency:'AED',columns,rows};
  const selected=filterPurchaseReportRows(rows,columns,{...emptyPurchaseFilters,query:'laptop',supplier:'Selected Supplier',account:'2100 · USD Payable',status:'open'},report.key);
  assert.equal(selected.length,1);assert.equal(purchaseSummary({...report,rows:selected}).cards[0].value,250);
  assert.equal(purchaseColumnTotal(selected,columns[4]),2.5);assert.equal(purchaseColumnTotal(selected,columns[5]),null);
  assert.equal(filterPurchaseReportRows(rows,columns,{...emptyPurchaseFilters,sort:'amount'})[0].number,'B-002');assert.equal(rows[0].number,'B-001');
  const accounts=[{id:1,code:'2100',name:'Payable',currency:'AED',systemRole:'AP'},{id:2,code:'2101',name:'Payable',currency:'USD',systemRole:'AP'}];
  assert.equal(purchaseDocumentAccount({id:4,type:'bill',account:'Wrong saved default',currency:'USD'},[{transactionId:4,account:'Payable',credit:250}],accounts).accountAccountId,2);
  assert.equal(purchaseDocumentAccount({id:4,type:'bill',account:'Payable',currency:'USD'},[],accounts).accountAccountId,0);
  assert.equal(purchaseDocumentAccount({id:4,type:'purchase order',account:'Removed Account',currency:'USD'},[],accounts).accountAccountId,0);
  const csv=reportCsv(report,'Test Company','Main',selected);assert.match(csv,/Summary/);assert.match(csv,/Report total/);assert.doesNotMatch(csv,/Other Supplier/);
  const ExcelJS=(await import('exceljs')).default;const book=new ExcelJS.Workbook();await book.xlsx.load(await reportWorkbook(report,'Test Company','Main',selected));
  assert.equal(book.getWorksheet('Report').getCell('E10').value,2.5);assert.equal(book.getWorksheet('Report').getCell('F11').value,'');assert.equal(book.getWorksheet('Purchases summary').getCell('B7').value,250);
  for(const orientation of ['portrait','landscape']) {const pdf=Buffer.from(await reportPdf(report,'Test Company','Main',selected,undefined,orientation)).toString('latin1');assert.match(pdf,/Summary/);assert.match(pdf,/Report total/);const page=pdf.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);assert.ok(page);assert.ok(orientation==='portrait'?Number(page[1])<Number(page[2]):Number(page[1])>Number(page[2]));}
});


test("Sales daily headers and order allocations reconcile without duplicate document numbers", async () => {
  const created=await workspaces.POST(post({type:'company',name:'Sales report allocation audit',baseCurrency:'AED'}));const {company:c}=await created.json();const cid=c.id,lid=c.locations[0].id;
  const ids=[];
  for(const subtotal of [100,200]){ids.push((await database.query("INSERT INTO transactions(company_id,location_id,number,type,party,transaction_date,subtotal,vat_amount,total,base_total) VALUES ($1,$2,'SAME-NUMBER','invoice','Daily Customer','2026-09-20',$3,$4,$5,$5) RETURNING id",[cid,lid,subtotal,subtotal*.05,subtotal*1.05])).rows[0].id);}
  await database.query("INSERT INTO transaction_lines(transaction_id,description,quantity,subtotal,vat_amount,total,is_freight_charge) VALUES ($1,'Freight only',1,100,5,105,true)",[ids[0]]);
  const get=async key=>{const response=await GET(new Request(`https://app.test/api/reports?type=${key}&companyId=${cid}&locationId=${lid}&periodStart=2026-09-01&periodEnd=2026-09-30`));assert.equal(response.status,200);return (await response.json()).report;};
  const daily=(await get('daily-sales-summary')).rows[0];assert.equal(daily.documents,2);assert.equal(daily.sales,300);assert.equal(daily.vat,15);assert.equal(daily.total,315);assert.equal(daily.quantity,0);
  assert.equal((await get('daily-sales-detail')).rows.reduce((total,row)=>total+row.amount,0),300);
  const order=(await database.query("INSERT INTO transactions(company_id,location_id,number,type,party,transaction_date,status,total,base_total,account) VALUES ($1,$2,'SO-REMAIN','sales order','Order Customer','2026-09-22','partially invoiced',1000,1000,'Accounts Receivable') RETURNING id",[cid,lid])).rows[0].id;
  const source=(await database.query("INSERT INTO transaction_lines(transaction_id,description,quantity,subtotal) VALUES ($1,'Order Laptop',10,1000) RETURNING id",[order])).rows[0].id;
  const invoice=(await database.query("INSERT INTO transactions(company_id,location_id,number,type,party,transaction_date,sales_source_id) VALUES ($1,$2,'AFTER-PERIOD-SALE','invoice','Order Customer','2026-10-01',$3) RETURNING id",[cid,lid,order])).rows[0].id;
  await database.query("INSERT INTO sales_invoice_allocations(invoice_id,source_line_id,quantity) VALUES ($1,$2,4.25)",[invoice,source]);
  const row=(await get('sales-orders')).rows.find(row=>row.number==='SO-REMAIN');assert.equal(row.quantity,10);assert.equal(row.fulfilledQuantity,4.25);assert.equal(row.remainingQuantity,5.75);assert.ok(row.accountAccountId>0);
});

test("Sales filters, duplicate removal, account identities and downloads remain consistent", async()=>{
 const {salesReportKeys,salesReportGroups,uniqueSalesReports,emptySalesFilters,filterSalesReportRows,salesColumnTotal,salesDocumentAccounts,salesSummary}=await vite.ssrLoadModule('/lib/sales-report.ts');
 assert.deepEqual(new Set(salesReportGroups.flatMap(group=>group.keys)),salesReportKeys);assert.equal(salesReportGroups.flatMap(group=>group.keys).length,12);assert.equal(uniqueSalesReports([{key:'sales-by-item'},{key:'sales-by-item'},{key:'sales-orders'}]).length,2);
 const columns=[{key:'customer',label:'Customer'},{key:'number',label:'Invoice'},{key:'item',label:'Item'},{key:'account',label:'Receivable Account'},{key:'quantity',label:'Quantity'},{key:'unitPrice',label:'Unit Price',type:'money'},{key:'amount',label:'Sales ex VAT',type:'money'}];
 const rows=[{customer:'Selected Customer',number:'INV-A',item:'Fractional Laptop',salesman:'Rep A',account:'1100 · USD Receivable',status:'open',quantity:2.5,unitPrice:100,amount:250},{customer:'Other Customer',number:'INV-B',item:'Other Laptop',salesman:'Rep B',account:'1100 · AED Receivable',status:'paid',quantity:1,unitPrice:300,amount:300}];
 const report={key:'sales-by-item-detail',title:'Sales by Item Detail',generatedAt:'2026-10-03T08:00:00Z',currency:'AED',columns,rows};const selected=filterSalesReportRows(rows,columns,{...emptySalesFilters,query:'laptop',customer:'Selected Customer',salesman:'Rep A',account:'1100 · USD Receivable',status:'open'},report.key);
 assert.equal(selected.length,1);assert.equal(salesSummary({...report,rows:selected}).cards[0].value,250);assert.equal(salesColumnTotal(selected,columns[4]),2.5);assert.equal(salesColumnTotal(selected,columns[5]),null);assert.equal(filterSalesReportRows(rows,columns,{...emptySalesFilters,sort:'amount'})[0].number,'INV-B');assert.equal(rows[0].number,'INV-A');
 const accounts=[{id:1,code:'1100',name:'Receivable',currency:'AED',systemRole:'AR',type:'Accounts Receivable'},{id:2,code:'1101',name:'Receivable',currency:'USD',systemRole:'AR',type:'Accounts Receivable'},{id:3,code:'3000',name:'Sales',currency:'AED',systemRole:'SALES',type:'Income'},{id:4,code:'1200',name:'Inventory Asset',currency:'AED',systemRole:'INVENTORY',type:'Other Current Asset'},{id:5,code:'4000',name:'Cost of Goods Sold',currency:'AED',systemRole:'COGS',type:'Cost of Goods Sold'}];
 const tx={id:7,type:'invoice',account:'Wrong current default',currency:'USD'};const linked=salesDocumentAccounts(tx,[{transactionId:7,account:'Receivable',debit:250,credit:0},{transactionId:7,account:'Sales',debit:0,credit:250},{transactionId:7,account:'Cost of Goods Sold',debit:100,credit:0},{transactionId:7,account:'Inventory Asset',debit:0,credit:100}],accounts);assert.equal(linked.accountAccountId,2);assert.equal(linked.revenueAccountAccountId,3);assert.equal(salesDocumentAccounts(tx,[],accounts).accountAccountId,0);
 const {reportCsv,reportWorkbook,reportPdf}=await vite.ssrLoadModule('/lib/report-export.ts');const csv=reportCsv(report,'Test Company','Main',selected);assert.match(csv,/Summary/);assert.match(csv,/Report total/);assert.doesNotMatch(csv,/Other Customer/);
 const ExcelJS=(await import('exceljs')).default;const book=new ExcelJS.Workbook();await book.xlsx.load(await reportWorkbook(report,'Test Company','Main',selected));assert.equal(book.getWorksheet('Report').getCell('E10').value,2.5);assert.equal(book.getWorksheet('Report').getCell('F11').value,'');assert.equal(book.getWorksheet('Sales summary').getCell('B7').value,250);
 for(const orientation of ['portrait','landscape']){const pdf=Buffer.from(await reportPdf(report,'Test Company','Main',selected,undefined,orientation)).toString('latin1');assert.match(pdf,/Report total/);const page=pdf.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);assert.ok(page);assert.ok(orientation==='portrait'?Number(page[1])<Number(page[2]):Number(page[1])>Number(page[2]));}
 assert.equal(salesSummary({key:'pending-sales',rows:[{customer:'A',dueDate:'',amount:1},{customer:'B',dueDate:'2000-01-01',amount:2}]}).cards[3].value,1);
});

test("Sales stamp dragging uses A4 scaling and clamps portrait/landscape positions",async()=>{
 const {moveReportStamp,reportStampPage}=await vite.ssrLoadModule('/lib/report-stamp.ts');
 assert.deepEqual(moveReportStamp('portrait',50,60,21,29.7,210),{left:71,top:90});
 assert.deepEqual(moveReportStamp('portrait',50,60,42,59.4,420),{left:71,top:90});
 assert.deepEqual(moveReportStamp('landscape',240,159,100,100,297),{left:242,top:160});
 assert.deepEqual(moveReportStamp('portrait',1,1,-100,-100,210),{left:0,top:0});assert.equal(reportStampPage('landscape').width,297);
});


test("Sales PDF uses the selected movable stamp coordinates on both A4 orientations",async()=>{
 const {reportPdf}=await vite.ssrLoadModule('/lib/report-export.ts');
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAABzCAIAAACQB577AAAGgklEQVR4nO2da0wcRRzA/8e9kFawlb6gLcejRUo5bWlLTFEQCyEhaSOJBhrTRKwNHzAx8UPRSHwk1PKB2Bib1EeN0VibiCVaxZhUwqNGsZqGUqmShleEFkOrrQkJB3vnh02O9W5vb293dnZm+P/Ch7u9vb2Z/4//zNze7owjFAoBIi5JdhcAsRYULDguuwtAnvRDbWbePvvxUVIlYQEH132wSZf64dc6T4Kp6dQDL8pZF8yU1FiwLJtRwWa8mgy3jR9tBWwJTjS41ALKbMHiwoRg/eFjJHAcFdhmwXoiZXuMtGG8CvYIjhsUxqXGgsF60RasHQJOvUbDTjXpCWanztRgoco0BGvUU0iv0dgYAWsFo1oltkTDQsGx6rMM1SqhHBZLBKPauFALEXnBqkVHtapQiBVJwajWGJbGjdgVHWjXMKpRIvUzGpkMji4NqjWAFWE0KxgTlyzE42lKMCauRRAMrPE+GO1aR3QkDXfJBgWjXash5diIYLRLByKOE+6DIz4D1VLATMwTy2C0awsRcU4ojxMQjHZtxLBjg4MstEsfYzHXK5iLC9CXFTqN6BKMjTMjGGio4wtGu0yRqOPE+mC0ywIkvyYp/0HQLjsoXWgnsZZgHFjxgoYpvU00pi9r6DQSUzCmL1/E8qUrgzF92USPF3XBOLbihbijLZxGSXBUBGP68oV2EmMGC06kYBw8806EQa0MxvaZFzRMYRMtOP8TjO2zGCg9xsxgbJ/5IpYvbmab/aRn8MPvL69M9qxI9rQ/U5W5OhUAzvQNfXDhV4/LGViUjlTtqivdDgCZz7ZX78g73XRAfmPjqfPnL41MnX5RfmlXXsaXL9XLL+U0nhg99QIAbDzcvjNng7yxeueWrDVp7373CwAMjPxZsnUjAByuLN6/O59ylYnAh+Ceq+Nf/Dj8bcvTyR7XhSujTe91dTbXdQ+Nfdp7pbO5Pi3Fe2du/mB7x4ZVK8sKfV638/qNW1Iw5ExyhEIw/tc/XrdTPo7X7ZSk4A/XJvcWbFYe3+NyfvXyQeWWmuKtAJDTeCJiO3fwMcg62fXzK0+WJXtcALDPn+Nbe9+CFHyna+C1+vK0FC8ApKV4X60rf/vrAXl/v2/95dEbAHB1cmbbprXKQx2tLT1+7iL1GtjGkmCWT2D9PjXr960LP32rodrtTBqZvuXPWtr4oG/dH9Oz8uOKouzuoTEA6B4aqyjKVh7qkW1ZAHDx2iSNctNF9ZQWHxksBYNx9wmFwAEO+XF5UXbfb+MA0D88UVaYFbFnc23p8XP9yi2BRWn/sTPy36XrU2QKzQZ89MG561cPTcwU52YAQCgETe9/c/JITX5G+uD4zJ4tmfI+gxM3H8hMlx+vWpHscDimbt8FgHvv8UYcbW/BZmdSUv/wRHhLdB8sDHxkcMO+Hcc6+gOLEgB0/jQcWJAAoKlmz+tne+7OzQPAnbn5N872Pl9TEn7L4/6c1s/7ygp9qgdsri1tWx49MR8Z/ERJwejNvytaPro/NWVNakrboSoAeGx79vTtfw+8+ZnX7QwsSs9VFj+qaI0rH8pt7ejta21QPeDD+ZvcLuf8giQ/lZto+fHuvMyWp8osrhA9lu4uZHmQhegkWiIfTTRiGBQsOChYcFCw4KBgwUHBgrMkWP/9TAibqH7RxQwWHBQsOChYcPDuQkHQdXchnoIWA6VHbKIFB6dwEIEEpnDAVpp3IgxiEy04KoLxlBZfaF+pgRksOOqCMYl5Ie6FVkYmI0UYwdRkpDic5otYvnC+aF4hMF80JjEvGJ/CAUdbbKL/InZTq64gtkB41RUza7ogxEl0An4jk5GiY7swsLwCzhfNK2bni9YGk5g+li9OiQ21jRhe+8bUqivomA5mVjYysgI4Li9LDfOhNtIHE1yfGtGASCIRW5wSHZOFVDNp/Ad/dGwdBDtBI32wdlHMlAYhHk+zgmVw2EUEK8JIRjBgKpvDuugRu+hOtTTYK+vB0twglsFhMJX1QyFW5AVD7MRFzWGohcgSwTKoWRXKYbFQMGj2wctQsy3RsFawDGq2MQI0BMtoj6iFNM1ClekJlmGhzhRgp5q0BcvE/X7MqWkG62WP4DB6zoQwLpvxKtgsWEb/CS9GZHNUYCYEh0n01Ca18DFbsLiwJTiMmZPYJoNr40dbAaOCw3DxcwWDXsOwLlgJU7JZlqqEJ8HRUFPOi85o+Basiknr/LpURUDBiBKcRklw/gOsnh06VX+7QAAAAABJRU5ErkJggg==';
 const previousImage=globalThis.Image,previousDocument=globalThis.document;
 globalThis.Image=class {naturalWidth=160;naturalHeight=115;set src(_value){queueMicrotask(()=>this.onload());}};
 globalThis.document={createElement:()=>({getContext:()=>({drawImage(){}}),toDataURL:()=>png})};
 try {
  const report={key:'sales-by-customer',title:'Sales by Customer',generatedAt:'2026-10-03T08:00:00Z',currency:'AED',columns:[{key:'name',label:'Customer'},{key:'amount',label:'Sales',type:'money'}],rows:[{name:'A',amount:100}]};
  for(const orientation of ['portrait','landscape']){
   const pdf=Buffer.from(await reportPdf(report,'Company','Inventory',report.rows,{data:png,left:40,top:50},orientation)).toString('latin1');
   const matrices=[...pdf.matchAll(/([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm\n\/I\d+ Do/g)];assert.equal(matrices.length,1);
   const matrix=matrices[0],point=72/25.4,height=orientation==='portrait'?297:210;
   assert.ok(Math.abs(Number(matrix[1])-32*point)<.01);assert.ok(Math.abs(Number(matrix[2])-23*point)<.01);assert.ok(Math.abs(Number(matrix[3])-40*point)<.01);assert.ok(Math.abs(Number(matrix[4])-(height-50-23)*point)<.02);
  }
 } finally {if(previousImage===undefined)delete globalThis.Image;else globalThis.Image=previousImage;if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});

test('VAT detail signs, freight, code groups, actual account links and review reasons stay consistent', async () => {
 const {buildVatReport,vatSummary,vatColumnTotal,emptyVatFilters,filterVatRows,vatReportKeys,vatReportGroups}=await vite.ssrLoadModule('/lib/vat-report.ts');
 const codes=[{code:'STANDARD',name:'Standard',rate:5,description:'Taxable',active:true},{code:'ZERO',name:'Zero rated',rate:0,description:'Zero',active:true}];
 const accounts=[{id:1,code:'2100',name:'Output VAT',currency:'AED',systemRole:'OUTPUT_VAT'},{id:2,code:'1200',name:'Input VAT',currency:'AED',systemRole:'INPUT_VAT'}];
 const line=(transactionId,type,subtotal,vatAmount,extra={})=>({lineId:transactionId,transactionId,itemId:42,date:'2026-10-03',number:'VAT-'+transactionId,type,party:'VAT Customer',description:'Same item',vatCode:'STANDARD',vatRate:5,quantity:2.5,unitPrice:40,subtotal,freightCharge:0,vatAmount,exchangeRate:1,transactionCurrency:'AED',isImport:false,isFreightCharge:false,...extra});
 const lines=[line(1,'invoice',100,6,{freightCharge:20}),line(2,'credit memo',25,1.25),line(3,'bill',200,10),line(4,'vendor credit',40,2),line(5,'bill',100,5,{isImport:true}),line(6,'invoice',100,0,{vatCode:'ZERO',vatRate:0}),line(7,'invoice',100,5,{vatCode:'MISSING'}),line(8,'invoice',100,3,{vatRate:3})];
 const journal=[{transactionId:1,account:'Output VAT',debit:0,credit:6},{transactionId:2,account:'Output VAT',debit:1.25,credit:0},{transactionId:3,account:'Input VAT',debit:10,credit:0},{transactionId:4,account:'Input VAT',debit:0,credit:2},{transactionId:5,account:'Input VAT',debit:5,credit:0},{transactionId:5,account:'Output VAT',debit:0,credit:5}];
 const detail=buildVatReport('vat-detail',lines,accounts,journal,codes,17.75,13);
 assert.equal(detail.rows[0].taxable,120);assert.equal(detail.rows[0].accountAccountId,1);assert.equal(detail.rows[1].vat,-1.25);assert.equal(detail.rows[1].quantity,-2.5);assert.equal(detail.rows[3].taxable,-40);assert.equal(detail.rows[4].accountTransactionId,5);assert.equal(detail.rows[4].accountAccountId,0);assert.equal(detail.rows[5].account,'No VAT posting');
 const exceptions=buildVatReport('vat-exceptions',lines,accounts,journal,codes,0,0);assert.deepEqual(exceptions.rows.map(row=>row.number),['VAT-7','VAT-8']);assert.match(exceptions.rows[1].issue,/Saved rate differs/);
 const bad=buildVatReport('vat-exceptions',[line(9,'credit memo',100,6)],accounts,[],codes,0,0);assert.equal(bad.rows[0].expected,-5);assert.equal(bad.rows[0].posted,-6);assert.equal(bad.rows[0].difference,-1);
 const groups=buildVatReport('vat-item-summary',lines,accounts,journal,codes,0,0);assert.ok(groups.rows.filter(row=>row.name==='Same item').length>3);assert.equal(groups.rows.filter(row=>row.code==='STANDARD'&&row.direction==='Output'&&row.rate==='5%')[0].taxable,95);
 const summary=buildVatReport('vat-summary',[],accounts,[],codes,17.75,13);assert.equal(vatSummary({key:'vat-summary',rows:summary.rows}).cards[2].value,4.75);assert.equal(vatColumnTotal(summary.rows,{key:'amount',type:'money'}),null);
 const selected=filterVatRows(detail.rows,detail.columns,{...emptyVatFilters,code:'STANDARD',direction:'Output',account:'2100 · Output VAT'});assert.deepEqual(selected.map(row=>row.number),['VAT-1','VAT-2']);assert.equal(vatColumnTotal(selected,{key:'quantity'}),0);assert.equal(vatColumnTotal(selected,{key:'unitPrice',type:'money'}),null);assert.equal(vatColumnTotal(selected,{key:'rate'}),null);
 const ambiguous=buildVatReport('vat-detail',[lines[0]],[...accounts,{id:3,code:'2101',name:'Output VAT',currency:'USD',systemRole:'OUTPUT_VAT'}],journal,codes,0,0);assert.equal(ambiguous.rows[0].accountAccountId,0);assert.match(ambiguous.rows[0].account,/review/);
 assert.equal(vatReportKeys.size,7);assert.equal(new Set(vatReportGroups.flatMap(group=>group.keys)).size,7);
 const {reportCsv,reportWorkbook,reportPdf}=await vite.ssrLoadModule('/lib/report-export.ts');const data={...detail,key:'vat-detail',currency:'AED',generatedAt:'2026-10-03T08:00:00Z',period:{label:'October 2026'}};
 const csv=reportCsv(data,'VAT Company','Selected warehouse',selected);assert.match(csv,/Company-wide/);assert.match(csv,/Summary/);assert.match(csv,/Report total/);assert.doesNotMatch(csv,/VAT-3|Selected warehouse/);
 const ExcelJS=(await import('exceljs')).default;const book=new ExcelJS.Workbook();await book.xlsx.load(await reportWorkbook(data,'VAT Company','Selected warehouse',selected,'landscape'));assert.equal(book.getWorksheet('Report').getCell('K10').value,120);assert.equal(book.getWorksheet('Report').getCell('J12').value,'');assert.ok(book.getWorksheet('VAT summary'));assert.equal(book.getWorksheet('Report').pageSetup.orientation,'landscape');
 for(const orientation of ['portrait','landscape']){const pdf=Buffer.from(await reportPdf(data,'VAT Company','Selected warehouse',selected,undefined,orientation)).toString('latin1');assert.match(pdf,/Page 1 of/);assert.match(pdf,/Company-wide/);assert.doesNotMatch(pdf,/Selected warehouse/);const size=pdf.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);assert.ok(size);assert.ok(Math.abs(Number(size[1])-(orientation==='portrait'?595.28:841.89))<.1);}
 assert.doesNotMatch(reportCsv({...summary,key:'vat-summary',currency:'AED',generatedAt:data.generatedAt},'Company','Inventory'),/Report total/);
});

test('VAT API remains company-wide, excludes payment cheques, preserves links and includes taxable freight in filing review', async () => {
 const c=(await(await workspaces.POST(post({type:'company',name:'VAT report design audit',baseCurrency:'AED'}))).json()).company;const cid=c.id,loc=c.locations[0].id;
 const [other]=await db.insert(schema.inventoryLocations).values({companyId:cid,name:'VAT Other',code:'VATO'+cid,invoicePrefix:'VATO'+cid}).returning();
 const accountRows=(await db.select().from(schema.accounts)).filter(row=>row.companyId===cid);const out=accountRows.find(row=>row.systemRole==='OUTPUT_VAT'),input=accountRows.find(row=>row.systemRole==='INPUT_VAT');
 const add=async(type,number,subtotal,vatAmount,extra={})=>{const [record]=await db.insert(schema.transactions).values({companyId:cid,locationId:extra.locationId||loc,type,number,party:'VAT source',transactionDate:'2026-10-03',currency:'USD',exchangeRate:2,subtotal,vatAmount,total:subtotal+vatAmount,baseTotal:(subtotal+vatAmount)*2,status:extra.status||'open',billId:extra.billId||null}).returning();await db.insert(schema.transactionLines).values({transactionId:record.id,description:'Taxable item',quantity:2.5,unitPrice:40,subtotal,freightCharge:extra.freightCharge||0,vatAmount,total:subtotal+vatAmount,vatCode:extra.vatCode||'STANDARD',vatRate:5});if(!extra.status){const [entry]=await db.insert(schema.journalEntries).values({companyId:cid,locationId:record.locationId,entryDate:'2026-10-03',reference:number,transactionId:record.id,posted:true}).returning();const control=['invoice','credit memo'].includes(type)?out:input;await db.insert(schema.journalLines).values({journalEntryId:entry.id,accountName:control.name,debit:type==='credit memo'||type==='bill'?vatAmount*2:0,credit:type==='invoice'||type==='vendor credit'?vatAmount*2:0});}return record;};
 const invoice=await add('invoice','VAT-FREIGHT',100,6,{freightCharge:20,locationId:other.id});await add('credit memo','VAT-REFUND',20,1);const bill=await add('bill','VAT-PURCHASE',100,5);await add('vendor credit','VAT-PURCHASE-RETURN',20,1);await add('cheque','VAT-PAYMENT',100,5,{billId:bill.id});await add('invoice','VAT-VOID',100,5,{status:'void'});
 const get=async(type)=>{const response=await GET(new Request(`https://app.test/api/reports?type=${type}&companyId=${cid}&locationId=${loc}&periodStart=2026-10-01&periodEnd=2026-10-31`));assert.equal(response.status,200);return(await response.json()).report;};
 const detail=await get('vat-detail');assert.equal(detail.rows.length,4);const freight=detail.rows.find(row=>row.transactionId===invoice.id);assert.equal(freight.taxable,240);assert.equal(freight.accountAccountId,out.id);assert.equal(detail.rows.find(row=>row.number==='VAT-REFUND').vat,-2);assert.ok(detail.vatCodes.some(code=>code.code==='STANDARD'));
 const summary=await get('vat-summary');assert.equal(summary.rows.find(row=>row.position==='output').amount,10);assert.equal(summary.rows.find(row=>row.position==='input').amount,8);assert.equal(summary.rows.find(row=>row.position==='net').amount,2);assert.equal((await get('vat-exceptions')).rows.length,0);
 const management=await vite.ssrLoadModule('/app/api/vat-management/route.ts');const review=await management.GET(new Request(`https://app.test/api/vat-management?companyId=${cid}&periodStart=2026-10-01&periodEnd=2026-10-31`));assert.equal(review.status,200);const tax=(await review.json()).summary;assert.equal(tax.boxes.box1.amount,200);assert.equal(tax.exceptionLines,0);assert.equal(tax.outputVat,10);
 try{globalThis.__reportTestUser={id:2,role:'viewer',companyIds:[cid],mustChangePassword:false};assert.equal((await get('vat-detail')).canViewAccounts,false);const forbidden=await GET(new Request(`https://app.test/api/reports?type=vat-detail&companyId=${companyId}`));assert.equal(forbidden.status,403);}finally{delete globalThis.__reportTestUser;}
});

test("vendor filters, chronological balances, additive totals and native-currency exports stay consistent", async () => {
  const { vendorReportGroups, vendorReportKeys, vendorDocumentAccount, filterVendorReportRows, emptyVendorFilters, vendorColumnTotal, vendorSummary } = await vite.ssrLoadModule('/lib/vendor-report.ts');
  const { reportCsv, reportWorkbook, reportPdf } = await vite.ssrLoadModule('/lib/report-export.ts');
  const groups=vendorReportGroups.flatMap(group=>group.keys);assert.equal(groups.length,10);assert.equal(new Set(groups).size,10);assert.deepEqual(new Set(groups),vendorReportKeys);
  const accounts=[{id:1,code:'2000',name:'Trade AP',currency:'AED',type:'Accounts Payable',systemRole:'AP'},{id:2,code:'2001',name:'Trade AP',currency:'USD',type:'Accounts Payable',systemRole:'AP'},{id:3,code:'1000',name:'Bank',currency:'USD',type:'Bank'}];
  const transaction={id:10,type:'bill',account:'Wrong saved account',currency:'USD'};const journal=[{transactionId:10,account:'Trade AP',debit:0,credit:367}];assert.equal(vendorDocumentAccount(transaction,journal,accounts).accountAccountId,2);
  assert.equal(vendorDocumentAccount(transaction,journal,[...accounts,{...accounts[1],id:4,code:'2002'}]).accountAccountId,0);assert.equal(vendorDocumentAccount(transaction,[],accounts).accountAccountId,0);
  assert.equal(vendorDocumentAccount({...transaction,type:'purchase order'},[],accounts).accountAccountId,0);
  assert.equal(vendorDocumentAccount({...transaction,type:'bill payment'},[{transactionId:10,account:'Trade AP',debit:367,credit:0},{transactionId:10,account:'Bank',debit:0,credit:367}],accounts).accountAccountId,2);
  const columns=[{key:'supplier',label:'Supplier'},{key:'date',label:'Date'},{key:'number',label:'Reference'},{key:'status',label:'Status'},{key:'account',label:'Account'},{key:'quantity',label:'Quantity'},{key:'unitPrice',label:'Unit price',type:'money'},{key:'charge',label:'Charges',type:'money'},{key:'payment',label:'Credits',type:'money'},{key:'balance',label:'Running balance',type:'money'}];
  const rows=[{supplier:'A',transactionId:1,date:'2026-10-01',number:'BILL-A',type:'bill',status:'open',account:'Trade AP',charge:100,payment:0,balance:100,age:2,quantity:2.123456,unitPrice:47.09},{supplier:'A',transactionId:2,date:'2026-10-02',number:'PAY-A',type:'bill payment',status:'paid',account:'Trade AP',charge:0,payment:40,balance:60,age:0,quantity:0,unitPrice:0},{supplier:'B',transactionId:3,date:'2026-10-01',number:'BILL-B',type:'bill',status:'open',account:'Other AP',charge:200,payment:0,balance:200,age:0,quantity:1,unitPrice:200}];
  const selected=filterVendorReportRows(rows,columns,{...emptyVendorFilters,supplier:'A',account:'Trade AP',sort:'date'});assert.deepEqual(selected.map(row=>row.number),['PAY-A','BILL-A']);assert.equal(rows[0].number,'BILL-A');assert.equal(vendorSummary({key:'supplier-balance-detail',rows:selected}).cards[2].value,60);
  assert.equal(filterVendorReportRows(rows,columns,{...emptyVendorFilters,overdue:true}).length,1);assert.equal(filterVendorReportRows(rows,columns,{...emptyVendorFilters,type:'bill payment'}).length,1);assert.equal(filterVendorReportRows(rows,columns,{...emptyVendorFilters,query:'BILL-B'}).length,1);
  assert.equal(vendorColumnTotal(selected,columns[9]),null);assert.equal(vendorColumnTotal(selected,columns[6]),null);assert.equal(vendorColumnTotal(selected,columns[7]),100);
  const report={key:'supplier-balance-detail',title:'Supplier Balance Detail',currency:'USD',generatedAt:'2026-10-03T10:00:00Z',columns,rows};const csv=reportCsv(report,'Vendor Company','Main',selected);assert.match(csv,/transaction currency/);assert.match(csv,/Report total/);assert.doesNotMatch(csv,/BILL-B/);
  const ExcelJS=(await import('exceljs')).default;const book=new ExcelJS.Workbook();await book.xlsx.load(await reportWorkbook(report,'Vendor Company','Main',selected,'landscape'));const sheet=book.getWorksheet('Report');assert.equal(sheet.getCell('J12').value,'');assert.equal(sheet.getCell('G12').value,'');assert.equal(sheet.getCell('H12').value,100);assert.equal(sheet.getCell('F11').value,2.123456);assert.match(sheet.getCell('A4').value,/USD transaction currency/);assert.equal(book.getWorksheet('Vendors summary').getCell('B9').value,60);
  for(const orientation of ['portrait','landscape']){const bytes=await reportPdf(report,'Vendor Company','Main',selected,undefined,orientation);const pdf=Buffer.from(bytes).toString('latin1');const dimensions=pdf.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);assert.ok(dimensions);assert.ok(orientation==='portrait'?Number(dimensions[1])<Number(dimensions[2]):Number(dimensions[1])>Number(dimensions[2]));}
});

test("vendor API links posted currency controls, excludes void activity and keeps statement totals", async () => {
 const response=await workspaces.POST(post({type:'company',name:'Vendor Design Audit',baseCurrency:'AED'}));const {company}=await response.json();const cid=company.id,lid=company.locations[0].id;
 const [supplier]=await db.insert(schema.contacts).values({companyId:cid,name:'Design Supplier',type:'vendor',currency:'USD'}).returning();
 const [ap]=await db.insert(schema.accounts).values({companyId:cid,code:'2099',name:'Design USD Payable',type:'Accounts Payable',currency:'USD',systemRole:'AP',active:true}).returning();
 const [bill,credit]=await db.insert(schema.transactions).values([{companyId:cid,locationId:lid,type:'bill',number:'V-DESIGN-BILL',party:supplier.name,account:'Wrong saved payable',currency:'USD',exchangeRate:3.67,transactionDate:'2026-10-01',dueDate:'2026-10-01',subtotal:100,total:100,baseTotal:367},{companyId:cid,locationId:lid,type:'vendor credit',number:'V-DESIGN-CREDIT',party:supplier.name,currency:'USD',exchangeRate:3.67,transactionDate:'2026-10-02',subtotal:20,total:20,baseTotal:73.4},{companyId:cid,locationId:lid,type:'bill',status:'void',number:'V-DESIGN-VOID',party:supplier.name,currency:'USD',exchangeRate:3.67,transactionDate:'2026-10-01',subtotal:500,total:500,baseTotal:1835}]).returning();
 for(const transaction of [bill,credit]){const [entry]=await db.insert(schema.journalEntries).values({companyId:cid,locationId:lid,transactionId:transaction.id,entryDate:transaction.transactionDate,reference:transaction.number,posted:true}).returning();await db.insert(schema.journalLines).values({journalEntryId:entry.id,accountName:ap.name,debit:transaction.id===credit.id?73.4:0,credit:transaction.id===bill.id?367:0});}
 const [prior]=await db.insert(schema.transactions).values({companyId:cid,locationId:lid,type:'bill',number:'V-DESIGN-PRIOR',party:supplier.name,currency:'USD',exchangeRate:3.67,transactionDate:'2026-09-01',subtotal:40,total:40,baseTotal:146.8}).returning();const [priorEntry]=await db.insert(schema.journalEntries).values({companyId:cid,locationId:lid,transactionId:prior.id,entryDate:prior.transactionDate,reference:prior.number,posted:true}).returning();await db.insert(schema.journalLines).values({journalEntryId:priorEntry.id,accountName:ap.name,debit:0,credit:146.8});
 const [bank]=await db.insert(schema.accounts).values({companyId:cid,code:'1099',name:'Design USD Bank',type:'Bank',currency:'USD',active:true}).returning();
 const [expense,payment]=await db.insert(schema.transactions).values([{companyId:cid,locationId:lid,type:'expense',number:'V-DESIGN-CASH',party:supplier.name,account:bank.name,currency:'USD',exchangeRate:3.67,transactionDate:'2026-10-02',subtotal:10,total:10,baseTotal:36.7},{companyId:cid,locationId:lid,type:'cheque',number:'V-DESIGN-PAY',billId:bill.id,party:supplier.name,account:bank.name,currency:'USD',exchangeRate:3.67,transactionDate:'2026-10-02',subtotal:30,total:30,baseTotal:110.1}]).returning();
 for(const transaction of [expense,payment]){const [entry]=await db.insert(schema.journalEntries).values({companyId:cid,locationId:lid,transactionId:transaction.id,entryDate:transaction.transactionDate,reference:transaction.number,posted:true}).returning();await db.insert(schema.journalLines).values({journalEntryId:entry.id,accountName:bank.name,debit:0,credit:transaction.baseTotal});if(transaction.id===payment.id)await db.insert(schema.journalLines).values({journalEntryId:entry.id,accountName:ap.name,debit:110.1,credit:0});}
 await db.insert(schema.transactions).values({companyId:cid,locationId:lid,type:'cheque',status:'void',number:'V-DESIGN-VOID-PAY',billId:bill.id,party:supplier.name,currency:'USD',exchangeRate:3.67,transactionDate:'2026-10-02',total:25,baseTotal:91.75});
 const get=async(type,extra='')=>{const r=await GET(new Request(`https://app.test/api/reports?type=${type}&companyId=${cid}&currency=USD&supplierId=${supplier.id}&periodStart=2026-10-01&periodEnd=2026-10-03${extra}`));assert.equal(r.status,200,await r.clone().text());return(await r.json()).report;};
 const detail=await get('supplier-transactions');assert.deepEqual(detail.rows.map(row=>row.amount),[100,-20,0,-30]);assert.equal(detail.rows.find(row=>row.number===expense.number).accountAccountId,bank.id);assert.ok(detail.rows.filter(row=>row.number!==expense.number).every(row=>row.accountAccountId===ap.id));assert.equal(detail.canViewAccounts,true);
 const balance=await get('vendor-balances');assert.equal(balance.rows[0].amount,90);assert.equal(balance.rows[0].accountAccountId,ap.id);
 const running=await get('supplier-balance-detail');assert.equal(running.rows[0].balance,40);assert.equal(running.rows.at(-1).balance,90);assert.equal(running.rows.length,5);
 const statement=await get('vendor-statements',`&customer=${encodeURIComponent(supplier.name)}&statementDate=2026-10-03`);assert.equal(statement.statement.closing,90);assert.equal(statement.statement.opening,40);assert.equal(statement.statement.charges,100);assert.equal(statement.statement.credits,50);assert.ok(statement.rows.every(row=>row.accountAccountId===ap.id));
 for(const type of ['ap-aging-summary','ap-aging-detail','unpaid-bills-detail','supplier-open-balance']){const report=await get(type);assert.equal(report.rows.length,type==='supplier-open-balance'?2:1);assert.equal(report.rows.reduce((sum,row)=>sum+Number(row.total ?? row.amount),0),type==='supplier-open-balance'?110:70);assert.ok(report.columns.some(column=>column.key==='account'));}
 globalThis.__reportTestUser={id:10,email:'viewer@example.test',role:'viewer',companyIds:[cid],mustChangePassword:false};try{assert.equal((await get('supplier-transactions')).canViewAccounts,false);assert.equal((await get('vendor-statements',`&statementDate=2026-10-03`)).canViewAccounts,false);}finally{delete globalThis.__reportTestUser;}
});
