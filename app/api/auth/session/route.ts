import { limitLogin } from "@/lib/rate-limit";
import { apiRoute } from "@/lib/api";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers, authSessions } from "@/db/schema";
import { createSession, getRequestUser, hashPassword, revokeRequestSession, sameOrigin, sessionCookie, verifyPassword } from "@/lib/auth";

async function handleGET(request: Request) {
  const user = await getRequestUser(request);
  return user ? Response.json({ user }) : Response.json({ error: "Authentication required." }, { status: 401 });
}

async function handlePOST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const payload = await request.json() as Record<string, unknown>;
  const email = String(payload.email ?? "").trim().toLowerCase();
  const password = String(payload.password ?? "");
  if (!email || email.length > 254 || !password || password.length > 128) return Response.json({ error: "Incorrect email or password." }, { status: 401 });
  const limited = await limitLogin(email);
  if (limited) return limited;
  const [user] = await getDb().select().from(appUsers).where(and(eq(appUsers.email, email), eq(appUsers.active, true))).limit(1);
  if (user?.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) return Response.json({ error: "Too many failed attempts. Try again in 15 minutes." }, { status: 429 });
  const validPassword = Boolean(user?.passwordHash && await verifyPassword(password, user.passwordHash));
  if (!user || !validPassword) {
    if (user) {
      await getDb().update(appUsers).set({
        failedLoginAttempts: sql`CASE WHEN ${appUsers.lockedUntil} IS NOT NULL AND ${appUsers.lockedUntil} <= now() THEN 1 ELSE ${appUsers.failedLoginAttempts} + 1 END`,
        lockedUntil: sql`CASE WHEN ${appUsers.lockedUntil} IS NOT NULL AND ${appUsers.lockedUntil} <= now() THEN NULL WHEN ${appUsers.failedLoginAttempts} + 1 >= 5 THEN now() + interval '15 minutes' ELSE ${appUsers.lockedUntil} END`,
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
  return Response.json({ user: { id: user.id, fullName: user.fullName, email: user.email, avatarData: user.avatarData, themeColor: user.themeColor, appearanceMode: user.appearanceMode, role: user.role, mustChangePassword: user.mustChangePassword } }, { headers: { "Set-Cookie": sessionCookie(token), "Cache-Control": "no-store" } });
}

async function handlePATCH(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  const payload = await request.json() as Record<string, unknown>;
  const currentPassword = String(payload.currentPassword ?? "");
  const newPassword = String(payload.newPassword ?? "");
  if (newPassword.length < 12 || newPassword.length > 128) return Response.json({ error: "The new password must contain 12 to 128 characters." }, { status: 400 });
  const [record] = await getDb().select().from(appUsers).where(eq(appUsers.id, user.id)).limit(1);
  if (!record || !(await verifyPassword(currentPassword, record.passwordHash))) return Response.json({ error: "The current password is incorrect." }, { status: 403 });
  await getDb().update(appUsers).set({ passwordHash: (await hashPassword(newPassword)), mustChangePassword: false, updatedAt: new Date().toISOString() }).where(eq(appUsers.id, user.id));
  await getDb().delete(authSessions).where(eq(authSessions.userId, user.id));
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie("", 0), "Cache-Control": "no-store" } });
}

async function handleDELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  await revokeRequestSession(request);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie("", 0), "Cache-Control": "no-store" } });
}

export const GET = apiRoute(handleGET, { public: true, maxBytes: 4096 });

export const POST = apiRoute(handlePOST, { public: true, maxBytes: 4096 });

export const PATCH = apiRoute(handlePATCH, { public: true, maxBytes: 4096, transaction: true });

export const DELETE = apiRoute(handleDELETE, { public: true, maxBytes: 4096, allowEmptyBody: true });
