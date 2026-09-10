import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { appUsers, authSessions } from "@/db/schema";

const SESSION_COOKIE = "comnet_session";
const SESSION_HOURS = 12;

import { appRoles, hasPermission, isAdministrator, canAccessCompany, sameOrigin, type AppRole, type Permission, type SessionUser } from "./access";
export * from "./access";

const tokenDigest = (token: string) => createHash("sha256").update(token).digest("hex");

export { hashPassword, verifyPassword } from "./password";

export function sessionCookie(token: string, maxAge = SESSION_HOURS * 60 * 60) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
  await getDb().insert(authSessions).values({ userId, tokenHash: tokenDigest(token), expiresAt });
  return token;
}

async function assignedCompanyIds(userId: number) {
  const result = await getDb().execute(sql`SELECT company_id FROM app_user_companies WHERE user_id = ${userId} ORDER BY company_id`);
  return result.rows.map((row) => Number(row.company_id)).filter((id) => Number.isInteger(id) && id > 0);
}

async function findSessionUser(token: string | undefined): Promise<SessionUser | null> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [row] = await getDb().select({
    id: appUsers.id, fullName: appUsers.fullName, email: appUsers.email, avatarData: appUsers.avatarData, themeColor: appUsers.themeColor, appearanceMode: appUsers.appearanceMode, role: appUsers.role, mustChangePassword: appUsers.mustChangePassword,
  }).from(authSessions)
    .innerJoin(appUsers, eq(authSessions.userId, appUsers.id))
    .where(and(eq(authSessions.tokenHash, tokenDigest(token)), gt(authSessions.expiresAt, new Date().toISOString()), eq(appUsers.active, true)))
    .limit(1);
  if (!row) return null;
  if (!appRoles.includes(row.role as AppRole)) return null;
  const role = row.role as AppRole;
  const companyIds = role === "all_admin" ? [] : await assignedCompanyIds(row.id);
  return { ...row, role, companyIds };
}

export async function getSessionUser() {
  return findSessionUser((await cookies()).get(SESSION_COOKIE)?.value);
}

const requestUsers = new WeakMap<Request, Promise<SessionUser | null>>();
export function getRequestUser(request: Request) {
  let user = requestUsers.get(request);
  if (!user) {
    const cookie = request.headers.get("cookie") ?? "";
    const token = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
    user = findSessionUser(token);
    requestUsers.set(request, user);
  }
  return user;
}

export async function requireApiUser(request: Request, required: boolean | Permission = false, mutating = false): Promise<SessionUser | Response> {
  if (mutating && !sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (user.mustChangePassword) return Response.json({ error: "Change your temporary password before using the application." }, { status: 403 });
  if (required === true && !isAdministrator(user)) return Response.json({ error: "Administrator permission required." }, { status: 403 });
  if (typeof required === "string" && !hasPermission(user, required)) return Response.json({ error: "Your role does not allow this action." }, { status: 403 });
  return user;
}

export async function requireCompanyAccess(request: Request, companyId: number, required: boolean | Permission = false, mutating = false): Promise<SessionUser | Response> {
  const user = await requireApiUser(request, required, mutating);
  if (user instanceof Response) return user;
  if (!Number.isInteger(companyId) || companyId <= 0 || !canAccessCompany(user, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
  return user;
}

export async function revokeRequestSession(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const token = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (token) await getDb().delete(authSessions).where(eq(authSessions.tokenHash, tokenDigest(token)));
}
