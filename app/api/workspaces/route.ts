import { apiRoute } from "@/lib/api";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { accounts, journalEntries, companies, exchangeRates, inventoryLocations, transactions, vatCodes } from "../../../db/schema";
import { canAccessCompany, requireApiUser } from "@/lib/auth";

const standardAccounts = [
  ["1000", "Business Bank", "Bank", "BANK"], ["1100", "Accounts Receivable", "Accounts Receivable", "AR"],
  ["1200", "Inventory Asset", "Other Current Asset", "INVENTORY"], ["1300", "Recoverable VAT", "Other Current Asset", "INPUT_VAT"],
  ["2000", "Accounts Payable", "Accounts Payable", "AP"], ["2100", "VAT Payable", "Other Current Liability", "OUTPUT_VAT"],
  ["3000", "Opening Balance Equity", "Equity", "EQUITY"], ["4000", "Sales Revenue", "Income", "SALES"],
  ["4100", "Other Income", "Other Income", "OTHER_INCOME"], ["5000", "Cost of Goods Sold", "Cost of Goods Sold", "COGS"],
  ["6000", "Purchases", "Expense", "PURCHASES"], ["6100", "Operating Expenses", "Expense", "EXPENSE"],
  ["6200", "Payroll Expense", "Expense", "PAYROLL"], ["9999", "Suspense", "Other Current Asset", "SUSPENSE"],
] as const;
const standardVatCodes = [
  { code: "STANDARD", name: "Standard rated", rate: 5, description: "Standard UAE VAT rate", system: true },
  { code: "ZERO", name: "Zero rated", rate: 0, description: "Taxable supply charged at 0%", system: true },
  { code: "EXEMPT", name: "Exempt", rate: 0, description: "Supply exempt from VAT", system: true },
  { code: "OUT_OF_SCOPE", name: "Out of scope", rate: 0, description: "Transaction outside the scope of VAT", system: true },
] as const;
const message = (error: unknown) => error instanceof Error ? error.message : "Could not update companies and inventory locations.";

async function handleGET(request: Request) {
  const authorization = await requireApiUser(request, "workspace:read");
  if (authorization instanceof Response) return authorization;
  try {
    const db = getDb();
    if (authorization.role !== "all_admin" && authorization.companyIds.length === 0) return Response.json({ companies: [] });
    const companyRows = authorization.role === "all_admin"
      ? await db.select().from(companies).where(eq(companies.active, true)).orderBy(asc(companies.name))
      : await db.select().from(companies).where(and(eq(companies.active, true), inArray(companies.id, authorization.companyIds))).orderBy(asc(companies.name));
    const allowedIds = companyRows.map((company) => company.id);
    if (!allowedIds.length) return Response.json({ companies: [] });
    const [locationRows, transactionRows, accountRows] = await Promise.all([
      db.select().from(inventoryLocations).where(and(eq(inventoryLocations.active, true), inArray(inventoryLocations.companyId, allowedIds))).orderBy(asc(inventoryLocations.name)),
      db.select().from(transactions).where(inArray(transactions.companyId, allowedIds)),
      db.select({ companyId: accounts.companyId, name: accounts.name, systemRole: accounts.systemRole }).from(accounts).where(inArray(accounts.companyId, allowedIds)),
    ]);
    return Response.json({ companies: companyRows.map((company) => ({ ...company, locations: locationRows.filter((location) => location.companyId === company.id).map((location) => {
      const activity = transactionRows.filter((transaction) => transaction.companyId === company.id && transaction.locationId === location.id);
      const receivable = activity.reduce((balance, transaction) => transaction.type === "invoice" ? balance + Number(transaction.baseTotal) : ["customer payment", "credit memo"].includes(transaction.type) ? balance - Number(transaction.baseTotal) : balance, 0);
      const apName = accountRows.find((account) => account.companyId === company.id && account.systemRole === "AP")?.name ?? "Accounts Payable";
      const payable = activity.reduce((balance, transaction) => transaction.type === "bill" ? balance + Number(transaction.baseTotal) : ["bill payment", "vendor payment", "vendor credit"].includes(transaction.type) || (transaction.type === "cheque" && transaction.account === apName) ? balance - Number(transaction.baseTotal) : balance, 0);
      return { ...location, receivable, payable };
    }) })) });
  } catch (error) { return Response.json({ error: message(error) }, { status: 500 }); }
}

async function handlePOST(request: Request) {
  const authorization = await requireApiUser(request, true, true);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = await request.json() as Record<string, unknown>; const db = getDb();
    if (payload.type === "company") {
      if (authorization.role !== "all_admin") return Response.json({ error: "Only an All-Admin can create a company." }, { status: 403 });
      const name = String(payload.name ?? "").trim(); const baseCurrency = String(payload.baseCurrency ?? "AED").trim().toUpperCase();
      if (!name || !/^[A-Z]{3}$/.test(baseCurrency)) return Response.json({ error: "Company name and a valid currency code are required." }, { status: 400 });
      const [company] = await db.insert(companies).values({ name, baseCurrency, bankCurrency: baseCurrency }).returning();
      const [location] = await db.insert(inventoryLocations).values({ companyId: company.id, name: "Main Inventory", code: "MAIN", invoicePrefix: "MAIN" }).returning();
      await db.insert(accounts).values(standardAccounts.map(([code, accountName, accountType, systemRole]) => ({ companyId: company.id, code, name: accountName, type: accountType, systemRole, currency: baseCurrency })));
      await db.insert(vatCodes).values(standardVatCodes.map((vatCode) => ({ companyId: company.id, ...vatCode })));
      await db.insert(exchangeRates).values({ companyId: company.id, currencyCode: baseCurrency, rate: 1 });
      return Response.json({ company: { ...company, locations: [location] } }, { status: 201 });
    }
    const companyId = Number(payload.companyId); const name = String(payload.name ?? "").trim(); const code = String(payload.code ?? "").trim().toUpperCase();
    if (!Number.isInteger(companyId) || !name || !code) return Response.json({ error: "Company, location name and code are required." }, { status: 400 });
    if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    const [location] = await db.insert(inventoryLocations).values({ companyId, name, code, invoicePrefix: code }).returning();
    return Response.json({ location }, { status: 201 });
  } catch (error) { return Response.json({ error: message(error) }, { status: 500 }); }
}

async function handlePATCH(request: Request) {
  const authorization = await requireApiUser(request, true, true);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const companyId = Number(payload.companyId);
    if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    if (payload.type === "invoiceSeries") {
      const locationId = Number(payload.locationId); const invoicePrefix = String(payload.invoicePrefix ?? "").trim().toUpperCase(); const nextInvoiceNumber = Number(payload.nextInvoiceNumber);
      if (!Number.isInteger(companyId) || !Number.isInteger(locationId) || !/^[A-Z0-9][A-Z0-9/-]{0,19}$/.test(invoicePrefix) || !Number.isInteger(nextInvoiceNumber) || nextInvoiceNumber < 1 || nextInvoiceNumber > 999999999) return Response.json({ error: "Enter a valid invoice prefix and next invoice number." }, { status: 400 });
      const [location] = await getDb().update(inventoryLocations).set({ invoicePrefix, nextInvoiceNumber }).where(and(eq(inventoryLocations.id, locationId), eq(inventoryLocations.companyId, companyId))).returning();
      if (!location) return Response.json({ error: "Inventory not found." }, { status: 404 }); return Response.json({ location });
    }
    const baseCurrency = String(payload.baseCurrency ?? "").trim().toUpperCase();
    if (!Number.isInteger(companyId) || !/^[A-Z]{3}$/.test(baseCurrency)) return Response.json({ error: "Company and a valid currency code are required." }, { status: 400 });
    const db = getDb();
    const [existing] = await db.select({ baseCurrency: companies.baseCurrency }).from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!existing) return Response.json({ error: "Company not found." }, { status: 404 });
    if (existing.baseCurrency !== baseCurrency) {
      const [activity] = await db.select({ id: journalEntries.id }).from(journalEntries).where(eq(journalEntries.companyId, companyId)).limit(1);
      const [documents] = await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.companyId, companyId)).limit(1);
      if (activity || documents) return Response.json({ error: "Base currency cannot change after transactions have been created." }, { status: 409 });
    }
    const [company] = await db.update(companies).set({ baseCurrency }).where(eq(companies.id, companyId)).returning();
    if (!company) return Response.json({ error: "Company not found." }, { status: 404 });
    await db.insert(exchangeRates).values({ companyId, currencyCode: baseCurrency, rate: 1 }).onConflictDoUpdate({ target: [exchangeRates.companyId, exchangeRates.currencyCode], set: { rate: 1, active: true, updatedAt: new Date().toISOString() } });
    return Response.json({ company });
  } catch (error) { return Response.json({ error: message(error) }, { status: 500 }); }
}

export const GET = apiRoute(handleGET);

export const POST = apiRoute(handlePOST, { transaction: true });

export const PATCH = apiRoute(handlePATCH, { transaction: true });
