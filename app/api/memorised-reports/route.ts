import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, companies, inventoryLocations, memorisedReports } from "@/db/schema";
import { requireApiUser } from "@/lib/auth";

const validCategories = new Set(["Financial", "Budgets", "Sales", "Customers", "Vendors", "Purchases", "Inventory", "Banking", "VAT", "Accountant", "Lists", "Company"]);

function databaseError(error: unknown) {
  const message = error instanceof Error ? error.message : "Could not update memorised reports.";
  return message.includes("does not exist") ? "The report database is being updated. Please refresh in a moment." : message;
}

export async function GET(request: Request) {
  const user = await requireApiUser(request, "reports:read");
  if (user instanceof Response) return user;
  try {
    const companyId = Number(new URL(request.url).searchParams.get("companyId"));
    if (!Number.isInteger(companyId) || companyId <= 0) return Response.json({ error: "Select a company." }, { status: 400 });
    const records = await getDb().select().from(memorisedReports)
      .where(and(eq(memorisedReports.userId, user.id), eq(memorisedReports.companyId, companyId)))
      .orderBy(asc(memorisedReports.category), asc(memorisedReports.name));
    return Response.json({ records });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requireApiUser(request, "reports:read", true);
  if (user instanceof Response) return user;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const companyId = Number(payload.companyId);
    const locationId = payload.locationId ? Number(payload.locationId) : null;
    const name = String(payload.name ?? "").trim();
    const reportKey = String(payload.reportKey ?? "").trim();
    const category = String(payload.category ?? "").trim();
    const currency = String(payload.currency ?? "AED").trim().toUpperCase();
    const periodStart = String(payload.periodStart ?? "").trim();
    const periodEnd = String(payload.periodEnd ?? "").trim();
    if (!Number.isInteger(companyId) || companyId <= 0 || !name || name.length > 120 || !/^[a-z0-9-]{1,80}$/.test(reportKey) || !validCategories.has(category) || !/^[A-Z]{3}$/.test(currency)) {
      return Response.json({ error: "Enter valid memorised report details." }, { status: 400 });
    }
    if ((periodStart && !/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) || (periodEnd && !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd))) {
      return Response.json({ error: "Enter valid report dates." }, { status: 400 });
    }
    const db = getDb();
    const [company] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!company) return Response.json({ error: "Company not found." }, { status: 404 });
    if (locationId !== null) {
      const [location] = await db.select({ id: inventoryLocations.id }).from(inventoryLocations).where(and(eq(inventoryLocations.id, locationId), eq(inventoryLocations.companyId, companyId))).limit(1);
      if (!location) return Response.json({ error: "Inventory not found for this company." }, { status: 400 });
    }
    const customer = ["customer-statements", "vendor-statements"].includes(reportKey) ? String(payload.customer || "").slice(0, 300) : "";
    const memo = ["customer-statements", "vendor-statements"].includes(reportKey) ? String(payload.memo || "").slice(0, 2000) : "";
    const statementDate = ["customer-statements", "vendor-statements"].includes(reportKey) ? String(payload.statementDate || "") : "";
    if (statementDate && !/^\d{4}-\d{2}-\d{2}$/.test(statementDate)) return Response.json({ error: "Enter a valid statement date." }, { status: 400 });
    const now = new Date().toISOString();
    const [record] = await db.insert(memorisedReports).values({ userId: user.id, companyId, locationId, name, reportKey, category, currency, periodStart, periodEnd, customer, statementDate, memo, updatedAt: now })
      .onConflictDoUpdate({ target: [memorisedReports.userId, memorisedReports.companyId, memorisedReports.reportKey], set: { locationId, name, category, currency, periodStart, periodEnd, customer, statementDate, memo, updatedAt: now } })
      .returning();
    await db.insert(auditLog).values({ companyId, action: "memorised", entityType: "report", entityId: record.id, details: `${name} saved by ${user.email}` });
    return Response.json({ record });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await requireApiUser(request, "reports:read", true);
  if (user instanceof Response) return user;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = Number(payload.id);
    const companyId = Number(payload.companyId);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(companyId) || companyId <= 0) return Response.json({ error: "Invalid memorised report." }, { status: 400 });
    const db = getDb();
    const [record] = await db.delete(memorisedReports).where(and(eq(memorisedReports.id, id), eq(memorisedReports.userId, user.id), eq(memorisedReports.companyId, companyId))).returning();
    if (!record) return Response.json({ error: "Memorised report not found." }, { status: 404 });
    await db.insert(auditLog).values({ companyId, action: "deleted", entityType: "memorised_report", entityId: id, details: `${record.name} removed by ${user.email}` });
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
