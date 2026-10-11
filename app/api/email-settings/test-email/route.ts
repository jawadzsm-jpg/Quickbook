import { requireApiUser } from "@/lib/auth";
import { friendlyEmailError } from "@/lib/email-errors";
import { sendTestEmail } from "@/lib/smtp";

/** Send test email: a real message through the saved settings, always to the signed-in All-Admin's own address. */
export async function POST(request: Request) {
  const user = await requireApiUser(request, true, true);
  if (user instanceof Response) return user;
  if (user.role !== "all_admin") return Response.json({ error: "Only an All-Admin can manage the email server." }, { status: 403 });
  try {
    await sendTestEmail(user.email);
    return Response.json({ ok: true, to: user.email });
  } catch (error) {
    return Response.json({ error: friendlyEmailError(error, "The test email could not be sent.") }, { status: 400 });
  }
}
