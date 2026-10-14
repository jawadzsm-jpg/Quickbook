import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers, auditLog, emailListContacts } from "@/db/schema";
import { isAdministrator, requireCompanyAccess, type SessionUser } from "@/lib/auth";
import { canUseEmailList, EMAIL_LIST_IMPORT_MAX, EMAIL_LIST_MAX, EMAIL_LIST_NAME_MAX, emailListLabel, isEmailListType, type EmailListType } from "@/lib/email-lists";
import { isValidEmail } from "@/lib/email-validation";
import { databaseErrorCode, publicErrorMessage } from "@/lib/errors";

// The Sales list (customers) and Purchase list (suppliers) for Inventory Overview emails. Each user's addresses are
// private to them; Admins and All-Admins see and manage everyone's in the company. Sales users use the Sales list only
// and Viewers neither (lib/email-lists.ts canUseEmailList).

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const failed = (error: unknown) => json({ error: publicErrorMessage(error, "Could not update the email list.") }, 500);

async function access(request: Request, companyId: number, type: unknown, mutating = false) {
  const user = await requireCompanyAccess(request, companyId, false, mutating);
  if (user instanceof Response) return user;
  if (!isEmailListType(type)) return json({ error: "Choose the Sales or Purchase list." }, 400);
  return canUseEmailList(user.role, type) ? { user, type } : json({ error: `Your role cannot use the ${emailListLabel(type)}.` }, 403);
}

/** The user's own addresses; administrators get everyone's in the company. */
const ownedBy = (user: SessionUser): SQL | undefined => isAdministrator(user) ? undefined : eq(emailListContacts.createdByUserId, user.id);

const listOf = (user: SessionUser, companyId: number, type: EmailListType) => getDb().select({ id: emailListContacts.id, name: emailListContacts.name, company: emailListContacts.company, email: emailListContacts.email, ownerName: sql<string>`coalesce(nullif(${appUsers.fullName}, ''), ${appUsers.email}, '')` })
  .from(emailListContacts).leftJoin(appUsers, eq(appUsers.id, emailListContacts.createdByUserId))
  .where(and(eq(emailListContacts.companyId, companyId), eq(emailListContacts.listType, type), ownedBy(user)))
  .orderBy(asc(sql`lower(coalesce(nullif(${emailListContacts.name}, ''), ${emailListContacts.email}))`), asc(emailListContacts.id));

/** GET ?companyId=&type=sales|purchase → the list's contacts. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const companyId = Number(params.get("companyId"));
  const allowed = await access(request, companyId, params.get("type"));
  if (allowed instanceof Response) return allowed;
  try { return json({ contacts: await listOf(allowed.user, companyId, allowed.type), seesAll: isAdministrator(allowed.user) }); } catch (error) { return failed(error); }
}

/** POST { companyId, type, contacts: [{ name, company, email }] } — add contacts (typed or imported from CSV); repeats are skipped. */
export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return json({ error: "Invalid request." }, 400); }
  const companyId = Number(payload.companyId);
  const allowed = await access(request, companyId, payload.type, true);
  if (allowed instanceof Response) return allowed;
  const raw = Array.isArray(payload.contacts) ? payload.contacts : [];
  if (!raw.length) return json({ error: "Add at least one email address." }, 400);
  if (raw.length > EMAIL_LIST_IMPORT_MAX) return json({ error: `Import at most ${EMAIL_LIST_IMPORT_MAX.toLocaleString("en")} addresses at a time.` }, 400);
  const seen = new Set<string>();
  const rows: { name: string; company: string; email: string }[] = [];
  let invalid = 0;
  for (const entry of raw) {
    const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const email = String(item.email ?? "").trim().toLowerCase();
    if (!isValidEmail(email)) { invalid += 1; continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, EMAIL_LIST_NAME_MAX);
    rows.push({ name: clean(item.name), company: clean(item.company), email });
  }
  if (!rows.length) return json({ error: "No valid email addresses to add." }, 400);
  try {
    const db = getDb();
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(emailListContacts).where(and(eq(emailListContacts.companyId, companyId), eq(emailListContacts.listType, allowed.type), eq(emailListContacts.createdByUserId, allowed.user.id)));
    if (Number(count) + rows.length > EMAIL_LIST_MAX) return json({ error: `A list can hold at most ${EMAIL_LIST_MAX.toLocaleString("en")} addresses. Remove some first.` }, 400);
    const added = await db.insert(emailListContacts).values(rows.map((row) => ({ companyId, listType: allowed.type, ...row, createdByUserId: allowed.user.id })))
      .onConflictDoNothing().returning();
    if (added.length) await db.insert(auditLog).values({ companyId, action: "created", entityType: "email_list", entityId: added[0].id, details: `${added.length} address(es) added to the ${emailListLabel(allowed.type)} by ${allowed.user.email}` });
    return json({ added: added.length, alreadyListed: rows.length - added.length, invalid, contacts: await listOf(allowed.user, companyId, allowed.type) }, 201);
  } catch (error) { return failed(error); }
}

/** Edit one address: its name, company and email. Only the user's own (administrators: anyone's in the company). */
async function updateContact(user: SessionUser, companyId: number, type: EmailListType, payload: Record<string, unknown>) {
  const id = Number(payload.id);
  const email = String(payload.email ?? "").trim().toLowerCase();
  if (!Number.isSafeInteger(id) || id <= 0) return json({ error: "Choose the address to edit." }, 400);
  if (!isValidEmail(email)) return json({ error: "Enter a valid email address." }, 400);
  const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, EMAIL_LIST_NAME_MAX);
  try {
    const db = getDb();
    const [saved] = await db.update(emailListContacts).set({ name: clean(payload.name), company: clean(payload.company), email })
      .where(and(eq(emailListContacts.id, id), eq(emailListContacts.companyId, companyId), eq(emailListContacts.listType, type), ownedBy(user))).returning();
    if (!saved) return json({ error: "This address is no longer in the list." }, 404);
    await db.insert(auditLog).values({ companyId, action: "updated", entityType: "email_list", entityId: saved.id, details: `${saved.email} edited in the ${emailListLabel(type)} by ${user.email}` });
    return json({ contacts: await listOf(user, companyId, type) });
  } catch (error) {
    // The same address can be listed once per user and list.
    if (databaseErrorCode(error) === "23505") return json({ error: `${email} is already in this list.` }, 409);
    return failed(error);
  }
}

/**
 * PATCH { companyId, type, action: "update", id, name, company, email } edits one address (above).
 * PATCH { companyId, type, action: "remove", ids } — remove contacts. Removing goes through PATCH because HTTP DELETE
 * is reserved for administrators across the app.
 */
export async function PATCH(request: Request) {
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return json({ error: "Invalid request." }, 400); }
  const companyId = Number(payload.companyId);
  const allowed = await access(request, companyId, payload.type, true);
  if (allowed instanceof Response) return allowed;
  if (payload.action === "update") return updateContact(allowed.user, companyId, allowed.type, payload);
  const ids = [...new Set((Array.isArray(payload.ids) ? payload.ids : []).map(Number))].filter((id) => Number.isSafeInteger(id) && id > 0);
  if (payload.action !== "remove" || !ids.length || ids.length > EMAIL_LIST_MAX) return json({ error: "Choose the addresses to remove." }, 400);
  try {
    const db = getDb();
    const removed = await db.delete(emailListContacts).where(and(eq(emailListContacts.companyId, companyId), eq(emailListContacts.listType, allowed.type), inArray(emailListContacts.id, ids), ownedBy(allowed.user))).returning();
    if (removed.length) await db.insert(auditLog).values({ companyId, action: "deleted", entityType: "email_list", entityId: removed[0].id, details: `${removed.length} address(es) removed from the ${emailListLabel(allowed.type)} by ${allowed.user.email}` });
    return json({ removed: removed.length, contacts: await listOf(allowed.user, companyId, allowed.type) });
  } catch (error) { return failed(error); }
}
