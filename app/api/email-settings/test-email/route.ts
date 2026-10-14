import { requireApiUser } from "@/lib/auth";
import { friendlyEmailError } from "@/lib/email-errors";
import { sendTestEmail } from "@/lib/smtp";
import { latestEmailSignature } from "@/lib/email-signature-server";
import { consumeRateLimit } from "@/lib/rate-limit";

/**
 * Send test email: a real message through the saved settings, always to the signed-in All-Admin's own address, with
 * their email signature (the latest one turned on) so its images can be checked in a real inbox.
 */
export async function POST(request: Request) {
  const user = await requireApiUser(request, true, true);
  if (user instanceof Response) return user;
  if (user.role !== "all_admin") return Response.json({ error: "Only an All-Admin can manage the email server." }, { status: 403 });
  const sendBudget = await consumeRateLimit(`test-email:${user.id}`, 10, 3600);
  if (!sendBudget.allowed) return Response.json({ error: "Too many test emails. Try again in an hour." }, { status: 429, headers: { "Retry-After": String(sendBudget.retryAfter) } });
  try {
    const signature = await latestEmailSignature(user.id, request).catch(() => undefined);
    const { messageIds, signatureImages } = await sendTestEmail(user.email, signature);
    return Response.json({ ok: true, to: user.email, messageIds, signatureCompany: signature?.companyName ?? null, signatureImages });
  } catch (error) {
    return Response.json({ error: friendlyEmailError(error, "The test email could not be sent.") }, { status: 400 });
  }
}
