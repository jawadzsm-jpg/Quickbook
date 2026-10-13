import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, emailListContacts } from "@/db/schema";
import { requireCompanyAccess } from "@/lib/auth";
import { friendlyEmailError } from "@/lib/email-errors";
import { canUseEmailList, emailListLabel, INVENTORY_EMAIL_MAX_RECIPIENTS, isEmailListType } from "@/lib/email-lists";
import { EMAIL_BODY_MAX, EMAIL_SUBJECT_MAX, RECIPIENTS_PER_MESSAGE, recipientBatches } from "@/lib/email-templates";
import { emailDeliveryConfigured, sendDocumentEmail } from "@/lib/smtp";
import { consumeRateLimit } from "@/lib/rate-limit";

// Inventory Overview email: the selected stock written into a message and sent to chosen addresses of the company's
// Sales or Purchase list. Recipients are Bcc'd in batches so they never see each other; replies go to the sender.

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/** POST { companyId, type: "sales" | "purchase", contactIds, subject, body }. */
export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return json({ error: "Invalid request." }, 400); }
  const companyId = Number(payload.companyId);
  const user = await requireCompanyAccess(request, companyId, false, true);
  if (user instanceof Response) return user;
  const type = payload.type;
  if (!isEmailListType(type)) return json({ error: "Choose the Sales or Purchase list." }, 400);
  if (!canUseEmailList(user.role, type)) return json({ error: `Your role cannot use the ${emailListLabel(type)}.` }, 403);
  const ids = [...new Set((Array.isArray(payload.contactIds) ? payload.contactIds : []).map(Number))].filter((id) => Number.isSafeInteger(id) && id > 0);
  if (!ids.length) return json({ error: "Select at least one email address." }, 400);
  if (ids.length > INVENTORY_EMAIL_MAX_RECIPIENTS) return json({ error: `One email can go to at most ${INVENTORY_EMAIL_MAX_RECIPIENTS} addresses.` }, 400);
  const subject = String(payload.subject ?? "").replace(/[\r\n]+/g, " ").trim();
  const body = String(payload.body ?? "").replace(/\r\n/g, "\n").trim();
  if (!subject || subject.length > EMAIL_SUBJECT_MAX) return json({ error: `Write a subject (up to ${EMAIL_SUBJECT_MAX} characters).` }, 400);
  if (!body || body.length > EMAIL_BODY_MAX) return json({ error: `Write the message (up to ${EMAIL_BODY_MAX.toLocaleString("en")} characters).` }, 400);
  // Protects the sender reputation and the email plan's quota from a misused account.
  const budget = await consumeRateLimit(`inventory-email:${user.id}`, 20, 3600);
  if (!budget.allowed) return json({ error: "Too many stock emails sent in the last hour. Try again later." }, 429);

  const db = getDb();
  const rows = await db.select({ email: emailListContacts.email }).from(emailListContacts)
    .where(and(eq(emailListContacts.companyId, companyId), eq(emailListContacts.listType, type), inArray(emailListContacts.id, ids)));
  const recipients = [...new Set(rows.map((row) => row.email.toLowerCase()))];
  if (!recipients.length) return json({ error: "The selected addresses are no longer in the list." }, 404);
  if (!await emailDeliveryConfigured().catch(() => false)) return json({ error: "Emails are not set up yet. An All-Admin can set the email server in Admin Controls → Email server." }, 409);

  try {
    const { sent } = await sendDocumentEmail({ to: recipientBatches(recipients), cc: [], hidden: true, replyTo: user.email ? { name: user.fullName || user.email, address: user.email } : undefined, subject, body });
    await db.insert(auditLog).values({ companyId, action: "sent", entityType: "inventory_email", entityId: 0, details: `Stock email "${subject.slice(0, 120)}" sent to ${recipients.length} address(es) of the ${emailListLabel(type)} by ${user.email}` });
    return json({ ok: true, recipients: recipients.length, messages: sent });
  } catch (error) {
    const sentMessages = Number((error as { sentMessages?: number }).sentMessages ?? 0);
    const reason = friendlyEmailError(error);
    return json({ error: sentMessages ? `Sent to the first ${sentMessages * RECIPIENTS_PER_MESSAGE} addresses, then: ${reason}` : reason }, 502);
  }
}
