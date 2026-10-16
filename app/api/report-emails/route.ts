import { requireCompanyAccess } from "@/lib/auth";
import { friendlyEmailError } from "@/lib/email-errors";
import { canEmailDocuments, EMAIL_BODY_MAX, EMAIL_SUBJECT_MAX, MAX_ATTACHMENT_BYTES, MAX_RECIPIENTS, RECIPIENTS_PER_MESSAGE, parseEmailList, recipientBatches, reportEmailParty } from "@/lib/email-templates";
import { emailDeliveryConfigured, sendDocumentEmail } from "@/lib/smtp";
import { rememberAddresses, rememberedAddresses } from "@/lib/email-addresses";
import { emailSignatureFor, savedSignature } from "@/lib/email-signature-server";
import { publicErrorMessage } from "@/lib/errors";
import { consumeRateLimit } from "@/lib/rate-limit";

// Report Center emails: the report's A4 PDF, made in the browser exactly as downloaded. No history is kept: once sent,
// only the addresses are remembered under `party` = "Report · <title>" (lib/email-addresses.ts) for suggestions.
const denied = () => Response.json({ error: "Only accountants and administrators can email reports." }, { status: 403 });
const titleOf = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 180);

async function access(request: Request, companyId: number, mutating = false) {
  const user = await requireCompanyAccess(request, companyId, false, mutating);
  if (user instanceof Response) return user;
  return canEmailDocuments(user.role) ? user : denied();
}

/** Whether email is set up, the sender, and the addresses reports were emailed to before (newest first). */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const companyId = Number(params.get("companyId"));
  const user = await access(request, companyId);
  if (user instanceof Response) return user;
  const title = titleOf(params.get("title"));
  if (!title) return Response.json({ error: "Select a report." }, { status: 400 });
  try {
    const [previous, configured, signature] = await Promise.all([
      rememberedAddresses(companyId),
      emailDeliveryConfigured().catch(() => false),
      savedSignature(companyId, user.id),
    ]);
    return Response.json({
      configured, suggestions: { contact: [], previous }, signatureOn: Boolean(signature?.signature.enabled), sender: { name: user.fullName || user.email, email: user.email },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: publicErrorMessage(error, "Could not load the email details.") }, { status: 500 }); }
}

/**
 * Email a report: multipart form with companyId, title (the report's name), to and cc (addresses separated by commas
 * or new lines), subject, body and the report's `pdf`. Only the addresses of a sent email are kept.
 */
export async function POST(request: Request) {
  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ error: "The email could not be read. Try again." }, { status: 400 }); }
  const companyId = Number(form.get("companyId"));
  const user = await access(request, companyId, true);
  if (user instanceof Response) return user;
  // Shares the hourly budget with document emails: protects the sender reputation and the email plan's quota.
  const sendBudget = await consumeRateLimit(`document-email:${user.id}`, 100, 3600);
  if (!sendBudget.allowed) return Response.json({ error: "Too many emails sent in the last hour. Try again later." }, { status: 429, headers: { "Retry-After": String(sendBudget.retryAfter) } });
  const title = titleOf(form.get("title"));
  if (!title) return Response.json({ error: "Select a report." }, { status: 400 });

  const to = parseEmailList(String(form.get("to") ?? ""));
  const cc = parseEmailList(String(form.get("cc") ?? ""));
  const ccOnly = cc.valid.filter((address) => !to.valid.includes(address));
  const invalid = [...to.invalid, ...cc.invalid];
  if (invalid.length) return Response.json({ error: `Check these email addresses: ${invalid.slice(0, 5).join(", ")}${invalid.length > 5 ? "…" : ""}` }, { status: 400 });
  if (!to.valid.length) return Response.json({ error: "Add at least one email address in To." }, { status: 400 });
  if (to.valid.length + ccOnly.length > MAX_RECIPIENTS) return Response.json({ error: `One email can go to at most ${MAX_RECIPIENTS} addresses.` }, { status: 400 });
  const subject = String(form.get("subject") ?? "").replace(/[\r\n]+/g, " ").trim();
  const body = String(form.get("body") ?? "").replace(/\r\n/g, "\n").trim();
  if (!subject || subject.length > EMAIL_SUBJECT_MAX) return Response.json({ error: `Write a subject (up to ${EMAIL_SUBJECT_MAX} characters).` }, { status: 400 });
  if (!body || body.length > EMAIL_BODY_MAX) return Response.json({ error: "Write the message." }, { status: 400 });

  const file = form.get("pdf");
  if (!(file instanceof File) || !file.size) return Response.json({ error: "The report PDF is missing. Try again." }, { status: 400 });
  if (file.size > MAX_ATTACHMENT_BYTES) return Response.json({ error: "The report PDF is larger than 4 MB. Narrow the filters or period and try again." }, { status: 413 });
  const content = Buffer.from(await file.arrayBuffer());
  if (content.subarray(0, 5).toString("latin1") !== "%PDF-") return Response.json({ error: "The attachment must be a PDF." }, { status: 400 });
  const attachment = { filename: (file.name || `${title}.pdf`).replace(/[\\/\r\n"]+/g, "_").replace(/\.pdf$/i, "").slice(0, 120) + ".pdf", content };
  if (!await emailDeliveryConfigured().catch(() => false)) return Response.json({ error: "Emails are not set up yet. An All-Admin can set the email server in Admin Controls → Email server." }, { status: 409 });

  try {
    const signature = await emailSignatureFor(companyId, user.id, request);
    const { sent: messages } = await sendDocumentEmail({ to: recipientBatches(to.valid), cc: ccOnly, replyTo: user.email ? { name: user.fullName || user.email, address: user.email } : undefined, subject, body, attachment, signature });
    // The email went out; failing to remember its addresses must not report it as failed.
    await rememberAddresses(companyId, reportEmailParty(title), [...to.valid, ...ccOnly]).catch(() => undefined);
    return Response.json({ ok: true, messages, recipients: to.valid.length + ccOnly.length });
  } catch (error) {
    const sentMessages = Number((error as { sentMessages?: number }).sentMessages ?? 0);
    const reason = friendlyEmailError(error);
    const pdfNote = ` The attached PDF was ${(content.length / 1024 / 1024).toFixed(2)} MB.`;
    const detail = (sentMessages ? `Sent to the first ${sentMessages * RECIPIENTS_PER_MESSAGE} addresses, then: ${reason}` : reason) + pdfNote;
    return Response.json({ error: detail }, { status: 502 });
  }
}
