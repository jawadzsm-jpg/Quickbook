import { and, desc, eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { contacts, documentEmails, transactions } from "@/db/schema";
import { requireCompanyAccess } from "@/lib/auth";
import { friendlyEmailError } from "@/lib/email-errors";
import { canEmailDocuments, EMAIL_BODY_MAX, EMAIL_SUBJECT_MAX, MAX_ATTACHMENT_BYTES, MAX_RECIPIENTS, RECIPIENTS_PER_MESSAGE, emailDocumentTypeValues, parseEmailList, recipientBatches, SUPPLIER_DOCUMENT_TYPES } from "@/lib/email-templates";
import { checkDeliveries, emailDeliveryConfigured, sendDocumentEmail } from "@/lib/smtp";
import { emailSignatureFor } from "@/lib/email-signature-server";
import { deliveryLabel, summarizeDelivery, type DeliveryCheck } from "@/lib/email-delivery";
import { publicErrorMessage } from "@/lib/errors";
import { consumeRateLimit } from "@/lib/rate-limit";

// Documents that can be emailed with their PDF: the sales and purchase documents the A4 template prints.
const emailableTypes = new Set([...emailDocumentTypeValues.filter((type) => type !== "any" && type !== "stock list"), "pending invoice"]);
const denied = () => Response.json({ error: "Only accountants and administrators can email documents." }, { status: 403 });
const isVoid = (row: { status: string; voidedAt: string | null }) => Boolean(row.voidedAt) || ["void", "voided", "cancelled", "canceled"].includes(row.status.toLowerCase());
const list = (value: string) => { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; } };

const checksOf = (value: string): DeliveryCheck[] => { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } };

/** What the history shows about delivery: whether turboSMTP can be asked, and the last answer. */
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

async function documentFor(companyId: number, transactionId: number) {
  if (!Number.isSafeInteger(transactionId) || transactionId <= 0) return null;
  const [row] = await getDb().select({ id: transactions.id, type: transactions.type, number: transactions.number, party: transactions.party, status: transactions.status, voidedAt: transactions.voidedAt })
    .from(transactions).where(and(eq(transactions.id, transactionId), eq(transactions.companyId, companyId))).limit(1);
  return row ?? null;
}

/**
 * Addresses to offer for a document: the customer's or supplier's saved email (it may hold several) and the addresses
 * this company emailed that party before, newest first.
 */
async function suggestedAddresses(companyId: number, party: string, type: string) {
  const db = getDb();
  const contactType = SUPPLIER_DOCUMENT_TYPES.includes(type) ? "vendor" : "customer";
  const [saved, earlier] = await Promise.all([
    db.select({ email: contacts.email }).from(contacts).where(and(eq(contacts.companyId, companyId), eq(contacts.type, contactType), or(eq(contacts.name, party), eq(contacts.company, party), eq(contacts.billingName, party)))).limit(5),
    db.select({ recipients: documentEmails.recipients, cc: documentEmails.cc }).from(documentEmails).where(and(eq(documentEmails.companyId, companyId), eq(documentEmails.party, party), eq(documentEmails.status, "sent"))).orderBy(desc(documentEmails.createdAt)).limit(30),
  ]);
  const contact = parseEmailList(saved.map((row) => row.email).join(",")).valid;
  const previous = parseEmailList(earlier.flatMap((row) => [...list(row.recipients), ...list(row.cc)]).join(",")).valid.filter((address) => !contact.includes(address));
  return { contact, previous };
}

/** The document's email history and the addresses to suggest. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const companyId = Number(params.get("companyId"));
  const user = await access(request, companyId);
  if (user instanceof Response) return user;
  try {
    const document = await documentFor(companyId, Number(params.get("transactionId")));
    if (!document) return Response.json({ error: "Document not found." }, { status: 404 });
    const [history, suggestions, configured] = await Promise.all([
      getDb().select().from(documentEmails).where(and(eq(documentEmails.companyId, companyId), eq(documentEmails.transactionId, document.id))).orderBy(desc(documentEmails.createdAt), desc(documentEmails.id)).limit(50),
      suggestedAddresses(companyId, document.party, document.type),
      emailDeliveryConfigured().catch(() => false),
    ]);
    return Response.json({
      configured, suggestions, sender: { name: user.fullName || user.email, email: user.email },
      history: history.map((row) => ({ id: row.id, createdAt: row.createdAt, sentByName: row.sentByName, recipients: list(row.recipients), cc: list(row.cc), subject: row.subject, attachmentName: row.attachmentName, status: row.status, error: row.error, delivery: deliveryOf(row) })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: publicErrorMessage(error, "Could not load the email history.") }, { status: 500 }); }
}

/**
 * Email a document: multipart form with companyId, transactionId, to and cc (addresses separated by commas or new
 * lines), subject, body and an optional `pdf` file. Every send is recorded, including failures.
 */
export async function POST(request: Request) {
  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ error: "The email could not be read. Try again." }, { status: 400 }); }
  const companyId = Number(form.get("companyId"));
  const user = await access(request, companyId, true);
  if (user instanceof Response) return user;
  // Protects the sender reputation and the email plan's quota from a misused account.
  const sendBudget = await consumeRateLimit(`document-email:${user.id}`, 100, 3600);
  if (!sendBudget.allowed) return Response.json({ error: "Too many emails sent in the last hour. Try again later." }, { status: 429, headers: { "Retry-After": String(sendBudget.retryAfter) } });
  const document = await documentFor(companyId, Number(form.get("transactionId")));
  if (!document) return Response.json({ error: "Document not found." }, { status: 404 });
  if (!emailableTypes.has(document.type)) return Response.json({ error: "This document cannot be emailed." }, { status: 400 });
  if (isVoid(document)) return Response.json({ error: "A void document cannot be emailed." }, { status: 409 });

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
  let attachment: { filename: string; content: Buffer } | undefined;
  if (file instanceof File && file.size) {
    if (file.size > MAX_ATTACHMENT_BYTES) return Response.json({ error: "The PDF is larger than 4 MB. Remove large images from the document and try again." }, { status: 413 });
    const content = Buffer.from(await file.arrayBuffer());
    if (content.subarray(0, 5).toString("latin1") !== "%PDF-") return Response.json({ error: "The attachment must be a PDF." }, { status: 400 });
    const filename = (file.name || `${document.number}.pdf`).replace(/[\\/\r\n"]+/g, "_").replace(/\.pdf$/i, "").slice(0, 120) + ".pdf";
    attachment = { filename, content };
  }
  if (!await emailDeliveryConfigured().catch(() => false)) return Response.json({ error: "Emails are not set up yet. An All-Admin can set the email server in Admin Controls → Email server." }, { status: 409 });

  const record = { companyId, transactionId: document.id, sentByUserId: user.id, sentByName: user.fullName || user.email, party: document.party, recipients: JSON.stringify(to.valid), cc: JSON.stringify(ccOnly), subject, attachmentName: attachment?.filename ?? "" };
  try {
    const signature = await emailSignatureFor(companyId, user.id, request);
    const { sent: messages, messageIds } = await sendDocumentEmail({ to: recipientBatches(to.valid), cc: ccOnly, replyTo: user.email ? { name: user.fullName || user.email, address: user.email } : undefined, subject, body, attachment, signature });
    const [saved] = await getDb().insert(documentEmails).values({ ...record, status: "sent", providerMessageIds: JSON.stringify(messageIds) }).returning();
    return Response.json({ ok: true, id: saved.id, messages, recipients: to.valid.length + ccOnly.length });
  } catch (error) {
    const sentMessages = Number((error as { sentMessages?: number }).sentMessages ?? 0);
    const reason = friendlyEmailError(error);
    // The PDF's size helps tell an attachment the server refuses from an account limit.
    const pdfNote = attachment ? ` The attached PDF was ${(attachment.content.length / 1024 / 1024).toFixed(2)} MB; if the email goes through without the PDF, the server is refusing the attachment.` : "";
    const detail = (sentMessages ? `Sent to the first ${sentMessages * RECIPIENTS_PER_MESSAGE} addresses, then: ${reason}` : reason) + pdfNote;
    try { await getDb().insert(documentEmails).values({ ...record, status: "failed", error: detail.slice(0, 1000) }); } catch { /* The person still sees the reason. */ }
    return Response.json({ error: detail }, { status: 502 });
  }
}

/** Check delivery: ask turboSMTP for the latest status of one sent email ({ companyId, id }) and save it. */
export async function PATCH(request: Request) {
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  const companyId = Number(payload.companyId), id = Number(payload.id);
  const user = await access(request, companyId, true);
  if (user instanceof Response) return user;
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: "Select a sent email." }, { status: 400 });
  const [row] = await getDb().select().from(documentEmails).where(and(eq(documentEmails.id, id), eq(documentEmails.companyId, companyId))).limit(1);
  if (!row) return Response.json({ error: "Email not found." }, { status: 404 });
  const ids = list(row.providerMessageIds);
  if (row.status !== "sent" || !ids.length) return Response.json({ error: "Delivery status is available only for emails sent through the turboSMTP API." }, { status: 409 });
  try {
    const summary = summarizeDelivery(await checkDeliveries(ids));
    const [saved] = await getDb().update(documentEmails).set({ deliveryStatus: summary.status, deliveryDetail: JSON.stringify(summary.checks), deliveryCheckedAt: summary.checkedAt }).where(eq(documentEmails.id, row.id)).returning();
    return Response.json({ delivery: deliveryOf(saved) });
  } catch (error) { return Response.json({ error: friendlyEmailError(error, "Could not get the delivery status from turboSMTP.") }, { status: 502 }); }
}
