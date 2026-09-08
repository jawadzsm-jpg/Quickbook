import { and, asc, count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers, authSessions } from "@/db/schema";
import { appRoles, hashPassword, requireApiUser, type AppRole } from "@/lib/auth";

const validRole = (value: string): value is AppRole => appRoles.includes(value as AppRole);
const publicUser = (user: typeof appUsers.$inferSelect, currentUserId: number) => ({
  id: user.id, fullName: user.fullName, email: user.email, role: user.role, active: user.active,
  mustChangePassword: user.mustChangePassword, createdAt: user.createdAt, isCurrent: user.id === currentUserId,
});

export async function GET(request: Request) {
  const administrator = await requireApiUser(request, true);
  if (administrator instanceof Response) return administrator;
  const users = await getDb().select().from(appUsers).orderBy(asc(appUsers.fullName), asc(appUsers.email));
  return Response.json({ users: users.map((user) => publicUser(user, administrator.id)) });
}

export async function POST(request: Request) {
  const administrator = await requireApiUser(request, true, true);
  if (administrator instanceof Response) return administrator;
  const payload = await request.json() as Record<string, unknown>;
  const fullName = String(payload.fullName ?? "").trim();
  const email = String(payload.email ?? "").trim().toLowerCase();
  const role = String(payload.role ?? "viewer");
  const password = String(payload.password ?? "");
  if (!fullName || !/^\S+@\S+\.\S+$/.test(email) || !validRole(role)) return Response.json({ error: "Enter a name, valid email and role." }, { status: 400 });
  if (password.length < 12 || password.length > 128) return Response.json({ error: "Temporary password must contain 12 to 128 characters." }, { status: 400 });
  try {
    const [created] = await getDb().insert(appUsers).values({ fullName, email, role, passwordHash: hashPassword(password), mustChangePassword: true }).returning();
    return Response.json({ user: publicUser(created, administrator.id) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add user.";
    return Response.json({ error: message.includes("idx_app_users_email") || message.includes("duplicate") ? "A user with this email already exists." : "Could not add user." }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  const administrator = await requireApiUser(request, true, true);
  if (administrator instanceof Response) return administrator;
  const payload = await request.json() as Record<string, unknown>;
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Select a valid user." }, { status: 400 });
  const [target] = await getDb().select().from(appUsers).where(eq(appUsers.id, id)).limit(1);
  if (!target) return Response.json({ error: "User not found." }, { status: 404 });
  const updates: Partial<typeof appUsers.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (payload.role !== undefined) {
    const role = String(payload.role);
    if (!validRole(role)) return Response.json({ error: "Select a valid role." }, { status: 400 });
    if (id === administrator.id && role !== "admin") return Response.json({ error: "You cannot remove your own administrator role." }, { status: 409 });
    if (target.role === "admin" && role !== "admin") {
      const [admins] = await getDb().select({ value: count() }).from(appUsers).where(and(eq(appUsers.role, "admin"), eq(appUsers.active, true)));
      if (Number(admins.value) <= 1) return Response.json({ error: "At least one active administrator is required." }, { status: 409 });
    }
    updates.role = role;
  }
  if (payload.active !== undefined) {
    const active = payload.active === true;
    if (id === administrator.id && !active) return Response.json({ error: "You cannot deactivate your own account." }, { status: 409 });
    if (target.role === "admin" && !active) {
      const [admins] = await getDb().select({ value: count() }).from(appUsers).where(and(eq(appUsers.role, "admin"), eq(appUsers.active, true)));
      if (Number(admins.value) <= 1) return Response.json({ error: "At least one active administrator is required." }, { status: 409 });
    }
    updates.active = active;
  }
  if (payload.password !== undefined) {
    const password = String(payload.password);
    if (password.length < 12 || password.length > 128) return Response.json({ error: "Temporary password must contain 12 to 128 characters." }, { status: 400 });
    updates.passwordHash = hashPassword(password);
    updates.mustChangePassword = true;
  }
  const [updated] = await getDb().update(appUsers).set(updates).where(eq(appUsers.id, id)).returning();
  await getDb().delete(authSessions).where(eq(authSessions.userId, id));
  return Response.json({ user: publicUser(updated, administrator.id) });
}
