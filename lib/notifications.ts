import "server-only";

import { after } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers, notifications } from "@/db/schema";
import { emailDeliveryConfigured, sendNotificationEmail } from "@/lib/smtp";

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
 * Tell the company's administrators and accountants (and the writer) that a cheque was written, or that its amount,
 * date, payee, number or bank changed. Rows are written inside the caller's transaction; emails go out after the
 * response, only for rows that were committed.
 */
export async function notifyChequeWritten(db: Executor & Inserter, input: { companyId: number; cheque: ChequeFields; bankName: string; actorId: number; actorName: string; previous?: ChequeFields & { bankName?: string } }) {
  const { cheque, bankName } = input;
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

/**
 * Email pending notifications (all of them, or the given ids). A row is claimed before sending so two runs never send
 * it twice. Without SMTP settings, an address or the user's consent the row is marked skipped; errors mark it failed.
 */
export async function deliverNotificationEmails(ids?: number[]) {
  const db = getDb();
  const claimed = await db.update(notifications).set({ emailStatus: "sending" })
    .where(and(eq(notifications.emailStatus, "pending"), ids ? inArray(notifications.id, ids.length ? ids : [0]) : undefined))
    .returning();
  if (!claimed.length) return { sent: 0, skipped: 0, failed: 0 };
  const configured = await emailDeliveryConfigured().catch(() => false);
  const users = await db.select({ id: appUsers.id, email: appUsers.email, fullName: appUsers.fullName, active: appUsers.active, notificationEmails: appUsers.notificationEmails }).from(appUsers).where(inArray(appUsers.id, [...new Set(claimed.map((row) => row.userId))]));
  const byId = new Map(users.map((user) => [user.id, user]));
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://comnet-enterprise-accounting.vercel.app";
  const result = { sent: 0, skipped: 0, failed: 0 };
  for (const row of claimed) {
    const user = byId.get(row.userId);
    if (!configured || !user?.active || !user.notificationEmails || !user.email) {
      await db.update(notifications).set({ emailStatus: "skipped" }).where(eq(notifications.id, row.id)); result.skipped += 1; continue;
    }
    try {
      await sendNotificationEmail({ to: user.email, name: user.fullName || user.email, title: row.title, body: row.body, appUrl });
      await db.update(notifications).set({ emailStatus: "sent", emailedAt: new Date().toISOString() }).where(eq(notifications.id, row.id)); result.sent += 1;
    } catch {
      await db.update(notifications).set({ emailStatus: "failed" }).where(eq(notifications.id, row.id)); result.failed += 1;
    }
  }
  return result;
}
