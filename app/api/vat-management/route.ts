import { apiRoute } from "@/lib/api";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, auditLog, inventoryLocations, journalEntries, journalLines, transactionLines, transactions, vatAdjustments, vatReturns } from "@/db/schema";
import { canAccessCompany, requireApiUser } from "@/lib/auth";

const round = (value: number) => Math.round(value * 100) / 100;
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

async function calculateVat(companyId: number, locationId: number, periodStart: string, periodEnd: string) {
  const db = getDb();
  const transactionFilter = and(
    Number.isInteger(locationId) && locationId > 0 ? and(eq(transactions.companyId, companyId), eq(transactions.locationId, locationId)) : eq(transactions.companyId, companyId),
    gte(transactions.transactionDate, periodStart),
    lte(transactions.transactionDate, periodEnd),
  );
  const [lines, adjustments] = await Promise.all([
    db.select({ type: transactions.type, vatAmount: transactionLines.vatAmount, exchangeRate: transactions.exchangeRate }).from(transactionLines).innerJoin(transactions, eq(transactionLines.transactionId, transactions.id)).where(transactionFilter),
    db.select().from(vatAdjustments).where(and(
      Number.isInteger(locationId) && locationId > 0 ? and(eq(vatAdjustments.companyId, companyId), eq(vatAdjustments.locationId, locationId)) : eq(vatAdjustments.companyId, companyId),
      gte(vatAdjustments.adjustmentDate, periodStart),
      lte(vatAdjustments.adjustmentDate, periodEnd),
    )),
  ]);
  const outputVat = round(lines.reduce((sum, line) => {
    const sign = line.type === "credit memo" ? -1 : ["invoice", "sales receipt"].includes(line.type) ? 1 : 0;
    return sum + sign * Number(line.vatAmount) * Number(line.exchangeRate);
  }, 0));
  const inputVat = round(lines.reduce((sum, line) => {
    const sign = line.type === "vendor credit" ? -1 : ["bill", "expense"].includes(line.type) ? 1 : 0;
    return sum + sign * Number(line.vatAmount) * Number(line.exchangeRate);
  }, 0));
  const adjustmentTotal = round(adjustments.reduce((sum, adjustment) => sum + (adjustment.direction === "increase" ? adjustment.amount : -adjustment.amount), 0));
  return { outputVat, inputVat, adjustments: adjustmentTotal, netVatDue: round(outputVat - inputVat + adjustmentTotal), transactionLines: lines.length };
}

async function handleGET(request: Request) {
  const user = await requireApiUser(request, "reports:read");
  if (user instanceof Response) return user;
  try {
    const url = new URL(request.url);
    const companyId = Number(url.searchParams.get("companyId"));
    if (!canAccessCompany(user, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    const locationId = Number(url.searchParams.get("locationId"));
    const periodStart = String(url.searchParams.get("periodStart") ?? "");
    const periodEnd = String(url.searchParams.get("periodEnd") ?? "");
    if (!Number.isInteger(companyId) || companyId <= 0 || !validDate(periodStart) || !validDate(periodEnd) || periodStart > periodEnd) return Response.json({ error: "Choose a valid VAT period." }, { status: 400 });
    const db = getDb();
    const [summary, returns, adjustments] = await Promise.all([
      calculateVat(companyId, locationId, periodStart, periodEnd),
      db.select().from(vatReturns).where(Number.isInteger(locationId) && locationId > 0 ? and(eq(vatReturns.companyId, companyId), eq(vatReturns.locationId, locationId)) : eq(vatReturns.companyId, companyId)).orderBy(desc(vatReturns.periodEnd), desc(vatReturns.id)).limit(100),
      db.select().from(vatAdjustments).where(Number.isInteger(locationId) && locationId > 0 ? and(eq(vatAdjustments.companyId, companyId), eq(vatAdjustments.locationId, locationId)) : eq(vatAdjustments.companyId, companyId)).orderBy(desc(vatAdjustments.adjustmentDate), desc(vatAdjustments.id)).limit(100),
    ]);
    return Response.json({ summary, returns, adjustments });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not load VAT management." }, { status: 500 }); }
}

async function handlePOST(request: Request) {
  const user = await requireApiUser(request, "accounting:manage", true);
  if (user instanceof Response) return user;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const companyId = Number(payload.companyId);
    if (!canAccessCompany(user, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    const locationId = Number(payload.locationId);
    const action = String(payload.action ?? "");
    if (!Number.isInteger(companyId) || companyId <= 0 || !Number.isInteger(locationId) || locationId <= 0) return Response.json({ error: "Select a company and inventory." }, { status: 400 });
    const db = getDb();
    const [location] = await db.select({ id: inventoryLocations.id }).from(inventoryLocations).where(and(eq(inventoryLocations.id, locationId), eq(inventoryLocations.companyId, companyId), eq(inventoryLocations.active, true))).limit(1);
    if (!location) return Response.json({ error: "The selected inventory was not found." }, { status: 404 });

    if (action === "file") {
      const periodStart = String(payload.periodStart ?? "");
      const periodEnd = String(payload.periodEnd ?? "");
      const reference = String(payload.reference ?? "").trim();
      if (!validDate(periodStart) || !validDate(periodEnd) || periodStart > periodEnd || !reference || reference.length > 80) return Response.json({ error: "Enter a valid period and filing reference." }, { status: 400 });
      const [duplicate] = await db.select({ id: vatReturns.id }).from(vatReturns).where(and(eq(vatReturns.companyId, companyId), eq(vatReturns.reference, reference))).limit(1);
      if (duplicate) return Response.json({ error: "That VAT return reference already exists." }, { status: 409 });
      const summary = await calculateVat(companyId, locationId, periodStart, periodEnd);
      const [record] = await db.insert(vatReturns).values({ companyId, locationId, periodStart, periodEnd, reference, outputVat: summary.outputVat, inputVat: summary.inputVat, adjustments: summary.adjustments, netVatDue: summary.netVatDue, filedByUserId: user.id }).returning();
      await db.insert(auditLog).values({ companyId, action: "filed", entityType: "vat_return", entityId: record.id, details: `${reference}; ${periodStart} to ${periodEnd}; VAT due ${summary.netVatDue.toFixed(2)}` });
      return Response.json({ record }, { status: 201 });
    }

    if (action === "adjust") {
      const adjustmentDate = String(payload.adjustmentDate ?? "");
      const reference = String(payload.reference ?? "").trim();
      const reason = String(payload.reason ?? "").trim();
      const direction = String(payload.direction ?? "increase") as "increase" | "decrease";
      const amount = round(Number(payload.amount));
      if (!validDate(adjustmentDate) || !reference || reference.length > 80 || !reason || reason.length > 500 || !["increase", "decrease"].includes(direction) || !Number.isFinite(amount) || amount <= 0) return Response.json({ error: "Complete the VAT adjustment with a valid positive amount." }, { status: 400 });
      const [duplicate] = await db.select({ id: vatAdjustments.id }).from(vatAdjustments).where(and(eq(vatAdjustments.companyId, companyId), eq(vatAdjustments.reference, reference))).limit(1);
      if (duplicate) return Response.json({ error: "That VAT adjustment reference already exists." }, { status: 409 });
      const accountRows = await db.select({ id: accounts.id, name: accounts.name, systemRole: accounts.systemRole }).from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.active, true)));
      const vatAccount = accountRows.find((account) => account.systemRole === "OUTPUT_VAT");
      const offsetAccount = accountRows.find((account) => account.systemRole === "SUSPENSE");
      if (!vatAccount || !offsetAccount) return Response.json({ error: "Link VAT Payable and Suspense accounts in Chart of Accounts before posting an adjustment." }, { status: 409 });
      const [entry] = await db.insert(journalEntries).values({ companyId, locationId, entryDate: adjustmentDate, reference, description: `VAT adjustment: ${reason}`, posted: true }).returning();
      await db.insert(journalLines).values(direction === "increase"
        ? [{ journalEntryId: entry.id, accountName: offsetAccount.name, debit: amount, credit: 0 }, { journalEntryId: entry.id, accountName: vatAccount.name, debit: 0, credit: amount }]
        : [{ journalEntryId: entry.id, accountName: vatAccount.name, debit: amount, credit: 0 }, { journalEntryId: entry.id, accountName: offsetAccount.name, debit: 0, credit: amount }]);
      const [record] = await db.insert(vatAdjustments).values({ companyId, locationId, adjustmentDate, reference, direction, amount, reason, createdByUserId: user.id }).returning();
      await db.insert(auditLog).values({ companyId, action: "created", entityType: "vat_adjustment", entityId: record.id, details: `${reference}; ${direction}; ${amount.toFixed(2)}; journal ${entry.id}` });
      return Response.json({ record }, { status: 201 });
    }

    return Response.json({ error: "Choose a valid VAT action." }, { status: 400 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not update VAT." }, { status: 500 }); }
}

export const GET = apiRoute(handleGET);

export const POST = apiRoute(handlePOST, { transaction: true });
