import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers } from "@/db/schema";
import { verifyPassword, type AppRole } from "@/lib/auth";
import { friendlyEmailError } from "@/lib/email-errors";
import { sendUserInvitation } from "@/lib/smtp";
import { canManage, companyIdsForUser, isCompanyAdmin, outOfScope, requireUserManager, roleNames } from "@/lib/user-management";

/** Send email again: re-send the login email with the temporary password just shown to the administrator. Only while it
 * is still this active user's unchanged temporary password; nothing about the user changes. */
export async function POST(request: Request) {
  const administrator = await requireUserManager(request, true);
  if (administrator instanceof Response) return administrator;
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Select a valid user." }, { status: 400 });
  const [target] = await getDb().select().from(appUsers).where(eq(appUsers.id, id)).limit(1);
  if (!target) return Response.json({ error: "User not found." }, { status: 404 });
  const targetRole = target.role as AppRole;
  if (isCompanyAdmin(administrator) && !canManage(administrator, targetRole, await companyIdsForUser(id))) return outOfScope();
  const password = String(payload.password ?? "");
  if (!target.active || !target.mustChangePassword || !verifyPassword(password, target.passwordHash)) return Response.json({ error: "This temporary password is no longer valid. Reset the password to send new login details." }, { status: 409 });
  try {
    await sendUserInvitation({ to: target.email, name: target.fullName || target.email, temporaryPassword: password, roleLabel: roleNames[targetRole], loginUrl: process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin });
    return Response.json({ emailSent: true, emailWarning: "" });
  } catch (error) { return Response.json({ emailSent: false, emailWarning: friendlyEmailError(error) }); }
}
