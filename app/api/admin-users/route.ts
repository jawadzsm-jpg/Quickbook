import { and, asc, count, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers, authSessions, companies } from "@/db/schema";
import { appRoles, hashPassword, isAdministrator, requireApiUser, type AppRole } from "@/lib/auth";
import { sendUserInvitation } from "@/lib/smtp";

const validRole = (value: string): value is AppRole => appRoles.includes(value as AppRole);
const roleNames: Record<AppRole, string> = { all_admin: "All-Admin", admin: "Administrator", accountant: "Accountant", sales: "Sales", purchasing: "Purchasing", inventory: "Inventory Manager", viewer: "Viewer" };
const validAvatar = (value: string) => !value || (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value) && value.length <= 1_100_000);

async function companyIdsForUser(userId: number) {
  const result = await getDb().execute(sql`SELECT company_id FROM app_user_companies WHERE user_id = ${userId} ORDER BY company_id`);
  return result.rows.map((row) => Number(row.company_id));
}

async function activeAllAdminCount() {
  const result = await getDb().execute(sql`SELECT COUNT(*)::int AS value FROM app_users WHERE role = 'all_admin' AND active = true`);
  return Number(result.rows[0]?.value ?? 0);
}

async function publicUser(user: typeof appUsers.$inferSelect, currentUserId: number) {
  const userRole = user.role as AppRole;
  return {
    id: user.id, fullName: user.fullName, email: user.email, phone: user.phone, whatsapp: user.whatsapp, avatarData: user.avatarData,
    themeColor: user.themeColor, appearanceMode: user.appearanceMode, role: userRole, active: user.active, mustChangePassword: user.mustChangePassword, createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt, lastLoginIp: user.lastLoginIp, lastLoginUserAgent: user.lastLoginUserAgent, isCurrent: user.id === currentUserId,
    companyIds: userRole === "all_admin" ? [] : await companyIdsForUser(user.id),
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
  const administrator = await requireApiUser(request, true);
  if (administrator instanceof Response) return administrator;
  const users = await getDb().select().from(appUsers).orderBy(asc(appUsers.fullName), asc(appUsers.email));
  const companyRows = await getDb().select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.active, true)).orderBy(asc(companies.name));
  return Response.json({ users: await Promise.all(users.map((user) => publicUser(user, administrator.id))), companies: companyRows });
}

export async function POST(request: Request) {
  const administrator = await requireApiUser(request, true, true);
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
  if (!fullName || !/^\S+@\S+\.\S+$/.test(email) || !validRole(role)) return Response.json({ error: "Enter a name, valid email and role." }, { status: 400 });
  if (role === "all_admin" && administrator.role !== "all_admin" && (await activeAllAdminCount()) > 0) return Response.json({ error: "Only an All-Admin can create another All-Admin." }, { status: 403 });
  if (role !== "all_admin" && !(await validateCompanyIds(companyIds))) return Response.json({ error: "Assign at least one valid company to this user." }, { status: 400 });
  if (password.length < 12 || password.length > 128) return Response.json({ error: "Temporary password must contain 12 to 128 characters." }, { status: 400 });
  if (phone.length > 32 || whatsapp.length > 32) return Response.json({ error: "Phone numbers must contain 32 characters or fewer." }, { status: 400 });
  if (!validAvatar(avatarData)) return Response.json({ error: "Use a PNG, JPEG or WebP picture smaller than 800 KB." }, { status: 400 });
  let created: typeof appUsers.$inferSelect;
  try {
    [created] = await getDb().insert(appUsers).values({ fullName, email, phone, whatsapp, avatarData, role: role as never, passwordHash: hashPassword(password), mustChangePassword: true }).returning();
    if (role !== "all_admin") await replaceCompanies(created.id, companyIds);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add user.";
    return Response.json({ error: message.includes("idx_app_users_email") || message.includes("duplicate") ? "A user with this email already exists." : "Could not add user." }, { status: 409 });
  }
  let emailSent = false; let emailWarning = "";
  if (payload.sendEmail === true) {
    try { await sendUserInvitation({ to: email, name: fullName, temporaryPassword: password, roleLabel: roleNames[role], loginUrl: process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin }); emailSent = true; }
    catch (error) { emailWarning = error instanceof Error ? error.message : "The user was added, but the email could not be sent."; }
  }
  return Response.json({ user: await publicUser(created, administrator.id), emailSent, emailWarning }, { status: 201 });
}

export async function PATCH(request: Request) {
  const administrator = await requireApiUser(request, true, true);
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
  if ((targetRole === "all_admin" || nextRole === "all_admin") && administrator.role !== "all_admin") return Response.json({ error: "Only an All-Admin can change All-Admin access." }, { status: 403 });
  if (payload.role !== undefined) {
    if (id === administrator.id && !isAdministrator({ role: nextRole })) return Response.json({ error: "You cannot remove your own administrator role." }, { status: 409 });
    if (targetRole === "admin" && nextRole !== "admin" && nextRole !== "all_admin") {
      const [admins] = await getDb().select({ value: count() }).from(appUsers).where(and(eq(appUsers.role, "admin"), eq(appUsers.active, true)));
      if (Number(admins.value) <= 1) return Response.json({ error: "At least one active Administrator is required." }, { status: 409 });
    }
    updates.role = nextRole as never;
  }
  if (payload.companyIds !== undefined || payload.role !== undefined) {
    const companyIds = parseCompanyIds(payload.companyIds !== undefined ? payload.companyIds : await companyIdsForUser(id));
    if (nextRole !== "all_admin" && !(await validateCompanyIds(companyIds))) return Response.json({ error: "Assign at least one valid company to this user." }, { status: 400 });
    await replaceCompanies(id, nextRole === "all_admin" ? [] : companyIds);
  }
  if (payload.active !== undefined) {
    const active = payload.active === true;
    if (id === administrator.id && !active) return Response.json({ error: "You cannot deactivate your own account." }, { status: 409 });
    updates.active = active;
  }
  if (payload.password !== undefined) {
    const password = String(payload.password);
    if (password.length < 12 || password.length > 128) return Response.json({ error: "Temporary password must contain 12 to 128 characters." }, { status: 400 });
    updates.passwordHash = hashPassword(password); updates.mustChangePassword = true;
  }
  if (payload.phone !== undefined) updates.phone = String(payload.phone).trim().slice(0, 32);
  if (payload.whatsapp !== undefined) updates.whatsapp = String(payload.whatsapp).trim().slice(0, 32);
  if (payload.avatarData !== undefined) { const avatarData = String(payload.avatarData); if (!validAvatar(avatarData)) return Response.json({ error: "Use a PNG, JPEG or WebP picture smaller than 800 KB." }, { status: 400 }); updates.avatarData = avatarData; }
  const [updated] = await getDb().update(appUsers).set(updates).where(eq(appUsers.id, id)).returning();
  await getDb().delete(authSessions).where(eq(authSessions.userId, id));
  let emailSent = false; let emailWarning = "";
  if (payload.sendEmail === true && payload.password !== undefined) {
    try { await sendUserInvitation({ to: updated.email, name: updated.fullName || updated.email, temporaryPassword: String(payload.password), roleLabel: roleNames[updated.role as AppRole], loginUrl: process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin }); emailSent = true; }
    catch (error) { emailWarning = error instanceof Error ? error.message : "The password was reset, but the email could not be sent."; }
  }
  return Response.json({ user: await publicUser(updated, administrator.id), emailSent, emailWarning });
}

export async function DELETE(request: Request) {
  const administrator = await requireApiUser(request, true, true);
  if (administrator instanceof Response) return administrator;
  const payload = await request.json() as Record<string, unknown>;
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Select a valid user." }, { status: 400 });
  if (id === administrator.id) return Response.json({ error: "You cannot delete your own account." }, { status: 409 });
  const [target] = await getDb().select().from(appUsers).where(eq(appUsers.id, id)).limit(1);
  if (!target) return Response.json({ error: "User not found." }, { status: 404 });
  const targetRole = target.role as AppRole;
  if (targetRole === "all_admin" && administrator.role !== "all_admin") return Response.json({ error: "Only an All-Admin can delete an All-Admin." }, { status: 403 });
  if (targetRole === "admin" && target.active) {
    const [admins] = await getDb().select({ value: count() }).from(appUsers).where(and(eq(appUsers.role, "admin"), eq(appUsers.active, true)));
    if (Number(admins.value) <= 1) return Response.json({ error: "At least one active Administrator is required." }, { status: 409 });
  }
  const db = getDb();
  await db.delete(authSessions).where(eq(authSessions.userId, id));
  await db.execute(sql`DELETE FROM app_user_companies WHERE user_id = ${id}`);
  await db.delete(appUsers).where(eq(appUsers.id, id));
  return Response.json({ success: true });
}
