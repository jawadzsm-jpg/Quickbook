import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, withWriteTransaction } from "@/db";
import { accounts, auditLog, inventoryLocations, journalEntries, journalLines } from "@/db/schema";
import { canAccessCompany, isAdministrator, requireApiUser } from "@/lib/auth";

type InputLine = { accountId?: number | string; debit?: number | string; credit?: number | string };
const round = (value: number) => Math.round(value * 100) / 100;

function revision(entry: typeof journalEntries.$inferSelect, lines: (typeof journalLines.$inferSelect)[]) {
  return createHash("sha256").update(JSON.stringify([entry, [...lines].sort((a, b) => a.id - b.id)])).digest("hex");
}

export async function GET(request: Request) {
  const user = await requireApiUser(request, "accounting:manage");
  if (user instanceof Response) return user;
  try {
    const url = new URL(request.url);
    const companyId = Number(url.searchParams.get("companyId"));
    const locationId = Number(url.searchParams.get("locationId"));
    if (!Number.isInteger(companyId) || companyId <= 0) return Response.json({ error: "Select a company." }, { status: 400 });
    if (!canAccessCompany(user, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    const filter = Number.isInteger(locationId) && locationId > 0 ? and(eq(journalEntries.companyId, companyId), eq(journalEntries.locationId, locationId)) : eq(journalEntries.companyId, companyId);
    const entries = await getDb().select().from(journalEntries).where(filter).orderBy(desc(journalEntries.entryDate), desc(journalEntries.id)).limit(300);
    const lines = entries.length ? await getDb().select().from(journalLines).where(inArray(journalLines.journalEntryId, entries.map((entry) => entry.id))) : [];
    const manualLogs = await getDb().select({ id: auditLog.entityId }).from(auditLog).where(and(eq(auditLog.companyId, companyId), eq(auditLog.entityType, "journal_entry"), eq(auditLog.action, "created")));
    const manualIds = new Set(manualLogs.map((log) => log.id));
    return Response.json({ entries: entries.map((entry) => { const entryLines = lines.filter((line) => line.journalEntryId === entry.id); return { ...entry, revision: revision(entry, entryLines), canManage: isAdministrator(user) && !entry.transactionId && manualIds.has(entry.id), lines: entryLines, debit: round(entryLines.reduce((sum, line) => sum + Number(line.debit), 0)), credit: round(entryLines.reduce((sum, line) => sum + Number(line.credit), 0)), source: entry.transactionId ? "Transaction" : manualIds.has(entry.id) ? "Manual" : entry.description.startsWith("Stock revaluation:") ? "Stock revaluation" : "Automatic" }; }) });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not load journal entries." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try { return await withWriteTransaction(() => saveJournal(request)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not post journal." }, { status: 500 }); }
}

async function saveJournal(request: Request, replacing?: typeof journalEntries.$inferSelect) {
  const user = await requireApiUser(request, "accounting:manage", true);
  if (user instanceof Response) return user;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const companyId = Number(payload.companyId);
    const locationId = Number(payload.locationId);
    const entryDate = String(payload.entryDate ?? "");
    const reference = String(payload.reference ?? "").trim();
    const description = String(payload.description ?? "").trim();
    const inputLines = Array.isArray(payload.lines) ? payload.lines as InputLine[] : [];
    if (!Number.isInteger(companyId) || companyId <= 0 || !Number.isInteger(locationId) || locationId <= 0) return Response.json({ error: "Select a company and inventory." }, { status: 400 });
    if (!canAccessCompany(user, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate) || !Number.isFinite(Date.parse(entryDate)) || new Date(entryDate).toISOString().slice(0, 10) !== entryDate || !reference || !description) return Response.json({ error: "Date, reference and description are required." }, { status: 400 });
    if (reference.length > 80 || description.length > 500) return Response.json({ error: "Reference or description is too long." }, { status: 400 });
    if (inputLines.length < 2 || inputLines.length > 100) return Response.json({ error: "Enter at least two journal lines." }, { status: 400 });
    const prepared = inputLines.map((line) => ({ accountId: Number(line.accountId), debit: round(Number(line.debit ?? 0)), credit: round(Number(line.credit ?? 0)) }));
    if (prepared.some((line) => !Number.isInteger(line.accountId) || line.accountId <= 0 || !Number.isFinite(line.debit) || !Number.isFinite(line.credit) || line.debit < 0 || line.credit < 0 || (line.debit > 0) === (line.credit > 0))) return Response.json({ error: "Every line needs one account and either a debit or credit amount." }, { status: 400 });
    const totalDebit = round(prepared.reduce((sum, line) => sum + line.debit, 0));
    const totalCredit = round(prepared.reduce((sum, line) => sum + line.credit, 0));
    if (totalDebit <= 0 || Math.abs(totalDebit - totalCredit) >= 0.01) return Response.json({ error: `Journal is not balanced. Debits ${totalDebit.toFixed(2)}; credits ${totalCredit.toFixed(2)}.` }, { status: 409 });
    const db = getDb();
    const [location] = await db.select({ id: inventoryLocations.id }).from(inventoryLocations).where(and(eq(inventoryLocations.id, locationId), eq(inventoryLocations.companyId, companyId), eq(inventoryLocations.active, true))).limit(1);
    if (!location) return Response.json({ error: "The selected inventory was not found." }, { status: 404 });
    const accountIds = [...new Set(prepared.map((line) => line.accountId))];
    const accountRows = await db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.active, true), inArray(accounts.id, accountIds)));
    if (accountRows.length !== accountIds.length) return Response.json({ error: "Select active accounts from this company on every line." }, { status: 400 });
    const accountNames = new Map(accountRows.map((account) => [account.id, account.name]));
    const values = { companyId, locationId, entryDate, reference, description, posted: true };
    if (replacing) await db.delete(journalLines).where(eq(journalLines.journalEntryId, replacing.id));
    const [entry] = replacing ? await db.update(journalEntries).set(values).where(eq(journalEntries.id, replacing.id)).returning() : await db.insert(journalEntries).values(values).returning();
    await db.insert(journalLines).values(prepared.map((line) => ({ journalEntryId: entry.id, accountName: accountNames.get(line.accountId)!, debit: line.debit, credit: line.credit })));
    await db.insert(auditLog).values({ companyId, action: replacing ? "updated" : "created", entityType: "journal_entry", entityId: entry.id, details: JSON.stringify({ actor: { id: user.id, name: user.fullName, email: user.email }, reference, lines: prepared, total: totalDebit }) });
    return Response.json({ entry: { ...entry, debit: totalDebit, credit: totalCredit, source: "Manual" } }, { status: replacing ? 200 : 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not post journal entry." }, { status: 500 }); }
}

export async function PATCH(request: Request) { return changeJournal(request, false); }
export async function DELETE(request: Request) { return changeJournal(request, true); }

async function changeJournal(request: Request, remove: boolean) {
  const user = await requireApiUser(request, false, true);
  if (user instanceof Response) return user;
  if (!isAdministrator(user)) return Response.json({ error: "Only All-Admin and Admin can edit or delete journals." }, { status: 403 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const companyId = Number(payload.companyId), id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0 || !canAccessCompany(user, companyId)) return Response.json({ error: "Select a journal in an authorized company." }, { status: 403 });
    return await withWriteTransaction(async () => {
      const db = getDb();
      const [entry] = await db.select().from(journalEntries).where(and(eq(journalEntries.id, id), eq(journalEntries.companyId, companyId))).for("update");
      if (!entry) return Response.json({ error: "Journal not found." }, { status: 404 });
      const [manual] = await db.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.companyId, companyId), eq(auditLog.entityType, "journal_entry"), eq(auditLog.entityId, id), eq(auditLog.action, "created"))).limit(1);
      if (entry.transactionId || !manual) return Response.json({ error: "Update this automatic journal through its source document or stock revaluation." }, { status: 409 });
      const oldLines = await db.select().from(journalLines).where(eq(journalLines.journalEntryId, id)).orderBy(asc(journalLines.id));
      if (payload.revision !== revision(entry, oldLines)) return Response.json({ error: "This journal changed. Refresh the list and reopen it." }, { status: 409 });
      if (Number(payload.locationId) !== entry.locationId) return Response.json({ error: "Keep the original journal inventory." }, { status: 400 });
      if (remove) {
        await db.delete(journalEntries).where(eq(journalEntries.id, id));
      } else {
        const response = await saveJournal(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(payload) }), entry);
        if (!response.ok) return response;
      }
      await db.insert(auditLog).values({ companyId, entityType: "journal_entry", entityId: id, action: remove ? "deleted" : "previous_version", details: JSON.stringify({ actor: { id: user.id, name: user.fullName, email: user.email }, entry, lines: oldLines }) });
      return Response.json({ success: true });
    });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not change journal." }, { status: 500 }); }
}
