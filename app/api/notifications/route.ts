import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers, companies, notifications, transactions } from "@/db/schema";
import { requireApiUser } from "@/lib/auth";
import { sendDueChequeReminders } from "@/lib/notifications";
import { publicErrorMessage } from "@/lib/errors";

const message = (error: unknown) => publicErrorMessage(error, "Could not load notifications.");

/**
 * Scheduled PDC reminders not sent yet, soonest first: the same people a reminder will notify see it in advance
 * (administrators and accountants for their companies, All-Admins everywhere, other users for cheques they saved).
 */
async function upcomingReminders(user: { id: number; role: string; companyIds: number[] }) {
  if (user.role !== "all_admin" && !user.companyIds.length) return [];
  const companyScope = user.role === "all_admin" ? sql`` : sql`AND t.company_id IN (${sql.join(user.companyIds.map((id) => sql`${id}`), sql`, `)})`;
  const ownerScope = ["all_admin", "admin", "accountant"].includes(user.role) ? sql`` : sql`AND t.created_by_user_id = ${user.id}`;
  const result = await getDb().execute(sql`
    SELECT t.id, t.company_id AS "companyId", c.name AS "companyName", t.number, t.party, t.total, t.currency,
      t.transaction_date AS "chequeDate", t.reminder_at AS "remindAt"
    FROM transactions t JOIN companies c ON c.id = t.company_id
    WHERE t.type = 'cheque' AND t.reminder_at IS NOT NULL AND t.reminder_at > now() AND t.reminded_at IS NULL
      AND lower(t.status) NOT IN ('void', 'voided', 'cancelled', 'canceled') AND c.active ${companyScope} ${ownerScope}
    ORDER BY t.reminder_at, t.id
    LIMIT 20`);
  return result.rows.map((row) => ({ ...row, total: Number(row.total) }));
}

/** The signed-in user's latest notifications (companies they can still open), unread count and email preference. */
export async function GET(request: Request) {
  const user = await requireApiUser(request);
  if (user instanceof Response) return user;
  try {
    const db = getDb();
    // If the scheduler is late or down, due PDC reminders for this user's companies go out when the app checks.
    await sendDueChequeReminders(user.role === "all_admin" ? undefined : user.companyIds).catch(() => 0);
    const visible = and(eq(notifications.userId, user.id), user.role === "all_admin" ? undefined : user.companyIds.length ? inArray(notifications.companyId, user.companyIds) : sql`false`);
    const [rows, [unread], [preference], upcoming] = await Promise.all([
      db.select({ id: notifications.id, companyId: notifications.companyId, companyName: companies.name, kind: notifications.kind, title: notifications.title, body: notifications.body, transactionId: notifications.transactionId, transactionType: transactions.type, createdAt: notifications.createdAt, readAt: notifications.readAt })
        .from(notifications).innerJoin(companies, eq(companies.id, notifications.companyId)).leftJoin(transactions, eq(transactions.id, notifications.transactionId))
        .where(visible).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(50),
      db.select({ count: sql<number>`count(*)::int` }).from(notifications).where(and(visible, isNull(notifications.readAt))),
      db.select({ notificationEmails: appUsers.notificationEmails }).from(appUsers).where(eq(appUsers.id, user.id)).limit(1),
      upcomingReminders(user),
    ]);
    return Response.json({ notifications: rows, unread: unread?.count ?? 0, emailEnabled: preference?.notificationEmails ?? true, upcoming }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: message(error) }, { status: 500 }); }
}

/** Mark notifications read ({ ids } or { all: true }) and/or turn email copies on or off ({ emailEnabled }). */
export async function PATCH(request: Request) {
  const user = await requireApiUser(request, false, true);
  if (user instanceof Response) return user;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const ids = Array.isArray(payload.ids) ? payload.ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0).slice(0, 200) : [];
    if (!ids.length && payload.all !== true && typeof payload.emailEnabled !== "boolean") return Response.json({ error: "Choose notifications to mark read or an email setting." }, { status: 400 });
    const db = getDb();
    const now = new Date().toISOString();
    if (payload.all === true) await db.update(notifications).set({ readAt: now }).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
    else if (ids.length) await db.update(notifications).set({ readAt: now }).where(and(eq(notifications.userId, user.id), inArray(notifications.id, ids), isNull(notifications.readAt)));
    if (typeof payload.emailEnabled === "boolean") await db.update(appUsers).set({ notificationEmails: payload.emailEnabled, updatedAt: now }).where(eq(appUsers.id, user.id));
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: message(error) }, { status: 500 }); }
}
