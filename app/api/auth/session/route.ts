import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers, authSessions, companySettings } from "@/db/schema";
import { verifyAdminPin } from "@/lib/admin-pin";
import { createSession, getRequestUser, hashPassword, revokeRequestSession, sameOrigin, sessionCookie, verifyPassword } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  return user ? Response.json({ user }) : Response.json({ error: "Authentication required." }, { status: 401 });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const payload = await request.json() as Record<string, unknown>;
  const email = String(payload.email ?? "").trim().toLowerCase();
  const password = String(payload.password ?? "");
  const [user] = await getDb().select().from(appUsers).where(and(eq(appUsers.email, email), eq(appUsers.active, true))).limit(1);
  if (user?.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) return Response.json({ error: "Too many failed attempts. Try again in 15 minutes." }, { status: 429 });
  let validPassword = Boolean(user?.passwordHash && verifyPassword(password, user.passwordHash));
  if (user && !user.passwordHash && /^\d{4,12}$/.test(password)) {
    const settings = await getDb().select({ pinHash: companySettings.negativeStockPinHash }).from(companySettings);
    validPassword = settings.some((setting) => setting.pinHash && verifyAdminPin(password, setting.pinHash));
    if (validPassword) await getDb().update(appUsers).set({ passwordHash: hashPassword(password), updatedAt: new Date().toISOString() }).where(eq(appUsers.id, user.id));
  }
  if (!user || !validPassword) {
    if (user) {
      const failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
      await getDb().update(appUsers).set({
        failedLoginAttempts: failedLoginAttempts >= 5 ? 0 : failedLoginAttempts,
        lockedUntil: failedLoginAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null,
        updatedAt: new Date().toISOString(),
      }).where(eq(appUsers.id, user.id));
    }
    return Response.json({ error: "Incorrect email or password." }, { status: 401 });
  }
  const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const loginIp = (forwardedIp || request.headers.get("x-real-ip") || "Unknown").slice(0, 64);
  const loginUserAgent = (request.headers.get("user-agent") || "Unknown device").slice(0, 500);
  const lastLoginAt = new Date().toISOString();
  await getDb().update(appUsers).set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt, lastLoginIp: loginIp, lastLoginUserAgent: loginUserAgent, updatedAt: lastLoginAt }).where(eq(appUsers.id, user.id));
  const token = await createSession(user.id);
  return Response.json({ user: { id: user.id, fullName: user.fullName, email: user.email, avatarData: user.avatarData, role: user.role, mustChangePassword: user.mustChangePassword } }, { headers: { "Set-Cookie": sessionCookie(token), "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  const payload = await request.json() as Record<string, unknown>;
  const currentPassword = String(payload.currentPassword ?? "");
  const newPassword = String(payload.newPassword ?? "");
  if (newPassword.length < 12 || newPassword.length > 128) return Response.json({ error: "The new password must contain 12 to 128 characters." }, { status: 400 });
  const [record] = await getDb().select().from(appUsers).where(eq(appUsers.id, user.id)).limit(1);
  if (!record || !verifyPassword(currentPassword, record.passwordHash)) return Response.json({ error: "The current password is incorrect." }, { status: 403 });
  await getDb().update(appUsers).set({ passwordHash: hashPassword(newPassword), mustChangePassword: false, updatedAt: new Date().toISOString() }).where(eq(appUsers.id, user.id));
  await getDb().delete(authSessions).where(eq(authSessions.userId, user.id));
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie("", 0), "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  await revokeRequestSession(request);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie("", 0), "Cache-Control": "no-store" } });
}
