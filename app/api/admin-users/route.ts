import { isValidEmail } from "@/lib/email-validation";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { getDb, withWriteTransaction } from "@/db";
import { appUsers, authSessions, companies } from "@/db/schema";
import { appRoles, hashPassword, type AppRole, type SessionUser } from "@/lib/auth";
import { canManage, companyIdsForUser, isCompanyAdmin, outOfScope, requireUserManager, roleNames } from "@/lib/user-management";
import { sendUserInvitation } from "@/lib/smtp";
import { friendlyEmailError } from "@/lib/email-errors";
import { DEFAULT_IDLE_TIMEOUT_MINUTES, isValidIdleTimeout } from "@/lib/idle-timeout";

const validRole = (value: string): value is AppRole => appRoles.includes(value as AppRole);
const validAvatar = (value: string) => !value || (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value) && value.length <= 1_100_000);

async function activeAllAdminCount() {
  const result = await getDb().execute(sql`SELECT COUNT(*)::int AS value FROM app_users WHERE role = 'all_admin' AND active = true`);
  return Number(result.rows[0]?.value ?? 0);
}


async function publicUser(user: typeof appUsers.$inferSelect, manager: SessionUser) {
  const userRole = user.role as AppRole;
  const companyIds = userRole === "all_admin" ? [] : await companyIdsForUser(user.id);
  return {
    id: user.id, fullName: user.fullName, email: user.email, phone: user.phone, whatsapp: user.whatsapp, avatarData: user.avatarData,
    themeColor: user.themeColor, appearanceMode: user.appearanceMode, role: userRole, active: user.active, mustChangePassword: user.mustChangePassword, idleTimeoutMinutes: user.idleTimeoutMinutes, createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt, lastLoginIp: user.lastLoginIp, lastLoginUserAgent: user.lastLoginUserAgent, isCurrent: user.id === manager.id,
    companyIds, manageable: canManage(manager, userRole, companyIds),
  };
}

function parseCompanyIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

async function validateCompanyIds(companyIds: number[]) {
  if (!companyIds.length) return false;
  const rows = await getDb().select({ id: companies.id }).from(companies).where(eq(companies.active, true));
  const active = new Set(rows.map((row) => row.id));
  return companyIds.every((id) => active.has(id));
}

async function replaceCompanies(userId: number, companyIds: number[]) {
  const db = getDb();
  await db.execute(sql`DELETE FROM app_user_companies WHERE user_id = ${userId}`);
  for (const companyId of companyIds) await db.execute(sql`INSERT INTO app_user_companies (user_id, company_id) VALUES (${userId}, ${companyId}) ON CONFLICT DO NOTHING`);
}



export async function GET(request: Request) {
  const administrator = await requireUserManager(request);
  if (administrator instanceof Response) return administrator;
  const users = await getDb().select().from(appUsers).orderBy(asc(appUsers.fullName), asc(appUsers.email));
  const companyRows = (await getDb().select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.active, true)).orderBy(asc(companies.name)))
    .filter((company) => !isCompanyAdmin(administrator) || administrator.companyIds.includes(company.id));
  // Company Administrators see themselves plus the users they can manage.
  const listed = (await Promise.all(users.map((user) => publicUser(user, administrator)))).filter((user) => user.manageable || user.isCurrent);
  return Response.json({ users: listed, companies: companyRows });
}

export async function POST(request: Request) {
  const administrator = await requireUserManager(request, true);
  if (administrator instanceof Response) return administrator;
  const payload = await request.json() as Record<string, unknown>;
  const fullName = String(payload.fullName ?? "").trim();
  const email = String(payload.email ?? "").trim().toLowerCase();
  const role = String(payload.role ?? "viewer");
  const password = String(payload.password ?? "");
  const phone = String(payload.phone ?? "").trim();
  const whatsapp = String(payload.whatsapp ?? "").trim();
  const avatarData = String(payload.avatarData ?? "");
  const companyIds = parseCompanyIds(payload.companyIds);
  const idleTimeoutMinutes = payload.idleTimeoutMinutes === undefined ? DEFAULT_IDLE_TIMEOUT_MINUTES : payload.idleTimeoutMinutes;
  if (!isValidIdleTimeout(idleTimeoutMinutes)) return Response.json({ error: "Choose a valid automatic sign-out time." }, { status: 400 });
  if (!fullName || !isValidEmail(email) || !validRole(role)) return Response.json({ error: "Enter a name, valid email and role." }, { status: 400 });
  if (!canManage(administrator, role, companyIds)) return outOfScope();
  if (role !== "all_admin" && !(await validateCompanyIds(companyIds))) return Response.json({ error: "Assign at least one valid company to this user." }, { status: 400 });
  if (password.length < 12 || password.length > 128) return Response.json({ error: "Temporary password must contain 12 to 128 characters." }, { status: 400 });
  if (phone.length > 32 || whatsapp.length > 32) return Response.json({ error: "Phone numbers must contain 32 characters or fewer." }, { status: 400 });
  if (!validAvatar(avatarData)) return Response.json({ error: "Use a PNG, JPEG or WebP picture smaller than 800 KB." }, { status: 400 });
  const [existing] = await getDb().select({ active: appUsers.active }).from(appUsers).where(sql`lower(${appUsers.email}) = ${email}`).limit(1);
  if (existing) return Response.json({ error: existing.active ? "A user with this email already exists." : "A deactivated user with this email already exists. Reactivate that user instead." }, { status: 409 });
  let created!: typeof appUsers.$inferSelect;
  try {
    // User and company access are saved together, so a failed assignment never leaves a half-created user behind.
    const response = await withWriteTransaction(async () => {
      [created] = await getDb().insert(appUsers).values({ fullName, email, phone, whatsapp, avatarData, idleTimeoutMinutes, role: role as never, passwordHash: hashPassword(password), mustChangePassword: true }).returning();
      if (role !== "all_admin") await replaceCompanies(created.id, companyIds);
      return Response.json({ ok: true });
    });
    if (!response.ok) return response;
  } catch (error) {
    // Drizzle wraps database errors ("Failed query: ..."); the PostgreSQL message is on `cause`.
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
    const message = `${error instanceof Error ? error.message : ""} ${cause}`;
    console.error("Could not add user", cause || error);
    return Response.json({ error: message.includes("idx_app_users_email") || message.includes("duplicate key") ? "A user with this email already exists." : `Could not add user.${cause ? ` ${cause}` : ""}` }, { status: 409 });
  }
  let emailSent = false; let emailWarning = "";
  if (payload.sendEmail === true) {
    try { await sendUserInvitation({ to: email, name: fullName, temporaryPassword: password, roleLabel: roleNames[role], loginUrl: process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin }); emailSent = true; }
    catch (error) { emailWarning = friendlyEmailError(error, "The user was added, but the email could not be sent.", { loginDetails: true }); }
  }
  return Response.json({ user: await publicUser(created, administrator), emailSent, emailWarning }, { status: 201 });
}

export async function PATCH(request: Request) {
  const administrator = await requireUserManager(request, true);
  if (administrator instanceof Response) return administrator;
  const payload = await request.json() as Record<string, unknown>;
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Select a valid user." }, { status: 400 });
  const [target] = await getDb().select().from(appUsers).where(eq(appUsers.id, id)).limit(1);
  if (!target) return Response.json({ error: "User not found." }, { status: 404 });
  const targetRole = target.role as AppRole;
  const updates: Partial<typeof appUsers.$inferInsert> = { updatedAt: new Date().toISOString() };
  const nextRole = payload.role === undefined ? targetRole : String(payload.role) as AppRole;
  if (!validRole(nextRole)) return Response.json({ error: "Select a valid role." }, { status: 400 });
  if (isCompanyAdmin(administrator)) {
    const currentCompanyIds = await companyIdsForUser(id);
    const nextCompanyIds = payload.companyIds !== undefined ? parseCompanyIds(payload.companyIds) : currentCompanyIds;
    if (!canManage(administrator, targetRole, currentCompanyIds) || !canManage(administrator, nextRole, nextCompanyIds)) return outOfScope();
  }
  const activeAdminCount = async () => Number((await getDb().select({ value: count() }).from(appUsers).where(and(eq(appUsers.role, "admin"), eq(appUsers.active, true))))[0]?.value ?? 0);
  // Validate every requested change before writing anything, so a rejected field never leaves a partial update behind.
  if (payload.role !== undefined) {
    if (id === administrator.id && nextRole !== administrator.role) return Response.json({ error: "You cannot change your own role." }, { status: 409 });
    if (targetRole === "admin" && target.active && nextRole !== "admin" && nextRole !== "all_admin" && (await activeAdminCount()) <= 1) return Response.json({ error: "At least one active Administrator is required." }, { status: 409 });
    if (targetRole === "all_admin" && target.active && nextRole !== "all_admin" && (await activeAllAdminCount()) <= 1) return Response.json({ error: "At least one active All-Admin is required." }, { status: 409 });
    updates.role = nextRole as never;
  }
  let companyIds: number[] | null = null;
  if (payload.companyIds !== undefined || payload.role !== undefined) {
    companyIds = parseCompanyIds(payload.companyIds !== undefined ? payload.companyIds : await companyIdsForUser(id));
    if (nextRole !== "all_admin" && !(await validateCompanyIds(companyIds))) return Response.json({ error: "Assign at least one valid company to this user." }, { status: 400 });
  }
  if (payload.active !== undefined) {
    const active = payload.active === true;
    if (id === administrator.id && !active) return Response.json({ error: "You cannot deactivate your own account." }, { status: 409 });
    if (!active && target.active && nextRole === "admin" && (await activeAdminCount()) <= 1) return Response.json({ error: "At least one active Administrator is required." }, { status: 409 });
    if (!active && target.active && nextRole === "all_admin" && (await activeAllAdminCount()) <= 1) return Response.json({ error: "At least one active All-Admin is required." }, { status: 409 });
    updates.active = active;
  }
  if (payload.password !== undefined) {
    const password = String(payload.password);
    if (password.length < 12 || password.length > 128) return Response.json({ error: "Temporary password must contain 12 to 128 characters." }, { status: 400 });
    updates.passwordHash = hashPassword(password); updates.mustChangePassword = true;
  }
  if (payload.fullName !== undefined) {
    const fullName = String(payload.fullName).trim();
    if (!fullName || fullName.length > 120) return Response.json({ error: "Enter a name of 120 characters or fewer." }, { status: 400 });
    updates.fullName = fullName;
  }
  if (payload.phone !== undefined || payload.whatsapp !== undefined) {
    if (String(payload.phone ?? "").trim().length > 32 || String(payload.whatsapp ?? "").trim().length > 32) return Response.json({ error: "Phone numbers must contain 32 characters or fewer." }, { status: 400 });
    if (payload.phone !== undefined) updates.phone = String(payload.phone).trim();
    if (payload.whatsapp !== undefined) updates.whatsapp = String(payload.whatsapp).trim();
  }
  if (payload.avatarData !== undefined) { const avatarData = String(payload.avatarData); if (!validAvatar(avatarData)) return Response.json({ error: "Use a PNG, JPEG or WebP picture smaller than 800 KB." }, { status: 400 }); updates.avatarData = avatarData; }
  if (payload.idleTimeoutMinutes !== undefined) {
    if (!isValidIdleTimeout(payload.idleTimeoutMinutes)) return Response.json({ error: "Choose a valid automatic sign-out time." }, { status: 400 });
    updates.idleTimeoutMinutes = payload.idleTimeoutMinutes;
  }
  // Access and password changes sign the user out; profile-only edits (name, phone, picture, automatic sign-out time) keep their sessions.
  const revokeSessions = updates.role !== undefined || companyIds !== null || updates.active !== undefined || updates.passwordHash !== undefined;
  let updated!: typeof appUsers.$inferSelect;
  const saved = await withWriteTransaction(async () => {
    [updated] = await getDb().update(appUsers).set(updates).where(eq(appUsers.id, id)).returning();
    if (companyIds !== null) await replaceCompanies(id, nextRole === "all_admin" ? [] : companyIds);
    if (revokeSessions) await getDb().delete(authSessions).where(eq(authSessions.userId, id));
    return Response.json({ ok: true });
  });
  if (!saved.ok) return saved;
  let emailSent = false; let emailWarning = "";
  if (payload.sendEmail === true && payload.password !== undefined) {
    try { await sendUserInvitation({ to: updated.email, name: updated.fullName || updated.email, temporaryPassword: String(payload.password), roleLabel: roleNames[updated.role as AppRole], loginUrl: process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin }); emailSent = true; }
    catch (error) { emailWarning = friendlyEmailError(error, "The password was reset, but the email could not be sent.", { loginDetails: true }); }
  }
  return Response.json({ user: await publicUser(updated, administrator), emailSent, emailWarning });
}

export async function DELETE(request: Request) {
  const administrator = await requireUserManager(request, true);
  if (administrator instanceof Response) return administrator;
  const payload = await request.json() as Record<string, unknown>;
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Select a valid user." }, { status: 400 });
  if (id === administrator.id) return Response.json({ error: "You cannot delete your own account." }, { status: 409 });
  const [target] = await getDb().select().from(appUsers).where(eq(appUsers.id, id)).limit(1);
  if (!target) return Response.json({ error: "User not found." }, { status: 404 });
  const targetRole = target.role as AppRole;
  if (!canManage(administrator, targetRole, await companyIdsForUser(id))) return outOfScope();
  if (targetRole === "admin" && target.active) {
    const [admins] = await getDb().select({ value: count() }).from(appUsers).where(and(eq(appUsers.role, "admin"), eq(appUsers.active, true)));
    if (Number(admins.value) <= 1) return Response.json({ error: "At least one active Administrator is required." }, { status: 409 });
  }
  if (targetRole === "all_admin" && target.active && (await activeAllAdminCount()) <= 1) return Response.json({ error: "At least one active All-Admin is required." }, { status: 409 });
  return withWriteTransaction(async () => {
    const db = getDb();
    await db.delete(authSessions).where(eq(authSessions.userId, id));
    await db.execute(sql`DELETE FROM app_user_companies WHERE user_id = ${id}`);
    await db.delete(appUsers).where(eq(appUsers.id, id));
    return Response.json({ success: true });
  });
}
