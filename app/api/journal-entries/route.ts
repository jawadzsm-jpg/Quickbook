import { isIsoDate } from "@/lib/validation";
import { apiRoute } from "@/lib/api";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, auditLog, inventoryLocations, journalEntries, journalLines } from "@/db/schema";
import { canAccessCompany, requireApiUser } from "@/lib/auth";

type InputLine = { accountId?: number | string; debit?: number | string; credit?: number | string };
const round = (value: number) => Math.round(value * 100) / 100;

async function handleGET(request: Request) {
  const user = await requireApiUser(request, "accounting:manage");
  if (user instanceof Response) return user;
  try {
    const url = new URL(request.url);
    const companyId = Number(url.searchParams.get("companyId"));
    if (!canAccessCompany(user, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    const locationId = Number(url.searchParams.get("locationId"));
    if (!Number.isInteger(companyId) || companyId <= 0) return Response.json({ error: "Select a company." }, { status: 400 });
    const filter = Number.isInteger(locationId) && locationId > 0 ? and(eq(journalEntries.companyId, companyId), eq(journalEntries.locationId, locationId)) : eq(journalEntries.companyId, companyId);
    const entries = await getDb().select().from(journalEntries).where(filter).orderBy(desc(journalEntries.entryDate), desc(journalEntries.id)).limit(300);
    const lines = entries.length ? await getDb().select().from(journalLines).where(inArray(journalLines.journalEntryId, entries.map((entry) => entry.id))) : [];
    const linesByEntry = new Map<number, typeof lines>();
    for (const line of lines) {
      const group = linesByEntry.get(line.journalEntryId) ?? [];
      group.push(line);
      linesByEntry.set(line.journalEntryId, group);
    }
    return Response.json({ entries: entries.map((entry) => { const entryLines = linesByEntry.get(entry.id) ?? []; return { ...entry, lines: entryLines, debit: round(entryLines.reduce((sum, line) => sum + Number(line.debit), 0)), credit: round(entryLines.reduce((sum, line) => sum + Number(line.credit), 0)), source: entry.transactionId ? "Transaction" : "Manual" }; }) });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not load journal entries." }, { status: 500 }); }
}

async function handlePOST(request: Request) {
  const user = await requireApiUser(request, "accounting:manage", true);
  if (user instanceof Response) return user;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const companyId = Number(payload.companyId);
    if (!canAccessCompany(user, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    const locationId = Number(payload.locationId);
    const entryDate = String(payload.entryDate ?? "");
    const reference = String(payload.reference ?? "").trim();
    const description = String(payload.description ?? "").trim();
    const inputLines = Array.isArray(payload.lines) ? payload.lines as InputLine[] : [];
    if (!Number.isInteger(companyId) || companyId <= 0 || !Number.isInteger(locationId) || locationId <= 0) return Response.json({ error: "Select a company and inventory." }, { status: 400 });
    if (!isIsoDate(entryDate) || !reference || !description) return Response.json({ error: "Date, reference and description are required." }, { status: 400 });
    if (reference.length > 80 || description.length > 500) return Response.json({ error: "Reference or description is too long." }, { status: 400 });
    if (inputLines.length < 2 || inputLines.length > 100) return Response.json({ error: "Enter at least two journal lines." }, { status: 400 });
    const prepared = inputLines.map((line) => ({ accountId: Number(line.accountId), debit: round(Number(line.debit ?? 0)), credit: round(Number(line.credit ?? 0)) }));
    if (prepared.some((line) => !Number.isInteger(line.accountId) || line.accountId <= 0 || !Number.isFinite(line.debit) || !Number.isFinite(line.credit) || line.debit < 0 || line.credit < 0 || (line.debit > 0) === (line.credit > 0))) return Response.json({ error: "Every line needs one account and either a debit or credit amount." }, { status: 400 });
    const totalDebit = round(prepared.reduce((sum, line) => sum + line.debit, 0));
    const totalCredit = round(prepared.reduce((sum, line) => sum + line.credit, 0));
    if (!Number.isFinite(totalDebit) || !Number.isFinite(totalCredit) || totalDebit > 1e12 || totalCredit > 1e12 || totalDebit <= 0 || Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) return Response.json({ error: `Journal is not balanced. Debits ${totalDebit.toFixed(2)}; credits ${totalCredit.toFixed(2)}.` }, { status: 409 });
    const db = getDb();
    const [location] = await db.select({ id: inventoryLocations.id }).from(inventoryLocations).where(and(eq(inventoryLocations.id, locationId), eq(inventoryLocations.companyId, companyId), eq(inventoryLocations.active, true))).limit(1);
    if (!location) return Response.json({ error: "The selected inventory was not found." }, { status: 404 });
    const accountIds = [...new Set(prepared.map((line) => line.accountId))];
    const accountRows = await db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.active, true), inArray(accounts.id, accountIds)));
    if (accountRows.length !== accountIds.length) return Response.json({ error: "Select active accounts from this company on every line." }, { status: 400 });
    const accountNames = new Map(accountRows.map((account) => [account.id, account.name]));
    const [entry] = await db.insert(journalEntries).values({ companyId, locationId, entryDate, reference, description, posted: true }).returning();
    await db.insert(journalLines).values(prepared.map((line) => ({ journalEntryId: entry.id, accountName: accountNames.get(line.accountId)!, debit: line.debit, credit: line.credit })));
    await db.insert(auditLog).values({ companyId, action: "created", entityType: "journal_entry", entityId: entry.id, details: `${reference}; ${prepared.length} line(s); ${totalDebit.toFixed(2)} balanced` });
    return Response.json({ entry: { ...entry, debit: totalDebit, credit: totalCredit, source: "Manual" } }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not post journal entry." }, { status: 500 }); }
}

export const GET = apiRoute(handleGET);

export const POST = apiRoute(handlePOST, { transaction: true });
