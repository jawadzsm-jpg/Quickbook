import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers, authSessions, passwordResetTokens } from "@/db/schema";
import { hashPassword, sameOrigin } from "@/lib/auth";
import { isValidEmail } from "@/lib/email-validation";
import { emailDeliveryConfigured, sendPasswordReset } from "@/lib/smtp";

const RESET_MINUTES = 30;
const MAX_LINKS_PER_HOUR = 3;
const tokenDigest = (token: string) => createHash("sha256").update(token).digest("hex");
const sentMessage = `If an active account uses that email, a reset link is on its way. It expires in ${RESET_MINUTES} minutes.`;

// Request a reset link. The answer is the same whether or not the email belongs to a user.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const email = String(payload.email ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!await emailDeliveryConfigured()) return Response.json({ error: "Password reset by email is not set up. Ask your administrator to reset your password." }, { status: 503 });
  const db = getDb();
  const [user] = await db.select({ id: appUsers.id, fullName: appUsers.fullName, email: appUsers.email }).from(appUsers).where(and(eq(appUsers.email, email), eq(appUsers.active, true))).limit(1);
  if (user) {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const [{ recent }] = await db.select({ recent: sql<number>`count(*)::int` }).from(passwordResetTokens).where(and(eq(passwordResetTokens.userId, user.id), gt(passwordResetTokens.createdAt, hourAgo)));
    if (recent < MAX_LINKS_PER_HOUR) {
      const token = randomBytes(32).toString("base64url");
      await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash: tokenDigest(token), expiresAt: new Date(Date.now() + RESET_MINUTES * 60 * 1000).toISOString() });
      // Build the link from the configured public URL when set, so a forged Host header cannot redirect the token.
      const resetUrl = new URL("/", process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin);
      resetUrl.searchParams.set("reset", token);
      try { await sendPasswordReset({ to: user.email, name: user.fullName || user.email, resetUrl: resetUrl.toString(), expiresInMinutes: RESET_MINUTES }); }
      catch (error) { console.error("Password reset email failed", error); }
    }
  }
  return Response.json({ ok: true, message: sentMessage }, { headers: { "Cache-Control": "no-store" } });
}

// Use a reset link: set the new password, clear any lockout and sign the user out everywhere.
export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const token = String(payload.token ?? "");
  const newPassword = String(payload.newPassword ?? "");
  if (newPassword.length < 12 || newPassword.length > 128) return Response.json({ error: "The new password must contain 12 to 128 characters." }, { status: 400 });
  const invalid = Response.json({ error: "This reset link is invalid or has expired. Request a new one." }, { status: 400 });
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return invalid;
  const db = getDb();
  const now = new Date().toISOString();
  // Claiming the token in one UPDATE makes each link single-use even under concurrent requests.
  const [claimed] = await db.update(passwordResetTokens).set({ usedAt: now })
    .where(and(eq(passwordResetTokens.tokenHash, tokenDigest(token)), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, now)))
    .returning();
  if (!claimed) return invalid;
  const [user] = await db.select({ id: appUsers.id }).from(appUsers).where(and(eq(appUsers.id, claimed.userId), eq(appUsers.active, true))).limit(1);
  if (!user) return invalid;
  await db.update(appUsers).set({ passwordHash: hashPassword(newPassword), mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null, updatedAt: now }).where(eq(appUsers.id, user.id));
  await db.delete(authSessions).where(eq(authSessions.userId, user.id));
  await db.delete(passwordResetTokens).where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
