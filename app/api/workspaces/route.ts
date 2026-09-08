import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { accounts, companies, inventoryLocations, transactions } from "../../../db/schema";
import { requireApiUser } from "@/lib/auth";

const standardAccounts = [
  ["1000", "Business Bank", "Bank", "BANK"], ["1100", "Accounts Receivable", "Accounts Receivable", "AR"],
  ["1200", "Inventory Asset", "Other Current Asset", "INVENTORY"], ["1300", "Recoverable VAT", "Other Current Asset", "INPUT_VAT"],
  ["2000", "Accounts Payable", "Accounts Payable", "AP"], ["2100", "VAT Payable", "Other Current Liability", "OUTPUT_VAT"],
  ["3000", "Opening Balance Equity", "Equity", "EQUITY"], ["4000", "Sales Revenue", "Income", "SALES"],
  ["4100", "Other Income", "Other Income", "OTHER_INCOME"], ["5000", "Cost of Goods Sold", "Cost of Goods Sold", "COGS"],
  ["6000", "Purchases", "Expense", "PURCHASES"], ["6100", "Operating Expenses", "Expense", "EXPENSE"],
  ["6200", "Payroll Expense", "Expense", "PAYROLL"], ["9999", "Suspense", "Other Current Asset", "SUSPENSE"],
] as const;

function message(error: unknown) {
  return error instanceof Error ? error.message : "Could not update companies and inventory locations.";
}

export async function GET(request: Request) {
  const authorization = await requireApiUser(request, "workspace:read");
  if (authorization instanceof Response) return authorization;
  try {
    const db = getDb();
    const [companyRows, locationRows, transactionRows, accountRows] = await Promise.all([
      db.select().from(companies).where(eq(companies.active, true)).orderBy(asc(companies.name)),
      db.select().from(inventoryLocations).where(eq(inventoryLocations.active, true)).orderBy(asc(inventoryLocations.name)),
      db.select().from(transactions),
      db.select({ companyId: accounts.companyId, name: accounts.name, systemRole: accounts.systemRole }).from(accounts),
    ]);
    return Response.json({
      companies: companyRows.map((company) => ({ ...company, locations: locationRows.filter((location) => location.companyId === company.id).map((location) => {
        const activity = transactionRows.filter((transaction) => transaction.companyId === company.id && transaction.locationId === location.id);
        const receivable = activity.reduce((balance, transaction) => transaction.type === "invoice" ? balance + Number(transaction.baseTotal) : ["customer payment", "credit memo"].includes(transaction.type) ? balance - Number(transaction.baseTotal) : balance, 0);
        const apName = accountRows.find((account) => account.companyId === company.id && account.systemRole === "AP")?.name ?? "Accounts Payable";
        const payable = activity.reduce((balance, transaction) => transaction.type === "bill" ? balance + Number(transaction.baseTotal) : ["bill payment", "vendor payment", "vendor credit"].includes(transaction.type) || (transaction.type === "cheque" && transaction.account === apName) ? balance - Number(transaction.baseTotal) : balance, 0);
        return { ...location, receivable, payable };
      }) })),
    });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authorization = await requireApiUser(request, true, true);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const db = getDb();
    if (payload.type === "company") {
      const name = String(payload.name ?? "").trim();
      const baseCurrency = String(payload.baseCurrency ?? "AED").trim().toUpperCase();
      if (!name || !/^[A-Z]{3}$/.test(baseCurrency)) return Response.json({ error: "Company name and a valid currency code are required." }, { status: 400 });
      const [company] = await db.insert(companies).values({ name, baseCurrency }).returning();
      const [location] = await db.insert(inventoryLocations).values({ companyId: company.id, name: "Main Inventory", code: "MAIN", invoicePrefix: "MAIN" }).returning();
      await db.insert(accounts).values(standardAccounts.map(([code, accountName, accountType, systemRole]) => ({ companyId: company.id, code, name: accountName, type: accountType, systemRole })));
      return Response.json({ company: { ...company, locations: [location] } }, { status: 201 });
    }
    const companyId = Number(payload.companyId);
    const name = String(payload.name ?? "").trim();
    const code = String(payload.code ?? "").trim().toUpperCase();
    if (!Number.isInteger(companyId) || !name || !code) return Response.json({ error: "Company, location name and code are required." }, { status: 400 });
    const [location] = await db.insert(inventoryLocations).values({ companyId, name, code, invoicePrefix: code }).returning();
    return Response.json({ location }, { status: 201 });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authorization = await requireApiUser(request, true, true);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    if (payload.type === "invoiceSeries") {
      const companyId = Number(payload.companyId);
      const locationId = Number(payload.locationId);
      const invoicePrefix = String(payload.invoicePrefix ?? "").trim().toUpperCase();
      const nextInvoiceNumber = Number(payload.nextInvoiceNumber);
      if (!Number.isInteger(companyId) || !Number.isInteger(locationId) || !/^[A-Z0-9][A-Z0-9/-]{0,19}$/.test(invoicePrefix) || !Number.isInteger(nextInvoiceNumber) || nextInvoiceNumber < 1 || nextInvoiceNumber > 999999999) {
        return Response.json({ error: "Enter a valid invoice prefix and next invoice number." }, { status: 400 });
      }
      const db = getDb();
      const [location] = await db.update(inventoryLocations).set({ invoicePrefix, nextInvoiceNumber }).where(and(eq(inventoryLocations.id, locationId), eq(inventoryLocations.companyId, companyId))).returning();
      if (!location) return Response.json({ error: "Inventory not found." }, { status: 404 });
      return Response.json({ location });
    }
    const companyId = Number(payload.companyId);
    const baseCurrency = String(payload.baseCurrency ?? "").trim().toUpperCase();
    if (!Number.isInteger(companyId) || !/^[A-Z]{3}$/.test(baseCurrency)) return Response.json({ error: "Company and a valid currency code are required." }, { status: 400 });
    const db = getDb();
    const [company] = await db.update(companies).set({ baseCurrency }).where(eq(companies.id, companyId)).returning();
    if (!company) return Response.json({ error: "Company not found." }, { status: 404 });
    return Response.json({ company });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 500 });
  }
}
