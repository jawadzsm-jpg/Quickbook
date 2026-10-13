import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers, companies, notifications, transactions } from "@/db/schema";
import { requireApiUser } from "@/lib/auth";
import { sendDueChequeReminders } from "@/lib/notifications";
import { publicErrorMessage } from "@/lib/errors";

const message = (error: unknown) => publicErrorMessage(error, "Could not load notifications.");

/** The signed-in user's latest notifications (companies they can still open), unread count and email preference. */
export async function GET(request: Request) {
  const user = await requireApiUser(request);
  if (user instanceof Response) return user;
  try {
    const db = getDb();
    // If the scheduler is late or down, due PDC reminders for this user's companies go out when the app checks.
    await sendDueChequeReminders(user.role === "all_admin" ? undefined : user.companyIds).catch(() => 0);
    const visible = and(eq(notifications.userId, user.id), user.role === "all_admin" ? undefined : user.companyIds.length ? inArray(notifications.companyId, user.companyIds) : sql`false`);
    const [rows, [unread], [preference]] = await Promise.all([
      db.select({ id: notifications.id, companyId: notifications.companyId, companyName: companies.name, kind: notifications.kind, title: notifications.title, body: notifications.body, transactionId: notifications.transactionId, transactionType: transactions.type, createdAt: notifications.createdAt, readAt: notifications.readAt })
        .from(notifications).innerJoin(companies, eq(companies.id, notifications.companyId)).leftJoin(transactions, eq(transactions.id, notifications.transactionId))
        .where(visible).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(50),
      db.select({ count: sql<number>`count(*)::int` }).from(notifications).where(and(visible, isNull(notifications.readAt))),
      db.select({ notificationEmails: appUsers.notificationEmails }).from(appUsers).where(eq(appUsers.id, user.id)).limit(1),
    ]);
    return Response.json({ notifications: rows, unread: unread?.count ?? 0, emailEnabled: preference?.notificationEmails ?? true }, { headers: { "Cache-Control": "no-store" } });
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
