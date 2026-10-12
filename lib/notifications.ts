import "server-only";

import { after } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers, notifications } from "@/db/schema";
import { emailDeliveryConfigured, openMailer, sendNotificationEmail, type Mailer } from "@/lib/smtp";
import { friendlyEmailError } from "@/lib/email-errors";
import { daysUntil, isPostDated } from "@/lib/cheque-reminders";

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<{ rows: Record<string, unknown>[] }> };
type Inserter = Pick<ReturnType<typeof getDb>, "insert">;

const money = (amount: number, currency: string) => `${currency} ${amount.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" }).format(date);
};

/** Active administrators and accountants of the company (all-company administrators included), plus `alsoUserId`. */
export async function companyNotificationRecipients(db: Executor, companyId: number, alsoUserId?: number): Promise<number[]> {
  const result = await db.execute(sql`
    SELECT u.id FROM app_users u
    WHERE u.active AND (u.role = 'all_admin' OR (u.role IN ('admin', 'accountant') AND EXISTS (SELECT 1 FROM app_user_companies c WHERE c.user_id = u.id AND c.company_id = ${companyId})))
    ORDER BY u.id`);
  const ids = result.rows.map((row) => Number(row.id)).filter((id) => Number.isSafeInteger(id) && id > 0);
  if (alsoUserId && !ids.includes(alsoUserId)) ids.push(alsoUserId);
  return ids;
}

type ChequeFields = { id: number; number: string; party: string; total: number; currency: string; transactionDate: string; status?: string };

/** The fields a cheque notice reports; a change to any of them on edit sends an "updated" notice. */
const chequeSignature = (cheque: ChequeFields, bankName: string) => JSON.stringify([cheque.number, cheque.party, Number(cheque.total), cheque.currency, cheque.transactionDate, bankName]);

/**
 * Tell the company's administrators and accountants (and the writer) that a post-dated cheque was written, or that its amount,
 * date, payee, number or bank changed. Rows are written inside the caller's transaction; emails go out after the
 * response, only for rows that were committed.
 */
export async function notifyChequeWritten(db: Executor & Inserter, input: { companyId: number; cheque: ChequeFields; bankName: string; actorId: number; actorName: string; previous?: ChequeFields & { bankName?: string } }) {
  const { cheque, bankName } = input;
  // Only post-dated cheques (dated after today in the UAE) are announced; cheques dated today or earlier are not.
  if (!isPostDated(cheque.transactionDate)) return [];
  if (input.previous && chequeSignature(input.previous, input.previous.bankName ?? bankName) === chequeSignature(cheque, bankName)) return [];
  const updated = Boolean(input.previous);
  const title = `Cheque ${cheque.number} ${updated ? "updated" : "written"}: ${money(Number(cheque.total), cheque.currency)}`;
  const body = [`Pay to ${cheque.party || "—"}`, `cheque date ${day(cheque.transactionDate)}`, bankName && `from ${bankName}`, `by ${input.actorName}`].filter(Boolean).join(" · ");
  const recipients = await companyNotificationRecipients(db, input.companyId, input.actorId);
  if (!recipients.length) return [];
  const rows = await db.insert(notifications).values(recipients.map((userId) => ({ companyId: input.companyId, userId, kind: updated ? "cheque-updated" : "cheque-written", title, body, transactionId: cheque.id }))).returning();
  const ids = rows.map((row) => row.id);
  queueNotificationEmails(ids);
  return ids;
}

/** Send the email copies after the response. Outside a request (tests, scripts) they stay pending for a later run. */
export function queueNotificationEmails(ids: number[]) {
  if (!ids.length) return;
  try { after(() => deliverNotificationEmails(ids)); } catch { /* No request scope: left pending. */ }
}

/** A failed email is tried again on later runs until this many attempts. */
export const NOTIFICATION_EMAIL_ATTEMPTS = 3;
/** A row left "sending" this long (the run was cut off) is picked up again. */
const STALE_SENDING = sql`now() - interval '15 minutes'`;

/**
 * Email pending notifications (all of them, or the given ids), plus failed ones with attempts left and ones a cut-off
 * run left "sending". A row is claimed before sending so two runs never send it twice. Without SMTP settings, an
 * address or the user's consent the row is marked skipped; errors mark it failed with the reason. One connection is
 * used for the whole run.
 */
export async function deliverNotificationEmails(ids?: number[]) {
  const db = getDb();
  const due = sql`(${notifications.emailStatus} = 'pending'
    OR (${notifications.emailStatus} = 'failed' AND ${notifications.emailAttempts} < ${NOTIFICATION_EMAIL_ATTEMPTS})
    OR (${notifications.emailStatus} = 'sending' AND ${notifications.emailClaimedAt} < ${STALE_SENDING}))`;
  const claimed = await db.update(notifications).set({ emailStatus: "sending", emailClaimedAt: sql`now()`, emailAttempts: sql`${notifications.emailAttempts} + 1` })
    .where(and(due, ids ? inArray(notifications.id, ids.length ? ids : [0]) : undefined))
    .returning();
  if (!claimed.length) return { sent: 0, skipped: 0, failed: 0 };
  const configured = await emailDeliveryConfigured().catch(() => false);
  const users = await db.select({ id: appUsers.id, email: appUsers.email, fullName: appUsers.fullName, active: appUsers.active, notificationEmails: appUsers.notificationEmails }).from(appUsers).where(inArray(appUsers.id, [...new Set(claimed.map((row) => row.userId))]));
  const byId = new Map(users.map((user) => [user.id, user]));
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://comnet-enterprise-accounting.vercel.app";
  const result = { sent: 0, skipped: 0, failed: 0 };
  let mailer: Mailer | null = null;
  for (const row of claimed) {
    const user = byId.get(row.userId);
    if (!configured || !user?.active || !user.notificationEmails || !user.email) {
      await db.update(notifications).set({ emailStatus: "skipped" }).where(eq(notifications.id, row.id)); result.skipped += 1; continue;
    }
    try {
      mailer ??= await openMailer();
      await sendNotificationEmail({ to: user.email, name: user.fullName || user.email, title: row.title, body: row.body, appUrl }, mailer);
      await db.update(notifications).set({ emailStatus: "sent", emailedAt: new Date().toISOString(), emailError: "" }).where(eq(notifications.id, row.id)); result.sent += 1;
    } catch (error) {
      await db.update(notifications).set({ emailStatus: "failed", emailError: friendlyEmailError(error).slice(0, 500) }).where(eq(notifications.id, row.id)); result.failed += 1;
    }
  }
  mailer?.client.close();
  return result;
}

/**
 * PDC reminders: cheques whose reminder is due and not yet sent notify the company's administrators and accountants
 * (and whoever saved the cheque). Claiming and marking happen in one statement, so a reminder is sent only once even
 * when the scheduler and an open app check at the same time. `companyIds` limits the check (an open app checks only
 * its user's companies).
 */
export async function sendDueChequeReminders(companyIds?: number[]) {
  if (companyIds && !companyIds.length) return 0;
  const db = getDb();
  const scope = companyIds ? sql`AND company_id IN (${sql.join(companyIds.map((id) => sql`${id}`), sql`, `)})` : sql``;
  const due = (await db.execute(sql`
    UPDATE transactions t SET reminded_at = now()
    WHERE t.id IN (
      SELECT id FROM transactions
      WHERE type = 'cheque' AND reminder_at IS NOT NULL AND reminder_at <= now() AND reminded_at IS NULL
        AND lower(status) NOT IN ('void', 'voided', 'cancelled', 'canceled') ${scope}
      FOR UPDATE SKIP LOCKED)
    RETURNING t.id, t.company_id, t.number, t.party, t.total, t.currency, t.transaction_date, t.created_by_user_id,
      (SELECT jl.account_name FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id WHERE je.transaction_id = t.id AND jl.credit > 0 ORDER BY jl.id LIMIT 1) AS bank_name`)).rows;
  const ids: number[] = [];
  for (const cheque of due) {
    const companyId = Number(cheque.company_id), date = String(cheque.transaction_date);
    const recipients = await companyNotificationRecipients(db, companyId, cheque.created_by_user_id ? Number(cheque.created_by_user_id) : undefined);
    if (!recipients.length) continue;
    const title = `PDC ${cheque.number} due ${daysUntil(date)}: ${money(Number(cheque.total), String(cheque.currency))}`;
    const body = [`Pay to ${cheque.party || "—"}`, `cheque date ${day(date)}`, cheque.bank_name && `from ${cheque.bank_name}`, "make sure the bank account has the funds"].filter(Boolean).join(" · ");
    const rows = await db.insert(notifications).values(recipients.map((userId) => ({ companyId, userId, kind: "pdc-reminder", title, body, transactionId: Number(cheque.id) }))).returning();
    ids.push(...rows.map((row) => row.id));
  }
  queueNotificationEmails(ids);
  return due.length;
}
