import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, withWriteTransaction } from "@/db";
import { announcementDismissals, announcementRecipients, announcements, notifications } from "@/db/schema";
import { isAdministrator, requireCompanyAccess, type SessionUser } from "@/lib/auth";
import { publicErrorMessage } from "@/lib/errors";
import { queueNotificationEmails } from "@/lib/notifications";

// Announcements: administrators of a company (All-Admins for any company) post a message to all of its users or to
// chosen users. Recipients see it on the Announcements page until they press "Got it", and as a notice in the bell.

const TITLE_MAX = 120;
const BODY_MAX = 2000;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const failed = (error: unknown) => json({ error: publicErrorMessage(error, "Could not update announcements.") }, 500);

/** Active users of the company (and All-Admins), as the recipient picker and the "all users" audience. */
async function companyUsers(companyId: number) {
  const result = await getDb().execute(sql`
    SELECT u.id, u.full_name AS "fullName", u.email, u.role FROM app_users u
    WHERE u.active AND (u.role = 'all_admin' OR EXISTS (SELECT 1 FROM app_user_companies c WHERE c.user_id = u.id AND c.company_id = ${companyId}))
    ORDER BY lower(coalesce(nullif(u.full_name, ''), u.email))`);
  return result.rows.map((row) => ({ id: Number(row.id), fullName: String(row.fullName ?? ""), email: String(row.email), role: String(row.role) }));
}

/** Announcements this user should see now in the company: current, not removed, meant for them and not dismissed. */
async function activeFor(user: SessionUser, companyId: number) {
  const result = await getDb().execute(sql`
    SELECT a.id, a.title, a.body, a.created_by_name AS "createdByName", a.created_at AS "createdAt", a.ends_at AS "endsAt"
    FROM announcements a
    WHERE a.company_id = ${companyId} AND a.removed_at IS NULL AND (a.ends_at IS NULL OR a.ends_at > now())
      AND (a.audience = 'all' OR EXISTS (SELECT 1 FROM announcement_recipients r WHERE r.announcement_id = a.id AND r.user_id = ${user.id}))
      AND NOT EXISTS (SELECT 1 FROM announcement_dismissals d WHERE d.announcement_id = a.id AND d.user_id = ${user.id})
    ORDER BY a.created_at DESC, a.id DESC LIMIT 20`);
  return result.rows;
}

function readFields(payload: Record<string, unknown>) {
  const title = String(payload.title ?? "").replace(/\s+/g, " ").trim();
  const body = String(payload.body ?? "").replace(/\r\n/g, "\n").trim();
  const endsAtText = String(payload.endsAt ?? "").trim();
  if (!title || title.length > TITLE_MAX) return { error: `Write a title (up to ${TITLE_MAX} characters).` };
  if (body.length > BODY_MAX) return { error: `The message can have up to ${BODY_MAX} characters.` };
  let endsAt: string | null = null;
  if (endsAtText) {
    const date = new Date(endsAtText);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) return { error: "The end date must be in the future." };
    endsAt = date.toISOString();
  }
  return { title, body, endsAt };
}

/** GET ?companyId= → `active` for the signed-in user; administrators with `manage=1` also get every announcement and the users. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyId = Number(url.searchParams.get("companyId"));
  const user = await requireCompanyAccess(request, companyId);
  if (user instanceof Response) return user;
  try {
    const active = await activeFor(user, companyId);
    if (url.searchParams.get("manage") !== "1" || !isAdministrator(user)) return json({ active, canManage: isAdministrator(user) });
    const db = getDb();
    const rows = await db.select().from(announcements).where(eq(announcements.companyId, companyId)).orderBy(desc(announcements.createdAt), desc(announcements.id)).limit(50);
    const ids = rows.map((row) => row.id);
    const [recipients, dismissed, users] = await Promise.all([
      ids.length ? db.select().from(announcementRecipients).where(inArray(announcementRecipients.announcementId, ids)) : Promise.resolve([]),
      ids.length ? db.select({ announcementId: announcementDismissals.announcementId, count: sql<number>`count(*)::int` }).from(announcementDismissals).where(inArray(announcementDismissals.announcementId, ids)).groupBy(announcementDismissals.announcementId) : Promise.resolve([]),
      companyUsers(companyId),
    ]);
    const managed = rows.map((row) => ({
      ...row,
      userIds: recipients.filter((entry) => entry.announcementId === row.id).map((entry) => entry.userId),
      seenBy: Number(dismissed.find((entry) => entry.announcementId === row.id)?.count ?? 0),
    }));
    return json({ active, canManage: true, managed, users });
  } catch (error) { return failed(error); }
}

/** POST { companyId, title, body, audience: "all" | "users", userIds?, endsAt? } (administrators). */
export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return json({ error: "Invalid request." }, 400); }
  const companyId = Number(payload.companyId);
  const user = await requireCompanyAccess(request, companyId, true, true);
  if (user instanceof Response) return user;
  const fields = readFields(payload);
  if ("error" in fields) return json({ error: fields.error }, 400);
  const audience = payload.audience === "users" ? "users" : "all";
  try {
    const users = await companyUsers(companyId);
    const allowed = new Set(users.map((entry) => entry.id));
    const chosen = audience === "users" ? [...new Set((Array.isArray(payload.userIds) ? payload.userIds : []).map(Number))].filter((id) => allowed.has(id)) : [];
    if (audience === "users" && !chosen.length) return json({ error: "Choose at least one user of this company." }, 400);
    const recipients = audience === "all" ? users.map((entry) => entry.id) : chosen;
    let noticeIds: number[] = [];
    let created!: typeof announcements.$inferSelect;
    const saved = await withWriteTransaction(async () => {
      const db = getDb();
      [created] = await db.insert(announcements).values({ companyId, title: fields.title, body: fields.body, audience, endsAt: fields.endsAt, createdByUserId: user.id, createdByName: user.fullName || user.email }).returning();
      if (chosen.length) await db.insert(announcementRecipients).values(chosen.map((userId) => ({ announcementId: created.id, userId })));
      // The bell notice (and its email copy) for everyone else; the author already knows.
      const notify = recipients.filter((userId) => userId !== user.id);
      if (notify.length) {
        const rows = await db.insert(notifications).values(notify.map((userId) => ({ companyId, userId, kind: "announcement", title: `Announcement: ${fields.title}`, body: fields.body.slice(0, 500) || `From ${user.fullName || user.email}`, announcementId: created.id }))).returning();
        noticeIds = rows.map((row) => row.id);
      }
      return json({ ok: true });
    });
    if (!saved.ok) return saved;
    queueNotificationEmails(noticeIds);
    return json({ announcement: created, recipients: recipients.length }, 201);
  } catch (error) { return failed(error); }
}

/**
 * PATCH { companyId, id, action }: "dismiss" (any recipient: hides the banner and marks the bell notice read),
 * "update" with title/body/endsAt and "remove" (administrators).
 */
export async function PATCH(request: Request) {
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return json({ error: "Invalid request." }, 400); }
  const companyId = Number(payload.companyId), id = Number(payload.id), action = String(payload.action ?? "");
  const user = await requireCompanyAccess(request, companyId, action === "dismiss" ? false : true, true);
  if (user instanceof Response) return user;
  if (!Number.isSafeInteger(id) || id <= 0 || !["dismiss", "update", "remove"].includes(action)) return json({ error: "Choose an announcement and action." }, 400);
  try {
    const db = getDb();
    const [existing] = await db.select().from(announcements).where(and(eq(announcements.id, id), eq(announcements.companyId, companyId))).limit(1);
    if (!existing) return json({ error: "Announcement not found." }, 404);
    const now = new Date().toISOString();
    if (action === "dismiss") {
      await db.insert(announcementDismissals).values({ announcementId: id, userId: user.id }).onConflictDoNothing();
      await db.update(notifications).set({ readAt: now }).where(and(eq(notifications.announcementId, id), eq(notifications.userId, user.id), sql`${notifications.readAt} IS NULL`));
      return json({ ok: true });
    }
    if (action === "remove") {
      await withWriteTransaction(async () => {
        await getDb().update(announcements).set({ removedAt: now, updatedAt: now }).where(eq(announcements.id, id));
        await getDb().delete(notifications).where(eq(notifications.announcementId, id));
        return json({ ok: true });
      });
      return json({ ok: true });
    }
    const fields = readFields(payload);
    if ("error" in fields) return json({ error: fields.error }, 400);
    await withWriteTransaction(async () => {
      const tx = getDb();
      await tx.update(announcements).set({ title: fields.title, body: fields.body, endsAt: fields.endsAt, updatedAt: now }).where(eq(announcements.id, id));
      await tx.update(notifications).set({ title: `Announcement: ${fields.title}`, body: fields.body.slice(0, 500) || `From ${existing.createdByName}` }).where(eq(notifications.announcementId, id));
      return json({ ok: true });
    });
    return json({ ok: true });
  } catch (error) { return failed(error); }
}
