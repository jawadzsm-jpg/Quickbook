import { and, desc, eq, isNull, like } from "drizzle-orm";
import { getDb } from "@/db";
import { documentEmails } from "@/db/schema";
import { requireCompanyAccess } from "@/lib/auth";
import { friendlyEmailError } from "@/lib/email-errors";
import { canEmailDocuments, EMAIL_BODY_MAX, EMAIL_SUBJECT_MAX, MAX_ATTACHMENT_BYTES, MAX_RECIPIENTS, RECIPIENTS_PER_MESSAGE, parseEmailList, recipientBatches, REPORT_EMAIL_PREFIX, reportEmailParty } from "@/lib/email-templates";
import { emailDeliveryConfigured, sendDocumentEmail } from "@/lib/smtp";
import { emailSignatureFor, savedSignature } from "@/lib/email-signature-server";
import { deliveryLabel, type DeliveryCheck } from "@/lib/email-delivery";
import { publicErrorMessage } from "@/lib/errors";
import { consumeRateLimit } from "@/lib/rate-limit";

// Report Center emails: the report's A4 PDF, made in the browser exactly as downloaded. They are kept in document_emails
// without a document (transaction_id null) and with `party` = "Report · <title>", so each report has its own history.
// Delivery checks use PATCH /api/document-emails, which works on any row of the company.
const denied = () => Response.json({ error: "Only accountants and administrators can email reports." }, { status: 403 });
const list = (value: string) => { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; } };
const checksOf = (value: string): DeliveryCheck[] => { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } };
const titleOf = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 180);

function deliveryOf(row: typeof documentEmails.$inferSelect) {
  const canCheck = row.status === "sent" && list(row.providerMessageIds).length > 0;
  if (!canCheck) return { canCheck, status: "", label: "", tone: "unknown", checks: [], checkedAt: null };
  return { canCheck, status: row.deliveryStatus, ...(row.deliveryStatus ? deliveryLabel(row.deliveryStatus) : { label: "", tone: "unknown" }), checks: checksOf(row.deliveryDetail), checkedAt: row.deliveryCheckedAt };
}

async function access(request: Request, companyId: number, mutating = false) {
  const user = await requireCompanyAccess(request, companyId, false, mutating);
  if (user instanceof Response) return user;
  return canEmailDocuments(user.role) ? user : denied();
}

/** This report's email history and the addresses reports were emailed to before (newest first). */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const companyId = Number(params.get("companyId"));
  const user = await access(request, companyId);
  if (user instanceof Response) return user;
  const title = titleOf(params.get("title"));
  if (!title) return Response.json({ error: "Select a report." }, { status: 400 });
  try {
    const db = getDb();
    const reportRows = and(eq(documentEmails.companyId, companyId), isNull(documentEmails.transactionId));
    const [history, earlier, configured, signature] = await Promise.all([
      db.select().from(documentEmails).where(and(reportRows, eq(documentEmails.party, reportEmailParty(title)))).orderBy(desc(documentEmails.createdAt), desc(documentEmails.id)).limit(50),
      db.select({ recipients: documentEmails.recipients, cc: documentEmails.cc }).from(documentEmails).where(and(reportRows, like(documentEmails.party, `${REPORT_EMAIL_PREFIX}%`), eq(documentEmails.status, "sent"))).orderBy(desc(documentEmails.createdAt)).limit(40),
      emailDeliveryConfigured().catch(() => false),
      savedSignature(companyId, user.id),
    ]);
    const previous = parseEmailList(earlier.flatMap((row) => [...list(row.recipients), ...list(row.cc)]).join(",")).valid;
    return Response.json({
      configured, suggestions: { contact: [], previous }, signatureOn: Boolean(signature?.signature.enabled), sender: { name: user.fullName || user.email, email: user.email },
      history: history.map((row) => ({ id: row.id, createdAt: row.createdAt, sentByName: row.sentByName, recipients: list(row.recipients), cc: list(row.cc), subject: row.subject, attachmentName: row.attachmentName, status: row.status, error: row.error, delivery: deliveryOf(row) })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: publicErrorMessage(error, "Could not load the email history.") }, { status: 500 }); }
}

/**
 * Email a report: multipart form with companyId, title (the report's name), to and cc (addresses separated by commas
 * or new lines), subject, body and the report's `pdf`. Every send is recorded, including failures.
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

  const record = { companyId, transactionId: null, sentByUserId: user.id, sentByName: user.fullName || user.email, party: reportEmailParty(title), recipients: JSON.stringify(to.valid), cc: JSON.stringify(ccOnly), subject, attachmentName: attachment.filename };
  try {
    const signature = await emailSignatureFor(companyId, user.id, request);
    const { sent: messages, messageIds } = await sendDocumentEmail({ to: recipientBatches(to.valid), cc: ccOnly, replyTo: user.email ? { name: user.fullName || user.email, address: user.email } : undefined, subject, body, attachment, signature });
    const [saved] = await getDb().insert(documentEmails).values({ ...record, status: "sent", providerMessageIds: JSON.stringify(messageIds) }).returning();
    return Response.json({ ok: true, id: saved.id, messages, recipients: to.valid.length + ccOnly.length });
  } catch (error) {
    const sentMessages = Number((error as { sentMessages?: number }).sentMessages ?? 0);
    const reason = friendlyEmailError(error);
    const pdfNote = ` The attached PDF was ${(content.length / 1024 / 1024).toFixed(2)} MB.`;
    const detail = (sentMessages ? `Sent to the first ${sentMessages * RECIPIENTS_PER_MESSAGE} addresses, then: ${reason}` : reason) + pdfNote;
    try { await getDb().insert(documentEmails).values({ ...record, status: "failed", error: detail.slice(0, 1000) }); } catch { /* The person still sees the reason. */ }
    return Response.json({ error: detail }, { status: 502 });
  }
}
