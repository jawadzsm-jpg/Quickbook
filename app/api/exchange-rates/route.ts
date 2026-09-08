import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLog, companies, exchangeRates } from "../../../db/schema";
import { requireApiUser } from "@/lib/auth";

function message(error: unknown) {
  return error instanceof Error ? error.message : "Could not update exchange rates.";
}

export async function GET(request: Request) {
  const authorization = await requireApiUser(request, "workspace:read");
  if (authorization instanceof Response) return authorization;
  try {
    const companyId = Number(new URL(request.url).searchParams.get("companyId"));
    if (!Number.isInteger(companyId) || companyId <= 0) return Response.json({ error: "Select a company." }, { status: 400 });
    const db = getDb();
    const rates = await db.select().from(exchangeRates).where(eq(exchangeRates.companyId, companyId)).orderBy(asc(exchangeRates.currencyCode));
    return Response.json({ rates });
  } catch (error) { return Response.json({ error: message(error) }, { status: 500 }); }
}

export async function POST(request: Request) {
  const authorization = await requireApiUser(request, true, true);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const companyId = Number(payload.companyId);
    const currencyCode = String(payload.currencyCode ?? "").trim().toUpperCase();
    const rate = Number(payload.rate);
    if (!Number.isInteger(companyId) || companyId <= 0 || !/^[A-Z]{3}$/.test(currencyCode) || !Number.isFinite(rate) || rate <= 0 || rate > 1_000_000) {
      return Response.json({ error: "Select a currency and enter an exchange rate greater than zero." }, { status: 400 });
    }
    const db = getDb();
    const [company] = await db.select({ id: companies.id, baseCurrency: companies.baseCurrency }).from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!company) return Response.json({ error: "Company not found." }, { status: 404 });
    const savedRate = currencyCode === company.baseCurrency ? 1 : rate;
    const [record] = await db.insert(exchangeRates).values({ companyId, currencyCode, rate: savedRate }).onConflictDoUpdate({
      target: [exchangeRates.companyId, exchangeRates.currencyCode],
      set: { rate: savedRate, active: true, updatedAt: new Date().toISOString() },
    }).returning();
    await db.insert(auditLog).values({ companyId, action: "updated", entityType: "exchange_rate", entityId: record.id, details: `${currencyCode} set to ${savedRate} ${company.baseCurrency}` });
    return Response.json({ record }, { status: 201 });
  } catch (error) { return Response.json({ error: message(error) }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  const authorization = await requireApiUser(request, true, true);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const companyId = Number(payload.companyId);
    const id = Number(payload.id);
    const rate = Number(payload.rate);
    if (!Number.isInteger(companyId) || !Number.isInteger(id) || !Number.isFinite(rate) || rate <= 0 || rate > 1_000_000) return Response.json({ error: "Enter a valid exchange rate greater than zero." }, { status: 400 });
    const db = getDb();
    const [existing] = await db.select({ id: exchangeRates.id, currencyCode: exchangeRates.currencyCode, baseCurrency: companies.baseCurrency }).from(exchangeRates).innerJoin(companies, eq(exchangeRates.companyId, companies.id)).where(and(eq(exchangeRates.id, id), eq(exchangeRates.companyId, companyId))).limit(1);
    if (!existing) return Response.json({ error: "Exchange rate not found." }, { status: 404 });
    const [record] = await db.update(exchangeRates).set({ rate: existing.currencyCode === existing.baseCurrency ? 1 : rate, active: true, updatedAt: new Date().toISOString() }).where(and(eq(exchangeRates.id, id), eq(exchangeRates.companyId, companyId))).returning();
    await db.insert(auditLog).values({ companyId, action: "updated", entityType: "exchange_rate", entityId: record.id, details: `${record.currencyCode} set to ${record.rate} ${existing.baseCurrency}` });
    return Response.json({ record });
  } catch (error) { return Response.json({ error: message(error) }, { status: 500 }); }
}
