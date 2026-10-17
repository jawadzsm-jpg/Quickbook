import { createHash } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers, authSessions } from "@/db/schema";
import { createSession, getRequestUser, hashPassword, requestIpAddress, revokeRequestSession, sameOrigin, sessionCookie, verifyPassword } from "@/lib/auth";
import { checkSecondFactor } from "@/lib/mfa";
import { passwordProblem } from "@/lib/password-policy";
import { consumeRateLimit, limitLogin } from "@/lib/rate-limit";

const LOCK_AFTER = 5;
const noStore = { "Cache-Control": "no-store" };
// One answer for unknown emails, wrong passwords and locked accounts, so sign-in does not reveal which emails exist.
const rejected = () => Response.json({ error: "Incorrect email or password. After 5 failed attempts the account is locked for 15 minutes." }, { status: 401, headers: noStore });

// A real scrypt hash to check against when the email is unknown, so both cases take the same time.
let dummyHash: Promise<string> | null = null;
const timingDummy = () => (dummyHash ??= hashPassword("timing-equaliser-not-a-password"));

/** Counts a failed sign-in in one statement (parallel guesses cannot share a strike) and locks after 5. */
async function recordFailure(userId: number) {
  await getDb().execute(sql`UPDATE app_users SET
      failed_login_attempts = CASE WHEN failed_login_attempts + 1 >= ${LOCK_AFTER} THEN 0 ELSE failed_login_attempts + 1 END,
      locked_until = CASE WHEN failed_login_attempts + 1 >= ${LOCK_AFTER} THEN now() + interval '15 minutes' ELSE locked_until END,
      updated_at = now()
    WHERE id = ${userId}`);
}

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  return user ? Response.json({ user }, { headers: noStore }) : Response.json({ error: "Authentication required." }, { status: 401, headers: noStore });
}

/**
 * Sign in with email and password, plus `mfaCode` (authenticator code or backup code) when two-step sign-in is on.
 * Limits: 300 attempts/min overall, 30 per email and 60 per IP address per 15 minutes, and 5 failures lock the account.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const email = String(payload.email ?? "").trim().toLowerCase().slice(0, 320);
  const password = String(payload.password ?? "");
  const mfaCode = String(payload.mfaCode ?? "").trim().slice(0, 32);
  if (!email || !password) return rejected();
  const limited = await limitLogin(email);
  if (limited) return limited;
  const byIp = await consumeRateLimit(`login:ip:${createHash("sha256").update(requestIpAddress(request)).digest("hex")}`, 60, 900);
  if (!byIp.allowed) return Response.json({ error: "Too many sign-in attempts. Please try again later." }, { status: 429, headers: { ...noStore, "Retry-After": String(byIp.retryAfter) } });

  const db = getDb();
  const [user] = await db.select().from(appUsers).where(and(eq(appUsers.email, email), eq(appUsers.active, true))).limit(1);
  // Accounts without a password (never set up) cannot sign in; they get a password from Users & access.
  const validPassword = await verifyPassword(password, user?.passwordHash || await timingDummy());
  if (!user || !user.passwordHash) return rejected();
  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) return rejected();
  if (!validPassword) { await recordFailure(user.id); return rejected(); }

  if (user.mfaEnabled) {
    if (!mfaCode) return Response.json({ mfaRequired: true, error: "Enter the 6-digit code from your authenticator app." }, { status: 401, headers: noStore });
    const checked = checkSecondFactor(user, mfaCode);
    if (!checked) { await recordFailure(user.id); return Response.json({ mfaRequired: true, error: "The code is incorrect or has already been used. Enter the current code from your authenticator app, or a backup code." }, { status: 401, headers: noStore }); }
    await db.update(appUsers).set(checked).where(eq(appUsers.id, user.id));
  }

  const loginIp = requestIpAddress(request);
  const loginUserAgent = (request.headers.get("user-agent") || "Unknown device").slice(0, 500);
  const lastLoginAt = new Date().toISOString();
  await db.update(appUsers).set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt, lastLoginIp: loginIp, lastLoginUserAgent: loginUserAgent, updatedAt: lastLoginAt }).where(eq(appUsers.id, user.id));
  // Expired sessions are only filtered on read; tidy this user's old ones at each sign-in.
  await db.delete(authSessions).where(and(eq(authSessions.userId, user.id), lt(authSessions.expiresAt, lastLoginAt)));
  // A fresh session for every sign-in; any session this browser already had ends now.
  await revokeRequestSession(request);
  const token = await createSession(user.id, loginIp);
  return Response.json({ user: { id: user.id, fullName: user.fullName, email: user.email, avatarData: user.avatarData, themeColor: user.themeColor, appearanceMode: user.appearanceMode, role: user.role, mustChangePassword: user.mustChangePassword } }, { headers: { "Set-Cookie": sessionCookie(token), ...noStore } });
}

/** Change password (signed-in user). The current-password check allows 5 tries per 15 minutes. */
export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const currentPassword = String(payload.currentPassword ?? "");
  const newPassword = String(payload.newPassword ?? "");
  const weakPassword = passwordProblem(newPassword, user);
  if (weakPassword) return Response.json({ error: weakPassword }, { status: 400 });
  const budget = await consumeRateLimit(`password-change:${user.id}`, 5, 900);
  if (!budget.allowed) return Response.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429, headers: { "Retry-After": String(budget.retryAfter) } });
  const [record] = await getDb().select().from(appUsers).where(eq(appUsers.id, user.id)).limit(1);
  if (!record || !(await verifyPassword(currentPassword, record.passwordHash))) return Response.json({ error: "The current password is incorrect." }, { status: 403 });
  if (newPassword === currentPassword) return Response.json({ error: "Choose a new password that is different from the current one." }, { status: 400 });
  await getDb().update(appUsers).set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false, updatedAt: new Date().toISOString() }).where(eq(appUsers.id, user.id));
  await getDb().delete(authSessions).where(eq(authSessions.userId, user.id));
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie("", 0), ...noStore } });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  await revokeRequestSession(request);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie("", 0), ...noStore } });
}
