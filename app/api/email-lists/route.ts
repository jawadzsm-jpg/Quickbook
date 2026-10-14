import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers, auditLog, emailListCategories, emailListContacts } from "@/db/schema";
import { isAdministrator, requireCompanyAccess, type SessionUser } from "@/lib/auth";
import { canUseEmailList, cleanEmailListCategory, emailListCategories as emailListCategoryNames, EMAIL_LIST_IDS_MAX, EMAIL_LIST_IMPORT_MAX, EMAIL_LIST_NAME_MAX, emailListLabel, isEmailListType, type EmailListOwner, type EmailListType } from "@/lib/email-lists";
import { isValidEmail } from "@/lib/email-validation";
import { databaseErrorCode, publicErrorMessage } from "@/lib/errors";

// The Sales list (customers) and Purchase list (suppliers) for Inventory Overview emails. Each user's addresses are
// private to them; Admins and All-Admins see and manage everyone's in the company, one user's list at a time or all
// together, and can add to any user's list. Each address may have a category (a country, region…) to filter by; each
// owner's categories are also saved (email_list_categories) so they can be added, renamed and deleted.
// Sales users use the Sales list only and Viewers neither (lib/email-lists.ts canUseEmailList).

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

/**
 * Whose list is shown: a user's own always; administrators choose with `view` = "all" (everyone's, the default),
 * "me" or a user id.
 */
function viewOf(user: SessionUser, view: unknown): number | undefined {
  if (!isAdministrator(user) || view === "me") return user.id;
  const id = Number(view);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

const listOf = (user: SessionUser, companyId: number, type: EmailListType, view?: unknown) => {
  const owner = viewOf(user, view);
  return getDb().select({ id: emailListContacts.id, name: emailListContacts.name, company: emailListContacts.company, category: emailListContacts.category, email: emailListContacts.email, ownerId: emailListContacts.createdByUserId, ownerName: sql<string>`coalesce(nullif(${appUsers.fullName}, ''), ${appUsers.email}, '')` })
    .from(emailListContacts).leftJoin(appUsers, eq(appUsers.id, emailListContacts.createdByUserId))
    .where(and(eq(emailListContacts.companyId, companyId), eq(emailListContacts.listType, type), owner === undefined ? undefined : eq(emailListContacts.createdByUserId, owner)))
    .orderBy(asc(sql`lower(coalesce(nullif(${emailListContacts.name}, ''), ${emailListContacts.email}))`), asc(emailListContacts.id));
};

/**
 * The users whose list an administrator can open: active users of the company whose role may use this list, and
 * anyone who already has addresses in it. `canAdd` is false for a user who has addresses but may no longer use it.
 */
async function ownersOf(companyId: number, type: EmailListType): Promise<(EmailListOwner & { canAdd: boolean })[]> {
  const result = await getDb().execute(sql`SELECT u.id, coalesce(nullif(u.full_name, ''), u.email) AS name, u.role, u.active,
      (u.role = 'all_admin' OR EXISTS (SELECT 1 FROM app_user_companies c WHERE c.user_id = u.id AND c.company_id = ${companyId})) AS member,
      EXISTS (SELECT 1 FROM email_list_contacts e WHERE e.created_by_user_id = u.id AND e.company_id = ${companyId} AND e.list_type = ${type}) AS listed
    FROM app_users u ORDER BY lower(coalesce(nullif(u.full_name, ''), u.email)), u.id`);
  return result.rows.flatMap((row) => {
    const canAdd = row.active === true && row.member === true && canUseEmailList(String(row.role), type);
    return canAdd || row.listed === true ? [{ id: Number(row.id), name: String(row.name ?? ""), canAdd }] : [];
  });
}

/** The saved categories of the list shown (one owner's, or everyone's for an administrator's "all"), sorted. */
async function categoriesOf(user: SessionUser, companyId: number, type: EmailListType, view?: unknown) {
  const owner = viewOf(user, view);
  const rows = await getDb().select({ name: emailListCategories.name }).from(emailListCategories)
    .where(and(eq(emailListCategories.companyId, companyId), eq(emailListCategories.listType, type), owner === undefined ? undefined : eq(emailListCategories.ownerUserId, owner)));
  return emailListCategoryNames(rows.map((row) => ({ category: row.name })));
}

/** Saves the categories that addresses now use, for their owners (already saved ones are kept). */
async function saveCategories(companyId: number, type: EmailListType, rows: { ownerId: number | null; category: string }[]) {
  const values = [...new Map(rows.filter((row) => row.category).map((row) => [`${row.ownerId ?? 0}:${row.category.toLowerCase()}`, { companyId, listType: type, ownerUserId: row.ownerId, name: row.category }])).values()];
  if (values.length) await getDb().insert(emailListCategories).values(values).onConflictDoNothing();
}

/**
 * The list as the client shows it, with its saved categories and the other users whose list an administrator can open.
 * A batch that is not the last of a large import, removal or categorising sends `list: false` and gets none of it.
 */
async function listResponse(user: SessionUser, companyId: number, type: EmailListType, view: unknown, list: unknown = true) {
  if (list === false) return {};
  const admin = isAdministrator(user);
  return { contacts: await listOf(user, companyId, type, view), categories: await categoriesOf(user, companyId, type, view), seesAll: admin, ...(admin ? { owners: (await ownersOf(companyId, type)).filter((owner) => owner.id !== user.id) } : {}) };
}

/**
 * GET ?companyId=&type=sales|purchase[&view=all|me|userId] → the list's `contacts` (with `category`, `ownerId`,
 * `ownerName`); administrators also get `owners` and choose whose list with `view` (default: everyone's).
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const companyId = Number(params.get("companyId"));
  const allowed = await access(request, companyId, params.get("type"));
  if (allowed instanceof Response) return allowed;
  try { return json(await listResponse(allowed.user, companyId, allowed.type, params.get("view"))); } catch (error) { return failed(error); }
}

/**
 * POST { companyId, type, contacts: [{ name, company, category, email }], ownerUserId?, view?, list? } — add contacts (typed or
 * imported from CSV) to the user's own list; administrators may add to another user's list (`ownerUserId`). Repeats
 * are skipped. The response lists `view` as GET does.
 */
export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return json({ error: "Invalid request." }, 400); }
  const companyId = Number(payload.companyId);
  const allowed = await access(request, companyId, payload.type, true);
  if (allowed instanceof Response) return allowed;
  const ownerId = payload.ownerUserId === undefined || payload.ownerUserId === null || payload.ownerUserId === "" ? allowed.user.id : Number(payload.ownerUserId);
  if (ownerId !== allowed.user.id && !isAdministrator(allowed.user)) return json({ error: "You can add addresses to your own list only." }, 403);
  const raw = Array.isArray(payload.contacts) ? payload.contacts : [];
  if (!raw.length) return json({ error: "Add at least one email address." }, 400);
  if (raw.length > EMAIL_LIST_IMPORT_MAX) return json({ error: `Import at most ${EMAIL_LIST_IMPORT_MAX.toLocaleString("en")} addresses at a time.` }, 400);
  const seen = new Set<string>();
  const rows: { name: string; company: string; category: string; email: string }[] = [];
  let invalid = 0;
  for (const entry of raw) {
    const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const email = String(item.email ?? "").trim().toLowerCase();
    if (!isValidEmail(email)) { invalid += 1; continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, EMAIL_LIST_NAME_MAX);
    rows.push({ name: clean(item.name), company: clean(item.company), category: cleanEmailListCategory(item.category), email });
  }
  if (!rows.length) return json({ error: "No valid email addresses to add." }, 400);
  try {
    const db = getDb();
    // Another user's list: only an active user of this company whose role may use the list.
    const owner = ownerId === allowed.user.id ? null : (await ownersOf(companyId, allowed.type)).find((entry) => entry.id === ownerId && entry.canAdd);
    if (owner === undefined) return json({ error: `That user cannot use the ${emailListLabel(allowed.type)} of this company.` }, 400);
    const added = await db.insert(emailListContacts).values(rows.map((row) => ({ companyId, listType: allowed.type, ...row, createdByUserId: ownerId })))
      .onConflictDoNothing().returning();
    await saveCategories(companyId, allowed.type, added.map((row) => ({ ownerId: row.createdByUserId, category: row.category })));
    if (added.length) await db.insert(auditLog).values({ companyId, action: "created", entityType: "email_list", entityId: added[0].id, details: `${added.length} address(es) added to the ${emailListLabel(allowed.type)}${owner ? ` of ${owner.name}` : ""} by ${allowed.user.email}` });
    return json({ added: added.length, alreadyListed: rows.length - added.length, invalid, ...await listResponse(allowed.user, companyId, allowed.type, payload.view, payload.list) }, 201);
  } catch (error) { return failed(error); }
}

/** Edit one address: its name, company, category and email. Only the user's own (administrators: anyone's in the company). */
async function updateContact(user: SessionUser, companyId: number, type: EmailListType, payload: Record<string, unknown>) {
  const id = Number(payload.id);
  const email = String(payload.email ?? "").trim().toLowerCase();
  if (!Number.isSafeInteger(id) || id <= 0) return json({ error: "Choose the address to edit." }, 400);
  if (!isValidEmail(email)) return json({ error: "Enter a valid email address." }, 400);
  const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, EMAIL_LIST_NAME_MAX);
  try {
    const db = getDb();
    const [saved] = await db.update(emailListContacts).set({ name: clean(payload.name), company: clean(payload.company), category: cleanEmailListCategory(payload.category), email })
      .where(and(eq(emailListContacts.id, id), eq(emailListContacts.companyId, companyId), eq(emailListContacts.listType, type), ownedBy(user))).returning();
    if (!saved) return json({ error: "This address is no longer in the list." }, 404);
    await saveCategories(companyId, type, [{ ownerId: saved.createdByUserId, category: saved.category }]);
    await db.insert(auditLog).values({ companyId, action: "updated", entityType: "email_list", entityId: saved.id, details: `${saved.email} edited in the ${emailListLabel(type)} by ${user.email}` });
    return json(await listResponse(user, companyId, type, payload.view));
  } catch (error) {
    // The same address can be listed once per user and list.
    if (databaseErrorCode(error) === "23505") return json({ error: `${email} is already in this list.` }, 409);
    return failed(error);
  }
}

/**
 * Categories of the list shown (`view`: the user's own; administrators one user's, or with "all" every user's):
 * addCategory { name } saves a new one (to the open user's list for an administrator); renameCategory { from, to }
 * renames it and moves its addresses (merging into `to` when that exists); deleteCategory { name } deletes it and leaves
 * its addresses without a category.
 */
async function manageCategory(user: SessionUser, companyId: number, type: EmailListType, payload: Record<string, unknown>) {
  const owner = viewOf(user, payload.view);
  const db = getDb();
  const ofList = (table: typeof emailListCategories | typeof emailListContacts) => and(eq(table.companyId, companyId), eq(table.listType, type));
  try {
    if (payload.action === "addCategory") {
      const name = cleanEmailListCategory(payload.name);
      if (!name) return json({ error: "Enter a category name." }, 400);
      const ownerId = owner ?? user.id;
      if (ownerId !== user.id && !(await ownersOf(companyId, type)).some((entry) => entry.id === ownerId && entry.canAdd)) return json({ error: `That user cannot use the ${emailListLabel(type)} of this company.` }, 400);
      const [saved] = await db.insert(emailListCategories).values({ companyId, listType: type, ownerUserId: ownerId, name }).onConflictDoNothing().returning();
      if (!saved) return json({ error: `${name} is already a category.` }, 409);
      await db.insert(auditLog).values({ companyId, action: "created", entityType: "email_list", entityId: saved.id, details: `Category "${name}" added to the ${emailListLabel(type)} by ${user.email}` });
      return json(await listResponse(user, companyId, type, payload.view), 201);
    }
    const from = cleanEmailListCategory(payload.action === "renameCategory" ? payload.from : payload.name);
    if (!from) return json({ error: "Choose a category." }, 400);
    const to = payload.action === "renameCategory" ? cleanEmailListCategory(payload.to) : "";
    if (payload.action === "renameCategory" && !to) return json({ error: "Enter the new category name." }, 400);
    const sameName = (column: typeof emailListCategories.name | typeof emailListContacts.category) => sql`lower(${column}) = ${from.toLowerCase()}`;
    const removed = await db.delete(emailListCategories).where(and(ofList(emailListCategories), sameName(emailListCategories.name), owner === undefined ? undefined : eq(emailListCategories.ownerUserId, owner))).returning();
    const moved = await db.update(emailListContacts).set({ category: to }).where(and(ofList(emailListContacts), sameName(emailListContacts.category), owner === undefined ? undefined : eq(emailListContacts.createdByUserId, owner))).returning();
    if (!removed.length && !moved.length) return json({ error: `${from} is no longer a category.` }, 404);
    if (to) await saveCategories(companyId, type, [...removed.map((row) => ({ ownerId: row.ownerUserId, category: to })), ...moved.map((row) => ({ ownerId: row.createdByUserId, category: to }))]);
    await db.insert(auditLog).values({ companyId, action: to ? "updated" : "deleted", entityType: "email_list", entityId: removed[0]?.id ?? moved[0].id, details: `Category "${from}" ${to ? `renamed to "${to}"` : "deleted"} in the ${emailListLabel(type)} (${moved.length} address(es)) by ${user.email}` });
    return json({ changed: moved.length, ...await listResponse(user, companyId, type, payload.view) });
  } catch (error) { return failed(error); }
}

/**
 * PATCH { companyId, type, action: "update", id, name, company, category, email } edits one address (above).
 * PATCH { companyId, type, action: "categorize", ids, category } sets the category of several addresses ("" clears it).
 * PATCH { companyId, type, action: "addCategory" | "renameCategory" | "deleteCategory", … } manages categories (below).
 * PATCH { companyId, type, action: "remove", ids } — remove contacts. Removing goes through PATCH because HTTP DELETE
 * is reserved for administrators across the app. Each response lists `view` as GET does.
 */
export async function PATCH(request: Request) {
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return json({ error: "Invalid request." }, 400); }
  const companyId = Number(payload.companyId);
  const allowed = await access(request, companyId, payload.type, true);
  if (allowed instanceof Response) return allowed;
  if (payload.action === "update") return updateContact(allowed.user, companyId, allowed.type, payload);
  if (payload.action === "addCategory" || payload.action === "renameCategory" || payload.action === "deleteCategory") return manageCategory(allowed.user, companyId, allowed.type, payload);
  const ids = [...new Set((Array.isArray(payload.ids) ? payload.ids : []).map(Number))].filter((id) => Number.isSafeInteger(id) && id > 0);
  if (payload.action === "categorize") {
    if (!ids.length || ids.length > EMAIL_LIST_IDS_MAX) return json({ error: "Choose the addresses to put in a category." }, 400);
    const category = cleanEmailListCategory(payload.category);
    try {
      const db = getDb();
      const changed = await db.update(emailListContacts).set({ category }).where(and(eq(emailListContacts.companyId, companyId), eq(emailListContacts.listType, allowed.type), inArray(emailListContacts.id, ids), ownedBy(allowed.user))).returning();
      await saveCategories(companyId, allowed.type, changed.map((row) => ({ ownerId: row.createdByUserId, category: row.category })));
      if (changed.length) await db.insert(auditLog).values({ companyId, action: "updated", entityType: "email_list", entityId: changed[0].id, details: `${changed.length} address(es) of the ${emailListLabel(allowed.type)} ${category ? `put in category "${category}"` : "taken out of their category"} by ${allowed.user.email}` });
      return json({ changed: changed.length, ...await listResponse(allowed.user, companyId, allowed.type, payload.view, payload.list) });
    } catch (error) { return failed(error); }
  }
  if (payload.action !== "remove" || !ids.length || ids.length > EMAIL_LIST_IDS_MAX) return json({ error: "Choose the addresses to remove." }, 400);
  try {
    const db = getDb();
    const removed = await db.delete(emailListContacts).where(and(eq(emailListContacts.companyId, companyId), eq(emailListContacts.listType, allowed.type), inArray(emailListContacts.id, ids), ownedBy(allowed.user))).returning();
    if (removed.length) await db.insert(auditLog).values({ companyId, action: "deleted", entityType: "email_list", entityId: removed[0].id, details: `${removed.length} address(es) removed from the ${emailListLabel(allowed.type)} by ${allowed.user.email}` });
    return json({ removed: removed.length, ...await listResponse(allowed.user, companyId, allowed.type, payload.view, payload.list) });
  } catch (error) { return failed(error); }
}
