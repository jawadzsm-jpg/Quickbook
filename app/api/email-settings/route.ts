import { isValidEmail } from "@/lib/email-validation";
import { getEmailSettings, saveEmailSettings, verifySmtpConnection } from "@/lib/smtp";
import { requireApiUser } from "@/lib/auth";
import { friendlyEmailError } from "@/lib/email-errors";

// SMTP settings are shared by every company, so only an All-Admin may read or change them.
async function requireAllAdmin(request: Request, mutating = false) {
  const user = await requireApiUser(request, true, mutating);
  if (user instanceof Response) return user;
  return user.role === "all_admin" ? user : Response.json({ error: "Only an All-Admin can manage the email server." }, { status: 403 });
}


export async function GET(request: Request) {
  const administrator = await requireAllAdmin(request);
  if (administrator instanceof Response) return administrator;
  const settings = await getEmailSettings();
  return Response.json({ testRecipient: administrator.email, settings: settings ? {
    provider: settings.provider, apiRegion: settings.apiRegion, host: settings.host, port: settings.port, secure: settings.secure, username: settings.username,
    fromName: settings.fromName, fromEmail: settings.fromEmail, passwordConfigured: Boolean(settings.passwordEncrypted),
  } : { provider: "smtp", apiRegion: "global", host: "smtp.gmail.com", port: 465, secure: true, username: "", fromName: "ComNet Accounting", fromEmail: "", passwordConfigured: false } }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const administrator = await requireAllAdmin(request, true);
  if (administrator instanceof Response) return administrator;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const provider = payload.provider === "turbosmtp_api" ? "turbosmtp_api" : "smtp";
    const apiRegion = payload.apiRegion === "eu" ? "eu" : "global";
    // The turboSMTP API needs no host or port; keep the saved SMTP values so switching back is easy.
    const host = provider === "smtp" ? String(payload.host ?? "").trim() : String(payload.host ?? "").trim() || "pro.turbo-smtp.com";
    const port = provider === "smtp" ? Number(payload.port) : Number(payload.port) || 465;
    const secure = payload.secure === true;
    const username = String(payload.username ?? "").trim();
    const password = String(payload.password ?? "");
    const fromName = String(payload.fromName ?? "ComNet Accounting").trim();
    const fromEmail = String(payload.fromEmail ?? "").trim().toLowerCase();
    if (provider === "turbosmtp_api" && (!username || !fromName || !isValidEmail(fromEmail))) return Response.json({ error: "Complete the turboSMTP consumer key, sender name and sender email." }, { status: 400 });
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !username || !fromName || !isValidEmail(fromEmail)) return Response.json({ error: "Complete the SMTP server, port, username, sender name and sender email." }, { status: 400 });
    const current = await getEmailSettings();
    // A saved secret belongs to the method it was entered for: switching method needs the new password or secret.
    const keepsSecret = Boolean(current?.passwordEncrypted) && (current?.provider ?? "smtp") === provider;
    if (!password && !keepsSecret) return Response.json({ error: provider === "turbosmtp_api" ? "Enter the turboSMTP consumer secret." : "Enter the SMTP password or app password." }, { status: 400 });
    await saveEmailSettings({ provider, apiRegion, host, port, secure, username, ...(password ? { password } : {}), fromName, fromEmail });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save SMTP settings." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const administrator = await requireAllAdmin(request, true);
  if (administrator instanceof Response) return administrator;
  try {
    await verifySmtpConnection();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: friendlyEmailError(error, "SMTP connection failed.") }, { status: 400 });
  }
}
