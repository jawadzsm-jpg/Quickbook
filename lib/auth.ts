import "server-only";

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { appUsers, authSessions } from "@/db/schema";

const SESSION_COOKIE = "comnet_session";
const SESSION_HOURS = 12;

export const appRoles = ["admin", "accountant", "sales", "purchasing", "inventory", "viewer"] as const;
export type AppRole = typeof appRoles[number];
export type Permission = "workspace:read" | "inventory:read" | "inventory:manage" | "inventory:transfer" | "reports:read" | "sales:write" | "purchases:write" | "banking:write" | "accounting:manage" | "customers:manage" | "vendors:manage";
export type SessionUser = { id: number; fullName: string; email: string; role: AppRole; mustChangePassword: boolean };

const rolePermissions: Record<AppRole, Permission[]> = {
  admin: ["workspace:read", "inventory:read", "inventory:manage", "inventory:transfer", "reports:read", "sales:write", "purchases:write", "banking:write", "accounting:manage", "customers:manage", "vendors:manage"],
  accountant: ["workspace:read", "inventory:read", "reports:read", "sales:write", "purchases:write", "banking:write", "accounting:manage", "customers:manage", "vendors:manage"],
  sales: ["workspace:read", "inventory:read", "sales:write", "customers:manage"],
  purchasing: ["workspace:read", "inventory:read", "purchases:write", "vendors:manage"],
  inventory: ["workspace:read", "inventory:read", "inventory:manage", "inventory:transfer"],
  viewer: ["workspace:read", "inventory:read", "reports:read"],
};

export function hasPermission(user: SessionUser, permission: Permission) {
  return rolePermissions[user.role]?.includes(permission) ?? false;
}

const tokenDigest = (token: string) => createHash("sha256").update(token).digest("hex");

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", 16384, 8, 1, salt.toString("hex"), hash.toString("hex")].join("$");
}

export function verifyPassword(password: string, stored: string) {
  const [algorithm, n, r, p, saltHex, hashHex] = stored.split("$");
  if (algorithm !== "scrypt" || !saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function sessionCookie(token: string, maxAge = SESSION_HOURS * 60 * 60) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
  await getDb().insert(authSessions).values({ userId, tokenHash: tokenDigest(token), expiresAt });
  return token;
}

async function findSessionUser(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const [row] = await getDb().select({
    id: appUsers.id, fullName: appUsers.fullName, email: appUsers.email, role: appUsers.role, mustChangePassword: appUsers.mustChangePassword,
  }).from(authSessions)
    .innerJoin(appUsers, eq(authSessions.userId, appUsers.id))
    .where(and(eq(authSessions.tokenHash, tokenDigest(token)), gt(authSessions.expiresAt, new Date().toISOString()), eq(appUsers.active, true)))
    .limit(1);
  return row ? { ...row, role: row.role as AppRole } : null;
}

export async function getSessionUser() {
  return findSessionUser((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function getRequestUser(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const token = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  return findSessionUser(token);
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

export async function requireApiUser(request: Request, required: boolean | Permission = false, mutating = false): Promise<SessionUser | Response> {
  if (mutating && !sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (user.mustChangePassword) return Response.json({ error: "Change your temporary password before using the application." }, { status: 403 });
  if (required === true && user.role !== "admin") return Response.json({ error: "Administrator permission required." }, { status: 403 });
  if (typeof required === "string" && !hasPermission(user, required)) return Response.json({ error: "Your role does not allow this action." }, { status: 403 });
  return user;
}

export async function revokeRequestSession(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const token = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (token) await getDb().delete(authSessions).where(eq(authSessions.tokenHash, tokenDigest(token)));
}
