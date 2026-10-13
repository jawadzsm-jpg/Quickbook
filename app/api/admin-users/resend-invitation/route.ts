import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers } from "@/db/schema";
import { verifyPassword, type AppRole } from "@/lib/auth";
import { friendlyEmailError } from "@/lib/email-errors";
import { sendUserInvitation } from "@/lib/smtp";
import { canManage, companyIdsForUser, isCompanyAdmin, outOfScope, requireUserManager, roleNames } from "@/lib/user-management";
import { appBaseUrl } from "@/lib/app-url";
import { consumeRateLimit } from "@/lib/rate-limit";

/** Send email again: re-send the login email with the temporary password just shown to the administrator. Only while it
 * is still this active user's unchanged temporary password; nothing about the user changes. */
export async function POST(request: Request) {
  const administrator = await requireUserManager(request, true);
  if (administrator instanceof Response) return administrator;
  const sendBudget = await consumeRateLimit(`invite-email:${administrator.id}`, 30, 3600);
  if (!sendBudget.allowed) return Response.json({ error: "Too many login emails. Try again in an hour." }, { status: 429, headers: { "Retry-After": String(sendBudget.retryAfter) } });
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Select a valid user." }, { status: 400 });
  const [target] = await getDb().select().from(appUsers).where(eq(appUsers.id, id)).limit(1);
  if (!target) return Response.json({ error: "User not found." }, { status: 404 });
  const targetRole = target.role as AppRole;
  if (isCompanyAdmin(administrator) && !canManage(administrator, targetRole, await companyIdsForUser(id))) return outOfScope();
  const password = String(payload.password ?? "");
  if (!target.active || !target.mustChangePassword || !(await verifyPassword(password, target.passwordHash))) return Response.json({ error: "This temporary password is no longer valid. Reset the password to send new login details." }, { status: 409 });
  try {
    await sendUserInvitation({ to: target.email, name: target.fullName || target.email, temporaryPassword: password, roleLabel: roleNames[targetRole], loginUrl: appBaseUrl(request) });
    return Response.json({ emailSent: true, emailWarning: "" });
  } catch (error) { return Response.json({ emailSent: false, emailWarning: friendlyEmailError(error, undefined, { loginDetails: true }) }); }
}
