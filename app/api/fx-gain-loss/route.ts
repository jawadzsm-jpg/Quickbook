import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, withWriteTransaction } from "@/db";
import { accounts, auditLog, billPaymentAllocations, companies, invoicePaymentAllocations, journalEntries, journalLines, transactions } from "@/db/schema";
import { canAccessCompany, requireApiUser } from "@/lib/auth";
import { readJsonBody } from "@/lib/api";
import { RequestError, failureResponse } from "@/lib/errors";
import { ensureFxGainLossAccount, exchangeDifference, unpostedFxPaymentsSql } from "@/lib/fx-gain-loss";
import { guardFiledPeriod } from "@/lib/period-lock";

// Realised Gains & Losses → "Post past exchange differences": payments saved before differences were posted still
// leave them in Accounts Receivable / Payable. This lists them (GET) and posts each one once (POST, administrators):
// the receivable/payable line moves to the booked value and the difference goes to Exchange Gain or Loss.

type Payment = typeof transactions.$inferSelect;
type Pending = { id: number; number: string; type: string; date: string; party: string; currency: string; exchangeRate: number; difference: number };

async function pendingPayments(companyId: number, forUpdate = false) {
  const db = getDb();
  const [company] = await db.select({ baseCurrency: companies.baseCurrency }).from(companies).where(eq(companies.id, companyId)).limit(1);
  if (!company) throw new RequestError("Company not found.", 404);
  const fx = await ensureFxGainLossAccount(db, companyId, company.baseCurrency);
  const ids = (await db.execute(unpostedFxPaymentsSql(companyId, fx.id))).rows.map((row) => Number(row.id));
  if (!ids.length) return { fx, pending: [] as Array<Pending & { payment: Payment }> };
  const query = db.select().from(transactions).where(inArray(transactions.id, ids));
  const payments = forUpdate ? await query.for("update") : await query;
  const invoiceLinks = await db.select().from(invoicePaymentAllocations).where(inArray(invoicePaymentAllocations.paymentId, ids));
  const billLinks = await db.select().from(billPaymentAllocations).where(inArray(billPaymentAllocations.paymentId, ids));
  const documentIds = [...new Set([...invoiceLinks.map((link) => link.invoiceId), ...billLinks.map((link) => link.billId), ...payments.flatMap((payment) => [payment.invoiceId, payment.billId].filter((id): id is number => Boolean(id)))])];
  const documents = new Map((documentIds.length ? await db.select().from(transactions).where(inArray(transactions.id, documentIds)) : []).map((row) => [row.id, row]));
  const pending: Array<Pending & { payment: Payment }> = [];
  for (const payment of payments.sort((a, b) => a.transactionDate.localeCompare(b.transactionDate) || a.id - b.id)) {
    const customer = payment.type === "customer payment";
    let links = customer ? invoiceLinks.filter((link) => link.paymentId === payment.id).map((link) => ({ documentId: link.invoiceId, amount: link.amount })) : billLinks.filter((link) => link.paymentId === payment.id).map((link) => ({ documentId: link.billId, amount: link.amount }));
    const single = customer ? payment.invoiceId : payment.billId;
    if (!links.length && single) links = [{ documentId: single, amount: Math.min(payment.total, documents.get(single)?.total ?? 0) }];
    const settled = links.flatMap((link) => {
      const document = documents.get(link.documentId);
      return document && document.currency === payment.currency && document.party === payment.party ? [{ amount: link.amount, bookedRate: document.exchangeRate }] : [];
    });
    const difference = exchangeDifference(settled, payment.exchangeRate);
    if (difference) pending.push({ id: payment.id, number: payment.number, type: payment.type, date: payment.transactionDate, party: payment.party, currency: payment.currency, exchangeRate: payment.exchangeRate, difference, payment });
  }
  return { fx, pending };
}

// Gain (+) or loss (−): booked above the payment value is a loss on receivables and a gain on payables.
const gainLoss = (row: Pending) => row.type === "customer payment" ? -row.difference : row.difference;
const summary = (pending: Pending[]) => ({ count: pending.length, gainLoss: Math.round(pending.reduce((sum, row) => sum + gainLoss(row), 0) * 100) / 100, payments: pending.map((row) => ({ id: row.id, number: row.number, type: row.type, date: row.date, party: row.party, currency: row.currency, exchangeRate: row.exchangeRate, gainLoss: gainLoss(row) })) });

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request, "accounting:manage");
    if (user instanceof Response) return user;
    const companyId = Number(new URL(request.url).searchParams.get("companyId"));
    if (!Number.isSafeInteger(companyId) || companyId <= 0 || !canAccessCompany(user, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    // Reading may create the Exchange Gain or Loss account, so it runs as a write.
    return await withWriteTransaction(async () => Response.json(summary((await pendingPayments(companyId)).pending), { headers: { "Cache-Control": "no-store" } }));
  } catch (error) { return failureResponse(error, randomUUID(), "/api/fx-gain-loss"); }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request, true, true);
    if (user instanceof Response) return user;
    const payload = await readJsonBody(request, 10_000) as { companyId?: unknown };
    const companyId = Number(payload.companyId);
    if (!Number.isSafeInteger(companyId) || companyId <= 0 || !canAccessCompany(user, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    return await withWriteTransaction(async () => {
      const db = getDb();
      if (process.env.COMNET_LOCAL_DB !== "1") await db.execute(sql`select pg_advisory_xact_lock(731460, ${companyId})`);
      const { fx, pending } = await pendingPayments(companyId, true);
      if (!pending.length) return Response.json({ posted: 0, gainLoss: 0 });
      const locked = await guardFiledPeriod(request, companyId, pending.map((row) => row.date), "post past exchange differences", user);
      if (locked) return locked;
      const controlAccounts = new Map((await db.select({ id: accounts.id, type: accounts.type }).from(accounts).where(and(eq(accounts.companyId, companyId), inArray(accounts.type, ["Accounts Receivable", "Accounts Payable"])))).map((account) => [account.id, account.type]));
      const posted: Pending[] = [];
      for (const row of pending) {
        const [entry] = await db.select().from(journalEntries).where(and(eq(journalEntries.transactionId, row.id), eq(journalEntries.posted, true))).limit(1);
        if (!entry) continue;
        const lines = await db.select().from(journalLines).where(eq(journalLines.journalEntryId, entry.id));
        const customer = row.type === "customer payment";
        const control = lines.find((line) => line.accountId && controlAccounts.get(line.accountId) === (customer ? "Accounts Receivable" : "Accounts Payable") && (customer ? line.credit > 0 : line.debit > 0));
        if (!control) continue;
        const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
        if (customer) await db.update(journalLines).set({ credit: round(control.credit + row.difference) }).where(eq(journalLines.id, control.id));
        else await db.update(journalLines).set({ debit: round(control.debit + row.difference) }).where(eq(journalLines.id, control.id));
        const fxDebit = customer ? row.difference : -row.difference;
        await db.insert(journalLines).values({ journalEntryId: entry.id, accountId: fx.id, accountName: fx.name, debit: round(Math.max(fxDebit, 0)), credit: round(Math.max(-fxDebit, 0)) });
        posted.push(row);
      }
      await db.insert(auditLog).values({ companyId, action: "posted", entityType: "fx_gain_loss", entityId: fx.id, details: JSON.stringify({ userId: user.id, userName: user.fullName || user.email, ...summary(posted) }) });
      return Response.json({ posted: posted.length, gainLoss: summary(posted).gainLoss });
    });
  } catch (error) { return failureResponse(error, randomUUID(), "/api/fx-gain-loss"); }
}
