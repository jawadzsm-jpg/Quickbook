import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { accounts, companies, inventoryLocations } from "../../../db/schema";

const standardAccounts = [
  ["1000", "Business Bank", "Bank"], ["1100", "Accounts Receivable", "Accounts Receivable"],
  ["1200", "Inventory Asset", "Current Asset"], ["1300", "Recoverable VAT", "Current Asset"],
  ["2000", "Accounts Payable", "Accounts Payable"], ["2100", "VAT Payable", "Current Liability"],
  ["3000", "Opening Balance Equity", "Equity"], ["4000", "Sales Revenue", "Income"],
  ["4100", "Other Income", "Income"], ["5000", "Cost of Goods Sold", "Cost of Goods Sold"],
  ["6000", "Purchases", "Expense"], ["6100", "Operating Expenses", "Expense"],
  ["6200", "Payroll Expense", "Expense"], ["9999", "Suspense", "Other Current Asset"],
] as const;

function message(error: unknown) {
  return error instanceof Error ? error.message : "Could not update companies and inventory locations.";
}

export async function GET() {
  try {
    const db = getDb();
    const [companyRows, locationRows] = await Promise.all([
      db.select().from(companies).where(eq(companies.active, true)).orderBy(asc(companies.name)),
      db.select().from(inventoryLocations).where(eq(inventoryLocations.active, true)).orderBy(asc(inventoryLocations.name)),
    ]);
    return Response.json({
      companies: companyRows.map((company) => ({ ...company, locations: locationRows.filter((location) => location.companyId === company.id) })),
    });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const db = getDb();
    if (payload.type === "company") {
      const name = String(payload.name ?? "").trim();
      const baseCurrency = String(payload.baseCurrency ?? "AED").trim().toUpperCase();
      if (!name || !/^[A-Z]{3}$/.test(baseCurrency)) return Response.json({ error: "Company name and a valid currency code are required." }, { status: 400 });
      const [company] = await db.insert(companies).values({ name, baseCurrency }).returning();
      const [location] = await db.insert(inventoryLocations).values({ companyId: company.id, name: "Main Inventory", code: "MAIN" }).returning();
      await db.insert(accounts).values(standardAccounts.map(([code, accountName, accountType]) => ({ companyId: company.id, code, name: accountName, type: accountType })));
      return Response.json({ company: { ...company, locations: [location] } }, { status: 201 });
    }
    const companyId = Number(payload.companyId);
    const name = String(payload.name ?? "").trim();
    const code = String(payload.code ?? "").trim().toUpperCase();
    if (!Number.isInteger(companyId) || !name || !code) return Response.json({ error: "Company, location name and code are required." }, { status: 400 });
    const [location] = await db.insert(inventoryLocations).values({ companyId, name, code }).returning();
    return Response.json({ location }, { status: 201 });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
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
